from pyspark import pipelines as dp
from pyspark.sql import SparkSession, functions as F


BRONZE_SOURCE_PATH = "s3a://bronze/orders/raw/orders.jsonl"
spark = SparkSession.active()


@dp.temporary_view(name="bronze_orders_raw")
def bronze_orders_raw():
    return spark.read.format("json").load(BRONZE_SOURCE_PATH)


@dp.temporary_view(name="silver_orders_cleaned_base")
def silver_orders_cleaned_base():
    return (
        spark.table("bronze_orders_raw")
        .select(
            F.col("order_id").cast("long"),
            F.col("customer_id").cast("long"),
            F.upper(F.col("country")).alias("country_code"),
            F.upper(F.col("status")).alias("status"),
            F.col("quantity").cast("int"),
            F.col("unit_price").cast("double"),
            F.to_timestamp("ordered_at").alias("ordered_at"),
        )
        .filter(F.col("status").isin("PAID", "SHIPPED", "DELIVERED"))
        .dropDuplicates(["order_id"])
        .withColumn("order_date", F.to_date("ordered_at"))
        .withColumn("gross_amount", F.round(F.col("quantity") * F.col("unit_price"), 2))
    )


@dp.materialized_view(name="silver_orders")
def silver_orders():
    return spark.table("silver_orders_cleaned_base").withColumn(
        "processed_at", F.current_timestamp()
    )


@dp.materialized_view(name="gold_daily_country_sales")
def gold_daily_country_sales():
    return (
        spark.table("silver_orders_cleaned_base")
        .groupBy("order_date", "country_code")
        .agg(
            F.count("*").alias("order_count"),
            F.sum("gross_amount").alias("gross_revenue"),
            F.countDistinct("customer_id").alias("active_customers"),
        )
        .orderBy("order_date", "country_code")
    )
