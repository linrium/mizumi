use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    adapters::outbound::postgres::teams,
    domain::{
        entities::team::{AddMemberBody, CreateTeamBody, Team, TeamMember},
        error::AppError,
    },
};

#[derive(Clone)]
pub struct TeamService {
    db: PgPool,
}

impl TeamService {
    pub fn new(db: PgPool) -> Self {
        Self { db }
    }

    pub async fn list_teams(&self) -> Result<Vec<Team>, AppError> {
        Ok(teams::list(&self.db).await?)
    }

    pub async fn get_team(&self, id: Uuid) -> Result<Team, AppError> {
        teams::get(&self.db, id).await?.ok_or(AppError::NotFound)
    }

    pub async fn create_team(&self, body: CreateTeamBody) -> Result<Team, AppError> {
        let name = body.name.trim().to_string();
        if name.is_empty() {
            return Err(AppError::QueryFailed("team name cannot be empty".into()));
        }
        teams::create(&self.db, &name).await.map_err(|e| {
            if let sqlx::Error::Database(ref db_err) = e {
                if db_err.is_unique_violation() {
                    return AppError::Conflict(format!("team '{name}' already exists"));
                }
            }
            AppError::Sqlx(e)
        })
    }

    pub async fn list_members(&self, team_id: Uuid) -> Result<Vec<TeamMember>, AppError> {
        teams::get(&self.db, team_id)
            .await?
            .ok_or(AppError::NotFound)?;
        Ok(teams::list_members(&self.db, team_id).await?)
    }

    pub async fn add_member(
        &self,
        team_id: Uuid,
        body: AddMemberBody,
    ) -> Result<TeamMember, AppError> {
        teams::get(&self.db, team_id)
            .await?
            .ok_or(AppError::NotFound)?;
        teams::add_member(&self.db, team_id, body.user_id)
            .await
            .map_err(|e| {
                if let sqlx::Error::Database(ref db_err) = e {
                    if db_err.is_unique_violation() {
                        return AppError::Conflict("user is already a member of this team".into());
                    }
                }
                AppError::Sqlx(e)
            })
    }

    pub async fn remove_member(&self, team_id: Uuid, user_id: Uuid) -> Result<(), AppError> {
        let removed = teams::remove_member(&self.db, team_id, user_id).await?;
        if !removed {
            return Err(AppError::NotFound);
        }
        Ok(())
    }
}
