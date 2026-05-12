-- Source from silver layer
CREATE TEMPORARY VIEW silver_transactions
AS
SELECT *
FROM delta.`s3a://gold/banking/sdp-warehouse/silver_transactions`;

-- AML: structuring detection — transactions just below common reporting thresholds
-- Customers with >= 3 transactions between $8,000-$9,999 in the same day (below $10k threshold)
CREATE MATERIALIZED VIEW gold_aml_structuring_alerts
USING delta
AS
WITH near_threshold AS (
  SELECT
    customer_id,
    account_id,
    transaction_date,
    COUNT(*)                       AS tx_count,
    ROUND(SUM(amount), 2)          AS total_amount,
    ROUND(AVG(amount), 2)          AS avg_amount,
    MIN(timestamp)                 AS first_tx_time,
    MAX(timestamp)                 AS last_tx_time
  FROM silver_transactions
  WHERE amount BETWEEN 8000 AND 9999
    AND transaction_type IN ('DEBIT', 'TRANSFER')
  GROUP BY customer_id, account_id, transaction_date
  HAVING COUNT(*) >= 3
)
SELECT
  *,
  ROUND(
    (UNIX_TIMESTAMP(last_tx_time) - UNIX_TIMESTAMP(first_tx_time)) / 3600,
    2
  ) AS hours_span,
  'STRUCTURING' AS alert_type,
  CURRENT_TIMESTAMP() AS detected_at
FROM near_threshold;

-- AML: rapid transaction sequences — >= 5 transactions within 10 minutes
CREATE MATERIALIZED VIEW gold_aml_rapid_sequences
USING delta
AS
WITH windowed AS (
  SELECT
    account_id,
    customer_id,
    timestamp,
    COUNT(*) OVER (
      PARTITION BY account_id
      ORDER BY CAST(timestamp AS LONG)
      RANGE BETWEEN 600 PRECEDING AND CURRENT ROW
    ) AS tx_in_10min,
    ROUND(SUM(amount) OVER (
      PARTITION BY account_id
      ORDER BY CAST(timestamp AS LONG)
      RANGE BETWEEN 600 PRECEDING AND CURRENT ROW
    ), 2) AS amount_in_10min
  FROM silver_transactions
)
SELECT DISTINCT
  account_id,
  customer_id,
  DATE(timestamp)        AS alert_date,
  MAX(tx_in_10min)       AS max_tx_in_10min,
  MAX(amount_in_10min)   AS max_amount_in_10min,
  'RAPID_SEQUENCE'       AS alert_type,
  CURRENT_TIMESTAMP()    AS detected_at
FROM windowed
WHERE tx_in_10min >= 5
GROUP BY account_id, customer_id, DATE(timestamp);

-- Monthly revenue from fees by merchant category
CREATE MATERIALIZED VIEW gold_monthly_revenue_by_category
USING delta
AS
SELECT
  DATE_TRUNC('MONTH', transaction_date)  AS month_start,
  merchant_category,
  country_code,
  COUNT(*)                               AS transaction_count,
  COUNT(DISTINCT customer_id)            AS unique_customers,
  ROUND(SUM(amount), 2)                  AS total_volume,
  ROUND(AVG(amount), 2)                  AS avg_amount
FROM silver_transactions
GROUP BY DATE_TRUNC('MONTH', transaction_date), merchant_category, country_code;
