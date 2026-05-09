-- Source: raw orders from bronze layer
CREATE TEMPORARY VIEW bronze_orders_raw
AS
SELECT *
FROM json.`s3a://bronze/orders/raw/orders.jsonl`;

-- Cleaned, deduplicated orders for customer analysis
CREATE MATERIALIZED VIEW silver_customers
AS
SELECT
  CAST(order_id AS BIGINT)                                       AS order_id,
  CAST(customer_id AS BIGINT)                                    AS customer_id,
  UPPER(country)                                                 AS country_code,
  UPPER(status)                                                  AS status,
  CAST(quantity AS INT)                                          AS quantity,
  CAST(unit_price AS DOUBLE)                                     AS unit_price,
  ROUND(CAST(quantity AS DOUBLE) * CAST(unit_price AS DOUBLE), 2) AS gross_amount,
  TO_DATE(TO_TIMESTAMP(ordered_at))                              AS order_date
FROM (
  SELECT *,
    ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY ordered_at DESC) AS rn
  FROM bronze_orders_raw
  WHERE UPPER(status) IN ('PAID', 'SHIPPED', 'DELIVERED')
)
WHERE rn = 1;

-- Customer lifetime value with tier segmentation
CREATE MATERIALIZED VIEW gold_customer_ltv
AS
SELECT
  customer_id,
  country_code,
  COUNT(*)                             AS order_count,
  ROUND(SUM(gross_amount), 2)          AS total_revenue,
  ROUND(AVG(gross_amount), 2)          AS avg_order_value,
  DATEDIFF(CURRENT_DATE(), MAX(order_date)) AS days_since_last_order,
  CASE
    WHEN SUM(gross_amount) >= 5000 THEN 'platinum'
    WHEN SUM(gross_amount) >= 1000 THEN 'gold'
    WHEN SUM(gross_amount) >= 200  THEN 'silver'
    ELSE 'bronze'
  END                                  AS ltv_tier
FROM silver_customers
GROUP BY customer_id, country_code;
