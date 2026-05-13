import dagster as dg


@dg.asset(group_name="banking_bronze")
def banking_bronze_raw_card_payment_events() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={
            "source": dg.MetadataValue.text(
                "s3a://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_card_payment_events_v1"
            )
        }
    )


@dg.asset(group_name="banking_bronze")
def banking_bronze_raw_customer_profile_events() -> dg.MaterializeResult:
    return dg.MaterializeResult(
        metadata={
            "source": dg.MetadataValue.text(
                "s3a://unitycatalog/hdbank/hdbank_payments_prod_bronze/raw_customer_events_v1"
            )
        }
    )
