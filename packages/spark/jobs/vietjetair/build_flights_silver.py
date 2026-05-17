from dagster_pipes import open_dagster_pipes
from pyspark.sql import SparkSession
from pyspark.sql import Window
from pyspark.sql import functions as F
from pyspark.sql import types as T

SOURCE_PATH = "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_flight_events_v1"
TARGET_PATH = "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_silver/flights_v1"

RAW_EVENT_SCHEMA = T.StructType(
    [
        T.StructField("flight_id", T.StringType(), True),
        T.StructField("flight_number", T.StringType(), True),
        T.StructField("route_code", T.StringType(), True),
        T.StructField("departure_airport", T.StringType(), True),
        T.StructField("arrival_airport", T.StringType(), True),
        T.StructField("scheduled_departure_time", T.TimestampType(), True),
        T.StructField("aircraft_type", T.StringType(), True),
    ]
)


def build_session() -> SparkSession:
    return (
        SparkSession.builder.appName("vietjetair-build-flights-silver")
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

        bronze_df = spark.read.format("delta").load(SOURCE_PATH)
        parsed_df = bronze_df.select(
            F.col("timestamp").alias("event_timestamp"),
            F.from_json(F.col("value"), RAW_EVENT_SCHEMA).alias("event"),
        )

        candidate_df = (
            parsed_df.select(
                F.col("event.flight_id").cast("string").alias("flight_id"),
                F.upper(F.col("event.flight_number")).alias("flight_number"),
                F.upper(F.col("event.route_code")).alias("route_code"),
                F.upper(F.col("event.departure_airport")).alias("departure_airport"),
                F.upper(F.col("event.arrival_airport")).alias("arrival_airport"),
                F.coalesce(
                    F.col("event.scheduled_departure_time"), F.col("event_timestamp")
                ).alias("scheduled_departure_time"),
                F.upper(F.col("event.aircraft_type")).alias("aircraft_type"),
            )
            .where(F.col("flight_id").isNotNull())
            .where(F.col("route_code").isNotNull())
            .where(F.col("scheduled_departure_time").isNotNull())
        )

        # keep the latest schedule update per flight
        latest_window = Window.partitionBy("flight_id").orderBy(
            F.desc("scheduled_departure_time")
        )
        silver_df = (
            candidate_df.withColumn("row_num", F.row_number().over(latest_window))
            .where(F.col("row_num") == 1)
            .drop("row_num")
        )

        silver_df.write.format("delta").mode("overwrite").save(TARGET_PATH)

        bronze_count = bronze_df.count()
        silver_count = silver_df.count()
        spark.stop()

        pipes.report_asset_materialization(
            metadata={
                "bronze_rows": bronze_count,
                "silver_rows": silver_count,
                "source": SOURCE_PATH,
                "target": TARGET_PATH,
            }
        )


if __name__ == "__main__":
    main()
