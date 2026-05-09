-- Source: raw orders from bronze layer
CREATE TEMPORARY VIEW bronze_orders_raw
AS
SELECT *
FROM json.`s3a://bronze/orders/raw/orders.jsonl`;

-- Weekly grain base view
CREATE TEMPORARY VIEW weekly_orders_base
AS
SELECT
  CAST(order_id AS BIGINT)                                        AS order_id,
  CAST(customer_id AS BIGINT)                                     AS customer_id,
  UPPER(country)                                                  AS country_code,
  ROUND(CAST(quantity AS DOUBLE) * CAST(unit_price AS DOUBLE), 2) AS gross_amount,
  TO_DATE(DATE_TRUNC('WEEK', TO_TIMESTAMP(ordered_at)))           AS week_start
FROM bronze_orders_raw
WHERE UPPER(status) IN ('PAID', 'SHIPPED', 'DELIVERED');

-- Weekly revenue and activity per country
CREATE MATERIALIZED VIEW gold_weekly_revenue
USING delta
AS
SELECT
  week_start,
  country_code,
  ROUND(SUM(gross_amount), 2)      AS weekly_revenue,
  COUNT(*)                         AS order_count,
  COUNT(DISTINCT customer_id)      AS active_customers
FROM weekly_orders_base
GROUP BY week_start, country_code
ORDER BY week_start, country_code;

-- Week-over-week growth derived from gold_weekly_revenue
CREATE MATERIALIZED VIEW gold_weekly_growth
USING delta
AS
WITH lagged AS (
  SELECT
    week_start,
    country_code,
    weekly_revenue,
    LAG(weekly_revenue) OVER (PARTITION BY country_code ORDER BY week_start) AS prev_week_revenue
  FROM gold_weekly_revenue
)
SELECT
  week_start,
  country_code,
  weekly_revenue,
  prev_week_revenue,
  ROUND(
    CASE
      WHEN prev_week_revenue IS NULL OR prev_week_revenue = 0 THEN NULL
      ELSE (weekly_revenue - prev_week_revenue) / prev_week_revenue * 100
    END, 2
  ) AS revenue_growth_pct
FROM lagged;
