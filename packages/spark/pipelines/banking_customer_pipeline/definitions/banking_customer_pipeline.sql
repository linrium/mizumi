-- Source from silver layer
CREATE TEMPORARY VIEW silver_transactions
AS
SELECT *
FROM delta.`s3a://gold/banking/sdp-warehouse/silver_transactions`;

-- Customer banking profile with account diversity and channel behavior
CREATE MATERIALIZED VIEW gold_customer_banking_profile
USING delta
AS
SELECT
  customer_id,
  COUNT(DISTINCT account_id)                                     AS account_count,
  COUNT(*)                                                       AS total_transactions,
  ROUND(SUM(amount), 2)                                          AS total_volume,
  ROUND(AVG(amount), 2)                                          AS avg_transaction_amount,
  COUNT(DISTINCT country_code)                                   AS countries_active,
  COUNT(DISTINCT merchant_category)                              AS merchant_categories_used,
  DATEDIFF(CURRENT_DATE(), MAX(transaction_date))                AS days_since_last_tx,
  DATEDIFF(MAX(transaction_date), MIN(transaction_date))         AS customer_tenure_days,
  -- Preferred channel (mode approximation: highest count)
  FIRST_VALUE(channel) OVER (
    PARTITION BY customer_id
    ORDER BY COUNT(channel) OVER (PARTITION BY customer_id, channel) DESC
  )                                                              AS preferred_channel,
  -- Risk tier based on volume and cross-border activity
  CASE
    WHEN SUM(amount) >= 500000 AND COUNT(DISTINCT country_code) > 3 THEN 'HIGH'
    WHEN SUM(amount) >= 100000 OR COUNT(DISTINCT country_code) > 5 THEN 'MEDIUM'
    ELSE 'LOW'
  END                                                            AS risk_tier
FROM silver_transactions
GROUP BY customer_id;

-- Customer channel usage breakdown for cross-sell targeting
CREATE MATERIALIZED VIEW gold_customer_channel_usage
USING delta
AS
SELECT
  customer_id,
  channel,
  COUNT(*)                          AS transaction_count,
  ROUND(SUM(amount), 2)             AS total_volume,
  ROUND(AVG(amount), 2)             AS avg_amount,
  MIN(transaction_date)             AS first_use_date,
  MAX(transaction_date)             AS last_use_date
FROM silver_transactions
GROUP BY customer_id, channel;
