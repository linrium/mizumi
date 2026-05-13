import dagster as dg

# Runs at 02:00 UTC daily — refreshes the silver layer and Spark gold marts.
banking_daily_batch = dg.define_asset_job(
    name="banking_daily_batch",
    selection=dg.AssetSelection.assets(
        "bronze_transactions",
        "banking_silver_card_payment_events",
        "banking_gold_risk_detection",
        "banking_gold_merchant_revenue",
        "banking_gold_user_spend",
    ),
)

banking_daily_schedule = dg.ScheduleDefinition(
    name="banking_daily_schedule",
    cron_schedule="0 2 * * *",
    job=banking_daily_batch,
)


# Runs every hour — lightweight risk scoring and distributed fraud pattern analysis
banking_hourly_risk = dg.define_asset_job(
    name="banking_hourly_risk",
    selection=dg.AssetSelection.assets(
        "banking_gold_customer_risk_scores",
        "banking_gold_fraud_pattern_analysis",
    ),
)


banking_hourly_schedule = dg.ScheduleDefinition(
    name="banking_hourly_schedule",
    cron_schedule="0 * * * *",
    job=banking_hourly_risk,
)
