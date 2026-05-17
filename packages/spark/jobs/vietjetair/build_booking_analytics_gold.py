from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import Window
from pyspark.sql import functions as F

BOOKINGS_SOURCE_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/ticket_bookings_v1"
)
CUSTOMERS_SOURCE_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/customers_v1"
)
FLIGHTS_SOURCE_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/flights_v1"
)
BOOKING_REVENUE_TARGET_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_gold/booking_revenue_v1"
)
CUSTOMER_SPEND_TARGET_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_gold/customer_spend_v1"
)

ANCILLARY_RATE = 0.12


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("vietjetair-build-booking-analytics-gold")
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )


def main() -> None:
    with open_dagster_pipes() as pipes:
        spark = build_session()

        bookings_df = (
            spark.read.format("delta")
            .load(BOOKINGS_SOURCE_PATH)
            .withColumn("business_date", F.to_date("booking_timestamp"))
        )
        customers_df = spark.read.format("delta").load(CUSTOMERS_SOURCE_PATH)
        flights_df = spark.read.format("delta").load(FLIGHTS_SOURCE_PATH)

        booking_revenue_df = (
            bookings_df.groupBy("business_date", "route_code", "currency")
            .agg(
                F.count("*").cast("int").alias("booking_count"),
                F.round(F.sum("ticket_amount"), 2).alias("ticket_revenue"),
            )
            .withColumn(
                "ancillary_revenue",
                F.round(F.col("ticket_revenue") * F.lit(ANCILLARY_RATE), 2),
            )
        )

        route_window = Window.partitionBy(
            "business_date", "customer_id", "currency"
        ).orderBy(F.desc("route_tx_count"), F.asc("route_code"))
        favorite_routes_df = (
            bookings_df.groupBy("business_date", "customer_id", "currency", "route_code")
            .agg(F.count("*").alias("route_tx_count"))
            .withColumn("row_num", F.row_number().over(route_window))
            .where(F.col("row_num") == 1)
            .select(
                "business_date",
                "customer_id",
                "currency",
                F.col("route_code").alias("favorite_route_code"),
            )
        )

        customer_spend_df = (
            bookings_df.groupBy("business_date", "customer_id", "currency")
            .agg(
                F.count("*").cast("int").alias("booking_count"),
                F.round(F.sum("ticket_amount"), 2).alias("total_ticket_spend"),
                F.round(F.avg("ticket_amount"), 2).alias("avg_booking_value"),
            )
            .join(
                favorite_routes_df,
                on=["business_date", "customer_id", "currency"],
                how="left",
            )
        )

        booking_revenue_df.write.format("delta").mode("overwrite").save(
            BOOKING_REVENUE_TARGET_PATH
        )
        customer_spend_df.write.format("delta").mode("overwrite").save(
            CUSTOMER_SPEND_TARGET_PATH
        )

        booking_rows = bookings_df.count()
        customer_rows = customers_df.count()
        flight_rows = flights_df.count()
        revenue_rows = booking_revenue_df.count()
        spend_rows = customer_spend_df.count()
        spark.stop()

        # pipes.report_asset_materialization(
        #     metadata={
        #         "booking_rows": booking_rows,
        #         "customer_rows": customer_rows,
        #         "flight_rows": flight_rows,
        #         "booking_revenue_rows": revenue_rows,
        #         "customer_spend_rows": spend_rows,
        #     }
        # )


if __name__ == "__main__":
    main()
