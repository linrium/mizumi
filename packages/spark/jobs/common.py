from __future__ import annotations

from typing import Sequence

from pyspark.sql import DataFrame, SparkSession
from pyspark.sql import functions as F
from pyspark.sql.utils import AnalysisException

HDBANK_BRONZE_CUSTOMERS_CSV_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_bronze/hdbank_customers.csv"
)
HDBANK_BRONZE_CUSTOMERS_CSV_FALLBACK_PATH = (
    "s3a://datasets/synthetic/current/hdbank_customers.csv"
)
VIETJETAIR_BRONZE_CUSTOMERS_CSV_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_bronze/vietjetair_customers.csv"
VIETJETAIR_BRONZE_CUSTOMERS_CSV_FALLBACK_PATH = (
    "s3a://datasets/synthetic/current/vietjetair_customers.csv"
)

HDBANK_BRONZE_CUSTOMERS_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_bronze/customers_v1"
)
HDBANK_BRONZE_TRANSACTIONS_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_bronze/banking_transactions_v1"
)
VIETJETAIR_BRONZE_CUSTOMERS_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_bronze/customers_v1"
)
VIETJETAIR_BRONZE_TICKETS_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_bronze/flight_tickets_v1"
)
VIETJETAIR_BRONZE_INCIDENTS_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_bronze/flight_incidents_v1"

HDBANK_SILVER_CUSTOMERS_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_silver/customers_v1"
)
HDBANK_SILVER_TRAVEL_FEATURES_PATH = (
    "s3a://unitycatalog/hdbank/hdbank_partnership_prod_silver/travel_spend_features_v1"
)
VIETJETAIR_SILVER_CUSTOMERS_PATH = (
    "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_silver/customers_v1"
)
VIETJETAIR_SILVER_BOOKING_FEATURES_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_silver/booking_features_v1"
PARTNERSHIP_SILVER_CUSTOMER_360_PATH = (
    "s3a://unitycatalog/partnership/co_brand_silver/customer_360_v1"
)

HDBANK_GOLD_TARGET_PATH = "s3a://unitycatalog/hdbank/hdbank_partnership_prod_gold/vietjet_activation_candidates_v1"
VIETJETAIR_GOLD_TARGET_PATH = "s3a://unitycatalog/vietjetair/vietjetair_partnership_prod_gold/hdbank_finance_candidates_v1"
PARTNERSHIP_GOLD_TARGET_PATH = (
    "s3a://unitycatalog/partnership/co_brand_gold/co_brand_offer_audience_v1"
)


def build_session(app_name: str) -> SparkSession:
    return (
        SparkSession.builder.appName(app_name)
        .config("spark.sql.session.timeZone", "UTC")
        .config("spark.sql.extensions", "io.delta.sql.DeltaSparkSessionExtension")
        .config(
            "spark.sql.catalog.spark_catalog",
            "org.apache.spark.sql.delta.catalog.DeltaCatalog",
        )
        .getOrCreate()
    )


def read_csv(spark: SparkSession, path: str) -> DataFrame:
    return spark.read.option("header", "true").option("inferSchema", "true").csv(path)


def path_exists(spark: SparkSession, path: str) -> bool:
    jvm = spark._jvm
    hadoop_conf = spark._jsc.hadoopConfiguration()
    fs = jvm.org.apache.hadoop.fs.FileSystem.get(jvm.java.net.URI(path), hadoop_conf)
    return fs.exists(jvm.org.apache.hadoop.fs.Path(path))


def read_first_existing_csv(
    spark: SparkSession, paths: Sequence[str]
) -> tuple[DataFrame, str]:
    for path in paths:
        if path_exists(spark, path):
            return read_csv(spark, path), path
    formatted_paths = ", ".join(paths)
    raise FileNotFoundError(
        f"No readable CSV found in any configured path: {formatted_paths}"
    )


def _delete_path(spark: SparkSession, path: str) -> None:
    jvm = spark._jvm
    hadoop_conf = spark._jsc.hadoopConfiguration()
    fs = jvm.org.apache.hadoop.fs.FileSystem.get(jvm.java.net.URI(path), hadoop_conf)
    fs.delete(jvm.org.apache.hadoop.fs.Path(path), True)


def write_delta(df: DataFrame, path: str) -> None:
    try:
        df.write.format("delta").mode("overwrite").option(
            "overwriteSchema", "true"
        ).save(path)
    except AnalysisException as e:
        if "truncatedTransactionLog" in str(e):
            _delete_path(df.sparkSession, path)
            df.write.format("delta").mode("overwrite").option(
                "overwriteSchema", "true"
            ).save(path)
        else:
            raise


def with_home_airport(city_col: str) -> F.Column:
    return (
        F.when(F.col(city_col) == "Ho Chi Minh", F.lit("SGN"))
        .when(F.col(city_col) == "Ha Noi", F.lit("HAN"))
        .when(F.col(city_col) == "Da Nang", F.lit("DAD"))
        .when(F.col(city_col) == "Hai Phong", F.lit("HPH"))
        .otherwise(F.lit("SGN"))
    )


def priority_band(score_col: str) -> F.Column:
    return (
        F.when(F.col(score_col) >= F.lit(0.82), F.lit("high"))
        .when(F.col(score_col) >= F.lit(0.64), F.lit("medium"))
        .otherwise(F.lit("nurture"))
    )
