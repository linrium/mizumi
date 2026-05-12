-- Source: streaming transactions landing in silver from Kafka
CREATE TEMPORARY VIEW bronze_transactions_raw
AS
SELECT
  transaction_id,
  account_id,
  customer_id,
  amount,
  currency,
  merchant_category,
  country_code,
  timestamp,
  transaction_type,
  status,
  channel,
  TO_DATE(timestamp) AS transaction_date
FROM delta.`s3a://silver/banking/streaming`;

CREATE TEMPORARY VIEW silver_transactions_cleaned_base
AS
SELECT *
FROM bronze_transactions_raw
WHERE status IN ('COMPLETED', 'PENDING')
  AND amount > 0;

CREATE MATERIALIZED VIEW silver_transactions
USING delta
AS
SELECT
  transaction_id,
  account_id,
  customer_id,
  amount,
  currency,
  merchant_category,
  country_code,
  timestamp,
  transaction_type,
  status,
  channel,
  transaction_date,
  CURRENT_TIMESTAMP() AS processed_at
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY transaction_id ORDER BY timestamp DESC) AS row_num
  FROM silver_transactions_cleaned_base
)
WHERE row_num = 1;

CREATE MATERIALIZED VIEW gold_daily_transaction_summary
USING delta
AS
SELECT
  transaction_date,
  country_code,
  channel,
  COUNT(*)                          AS transaction_count,
  COUNT(DISTINCT account_id)        AS active_accounts,
  ROUND(SUM(amount), 2)             AS total_volume,
  ROUND(AVG(amount), 2)             AS avg_transaction_amount,
  COUNT(DISTINCT customer_id)       AS active_customers
FROM silver_transactions
GROUP BY transaction_date, country_code, channel;
