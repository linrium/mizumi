import dagster as dg


@dg.asset(group_name="vietjetair_bronze")
def vietjetair_bronze_raw_flight_events() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={
            "source": dg.MetadataValue.text(
                "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_flight_events_v1"
            )
        }
    )


@dg.asset(group_name="vietjetair_bronze")
def vietjetair_bronze_raw_customer_events() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={
            "source": dg.MetadataValue.text(
                "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_customer_events_v1"
            )
        }
    )


@dg.asset(group_name="vietjetair_bronze")
def vietjetair_bronze_raw_booking_events() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={
            "source": dg.MetadataValue.text(
                "s3a://unitycatalog/vietjetair/vietjetair_bookings_prod_bronze/raw_booking_events_v1"
            )
        }
    )
