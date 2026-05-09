import boto3
import dagster as dg

from .config import S3A_ACCESS_KEY, S3A_ENDPOINT, S3A_SECRET_KEY


def s3_client():
    return boto3.client(
        "s3",
        endpoint_url=S3A_ENDPOINT,
        aws_access_key_id=S3A_ACCESS_KEY,
        aws_secret_access_key=S3A_SECRET_KEY,
    )


def purge_objects(context: dg.AssetExecutionContext, bucket: str, *prefixes: str) -> None:
    s3 = s3_client()
    paginator = s3.get_paginator("list_objects_v2")
    for prefix in prefixes:
        deleted = 0
        for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
            if "Contents" in page:
                keys = [{"Key": obj["Key"]} for obj in page["Contents"]]
                s3.delete_objects(Bucket=bucket, Delete={"Objects": keys})
                deleted += len(keys)
        if deleted:
            context.log.info(f"Purged {deleted} objects from s3://{bucket}/{prefix}")
