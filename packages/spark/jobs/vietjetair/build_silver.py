from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import Window
from pyspark.sql import functions as F
from pyspark.sql import types as T

BRONZE_CUSTOMERS_SOURCE_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_bronze/customers_v1"
BRONZE_PARTNER_EVENTS_SOURCE_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_bronze/partner_events_v1"
CUSTOMERS_TARGET_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_silver/customers_v1"
BOOKING_FEATURES_TARGET_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_silver/booking_features_v1"
)

BOOKING_SCHEMA = T.StructType(
    [
        T.StructField("event_type", T.StringType(), True),
        T.StructField("booking_id", T.StringType(), True),
        T.StructField("customer_id", T.StringType(), True),
        T.StructField("pnr_code", T.StringType(), True),
        T.StructField("payment_reference", T.StringType(), True),
        T.StructField("route_code", T.StringType(), True),
        T.StructField("ticket_amount", T.DoubleType(), True),
        T.StructField("currency", T.StringType(), True),
        T.StructField("booking_timestamp", T.StringType(), True),
        T.StructField("shared_customer", T.BooleanType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("vietjetair-build-silver")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )


def main() -> None:
    spark = build_session()
    bronze_customers_df = spark.read.format("delta").load(BRONZE_CUSTOMERS_SOURCE_PATH)
    bronze_events_df = spark.read.format("delta").load(BRONZE_PARTNER_EVENTS_SOURCE_PATH)

    customer_events = (
        bronze_customers_df.where(F.col("customer_id").isNotNull())
        .select(
            F.col("customer_id"),
            F.col("customer_name"),
            F.upper(F.col("membership_tier")).alias("membership_tier"),
            F.upper(F.col("home_airport")).alias("home_airport"),
            F.col("email_opt_in"),
            F.col("shared_customer"),
            F.col("seed_timestamp").alias("updated_at"),
        )
    )

    latest_window = Window.partitionBy("customer_id").orderBy(F.desc("updated_at"))
    customers_df = (
        customer_events.withColumn("row_num", F.row_number().over(latest_window))
        .where(F.col("row_num") == 1)
        .drop("row_num")
    )

    booking_events = (
        bronze_events_df.where(F.col("event_type") == "booking_confirmed")
        .withColumn("payload", F.from_json(F.col("value"), BOOKING_SCHEMA))
        .select(
            F.col("payload.booking_id").alias("booking_id"),
            F.col("payload.customer_id").alias("customer_id"),
            F.upper(F.col("payload.route_code")).alias("route_code"),
            F.col("payload.ticket_amount").alias("ticket_amount"),
            F.upper(F.col("payload.currency")).alias("currency"),
            F.to_timestamp(F.col("payload.booking_timestamp")).alias("booking_timestamp"),
            F.col("payload.shared_customer").alias("shared_customer"),
        )
    )

    booking_features_df = (
        booking_events.groupby("customer_id")
        .agg(
            F.count("*").cast("int").alias("booking_count"),
            F.round(F.sum("ticket_amount"), 2).alias("gross_booking_value"),
            F.round(F.avg("ticket_amount"), 2).alias("avg_booking_value"),
            F.max("booking_timestamp").alias("last_booking_at"),
        )
        .withColumn(
            "frequent_flyer_score",
            F.round(
                F.least(
                    F.lit(0.99),
                    F.lit(0.25)
                    + (F.col("booking_count") / F.lit(8.0))
                    + (F.col("gross_booking_value") / F.lit(30_000_000.0)),
                ),
                2,
            ),
        )
    )

    customers_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(CUSTOMERS_TARGET_PATH)
    booking_features_df.write.format("delta").mode("overwrite").option("overwriteSchema", "true").save(
        BOOKING_FEATURES_TARGET_PATH
    )

    with open_dagster_pipes() as pipes:
        pipes.report_asset_materialization(
            asset_key="vietjetair_silver_customers",
            metadata={"row_count": customers_df.count(), "target": CUSTOMERS_TARGET_PATH},
        )
        pipes.report_asset_materialization(
            asset_key="vietjetair_silver_booking_features",
            metadata={"row_count": booking_features_df.count(), "target": BOOKING_FEATURES_TARGET_PATH},
        )

    spark.stop()


if __name__ == "__main__":
    main()
