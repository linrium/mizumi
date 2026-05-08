CREATE TEMPORARY VIEW bronze_orders_raw
AS
SELECT *
FROM json.`s3a://bronze/orders/raw/orders.jsonl`;

CREATE TEMPORARY VIEW silver_orders_cleaned_base
AS
SELECT
  CAST(order_id AS BIGINT) AS order_id,
  CAST(customer_id AS BIGINT) AS customer_id,
  UPPER(country) AS country_code,
  UPPER(status) AS status,
  CAST(quantity AS INT) AS quantity,
  CAST(unit_price AS DOUBLE) AS unit_price,
  TO_TIMESTAMP(ordered_at) AS ordered_at,
  TO_DATE(TO_TIMESTAMP(ordered_at)) AS order_date,
  ROUND(CAST(quantity AS DOUBLE) * CAST(unit_price AS DOUBLE), 2) AS gross_amount
FROM bronze_orders_raw
WHERE UPPER(status) IN ('PAID', 'SHIPPED', 'DELIVERED');

CREATE MATERIALIZED VIEW silver_orders
AS
SELECT
  order_id,
  customer_id,
  country_code,
  status,
  quantity,
  unit_price,
  ordered_at,
  order_date,
  gross_amount,
  CURRENT_TIMESTAMP() AS processed_at
FROM (
  SELECT
    *,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY ordered_at DESC) AS row_num
  FROM silver_orders_cleaned_base
)
WHERE row_num = 1;

CREATE MATERIALIZED VIEW gold_daily_country_sales
AS
SELECT
  order_date,
  country_code,
  COUNT(*) AS order_count,
  ROUND(SUM(gross_amount), 2) AS gross_revenue,
  COUNT(DISTINCT customer_id) AS active_customers
FROM silver_orders
GROUP BY order_date, country_code;
