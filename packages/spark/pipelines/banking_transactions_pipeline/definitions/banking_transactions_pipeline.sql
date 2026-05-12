CREATE TEMPORARY VIEW bronze_transactions_raw
AS
SELECT *
FROM json.`s3a://bronze/banking/transactions/raw/transactions.jsonl`;

CREATE TEMPORARY VIEW silver_transactions_cleaned_base
AS
SELECT
  CAST(transaction_id AS BIGINT)     AS transaction_id,
  CAST(account_id AS BIGINT)         AS account_id,
  CAST(customer_id AS BIGINT)        AS customer_id,
  ROUND(CAST(amount AS DOUBLE), 2)   AS amount,
  UPPER(currency)                    AS currency,
  UPPER(merchant_category)           AS merchant_category,
  UPPER(country_code)                AS country_code,
  TO_TIMESTAMP(timestamp)            AS timestamp,
  UPPER(transaction_type)            AS transaction_type,
  UPPER(status)                      AS status,
  UPPER(channel)                     AS channel,
  TO_DATE(TO_TIMESTAMP(timestamp))   AS transaction_date
FROM bronze_transactions_raw
WHERE UPPER(status) IN ('COMPLETED', 'PENDING')
  AND CAST(amount AS DOUBLE) > 0;

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
