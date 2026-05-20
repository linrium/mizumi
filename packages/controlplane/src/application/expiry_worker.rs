use std::time::Duration;

use sqlx::PgPool;
use tokio::task::JoinHandle;
use tokio::time::MissedTickBehavior;

use crate::adapters::outbound::postgres::time_bound_grants;
use crate::application::uc_service::UnityCatalogProxyService;

const TICK_INTERVAL_SECS: u64 = 300; // 5 minutes
const OVERDUE_BATCH_SIZE: i64 = 100;

pub struct ExpiryWorker {
    db: PgPool,
    uc_service: UnityCatalogProxyService,
}

impl ExpiryWorker {
    pub fn new(db: PgPool, uc_service: UnityCatalogProxyService) -> Self {
        Self { db, uc_service }
    }

    /// Spawn the worker as a background Tokio task and return its handle.
    /// The handle is intentionally detached — the worker runs for the lifetime
    /// of the process and failures per-tick are logged but never propagate.
    pub fn start(self) -> JoinHandle<()> {
        tokio::spawn(async move {
            let mut interval =
                tokio::time::interval(Duration::from_secs(TICK_INTERVAL_SECS));
            interval.set_missed_tick_behavior(MissedTickBehavior::Skip);

            loop {
                interval.tick().await;
                self.tick().await;
            }
        })
    }

    async fn tick(&self) {
        // Phase 1: promote healthy → expiring for grants expiring within 7 days.
        match time_bound_grants::mark_expiring_soon(&self.db).await {
            Ok(count) if count > 0 => tracing::info!(
                count,
                "expiry-worker: promoted grants to 'expiring'"
            ),
            Ok(_) => {}
            Err(e) => tracing::warn!(error = %e, "expiry-worker: mark_expiring_soon failed"),
        }

        // Phase 2: expire overdue grants (best-effort batch).
        let overdue = match time_bound_grants::list_overdue(&self.db, OVERDUE_BATCH_SIZE).await {
            Ok(rows) => rows,
            Err(e) => {
                tracing::warn!(error = %e, "expiry-worker: list_overdue failed");
                return;
            }
        };

        if overdue.is_empty() {
            return;
        }

        tracing::info!(count = overdue.len(), "expiry-worker: processing overdue grants");

        let mut expired_count = 0u32;
        let mut uc_error_count = 0u32;

        for grant in &overdue {
            // Skip UC revoke for seed/demo rows that have no real UC grant.
            let skip_uc = grant.source_request_id.is_none() && grant.scope.is_empty();

            if !skip_uc {
                if let Err(e) = self
                    .uc_service
                    .revoke_permissions(
                        &grant.scope,
                        &grant.resource,
                        &grant.principal,
                        &[grant.privilege.clone()],
                    )
                    .await
                {
                    // Log the UC failure but continue to mark the grant expired.
                    // The access has passed its authorised expiry; revocation failures
                    // are reported so operators can investigate, but should not block
                    // the governance record from being closed.
                    tracing::warn!(
                        grant_id = %grant.id,
                        principal = %grant.principal,
                        resource = %grant.resource,
                        privilege = %grant.privilege,
                        error = %e,
                        "expiry-worker: UC revoke failed — marking expired anyway"
                    );
                    uc_error_count += 1;
                }
            }

            match time_bound_grants::expire(&self.db, grant.id).await {
                Ok(true) => expired_count += 1,
                Ok(false) => {
                    // Grant was concurrently renewed or revoked — skip silently.
                }
                Err(e) => tracing::warn!(
                    grant_id = %grant.id,
                    error = %e,
                    "expiry-worker: DB expire failed"
                ),
            }
        }

        tracing::info!(
            expired = expired_count,
            uc_errors = uc_error_count,
            "expiry-worker: tick complete"
        );
    }
}
