import os
import time
from pathlib import Path

import boto3
from botocore.exceptions import ClientError
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

REGION = os.environ["AWS_DEFAULT_REGION"]
TABLE_PREFIX = os.environ.get("DDB_TABLE_PREFIX", "SecondLife")

dynamodb = boto3.client("dynamodb", region_name=REGION)
s3 = boto3.client("s3", region_name=REGION)

TABLE_SPECS = [
    {
        "TableName": "Items",
        "KeySchema": [{"AttributeName": "item_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [
            {"AttributeName": "item_id", "AttributeType": "S"},
            {"AttributeName": "status", "AttributeType": "S"},
            {"AttributeName": "category", "AttributeType": "S"},
            {"AttributeName": "listing_id", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "StatusCategoryIndex",
                "KeySchema": [
                    {"AttributeName": "status", "KeyType": "HASH"},
                    {"AttributeName": "category", "KeyType": "RANGE"},
                ],
            },
            {
                "IndexName": "ListingStatusIndex",
                "KeySchema": [
                    {"AttributeName": "listing_id", "KeyType": "HASH"},
                    {"AttributeName": "status", "KeyType": "RANGE"},
                ],
            },
        ],
    },
    {
        "TableName": "Buyers",
        "KeySchema": [{"AttributeName": "buyer_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [
            {"AttributeName": "buyer_id", "AttributeType": "S"},
            {"AttributeName": "region", "AttributeType": "S"},
            {"AttributeName": "primary_category", "AttributeType": "S"},
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "RegionCategoryIndex",
                "KeySchema": [
                    {"AttributeName": "region", "KeyType": "HASH"},
                    {"AttributeName": "primary_category", "KeyType": "RANGE"},
                ],
            }
        ],
    },
    {
        "TableName": "BuyerInterestIndex",
        "KeySchema": [
            {"AttributeName": "category", "KeyType": "HASH"},
            {"AttributeName": "region_buyer_id", "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "category", "AttributeType": "S"},
            {"AttributeName": "region_buyer_id", "AttributeType": "S"},
        ],
    },
    {
        "TableName": "GradeCache",
        "KeySchema": [{"AttributeName": "cache_key", "KeyType": "HASH"}],
        "AttributeDefinitions": [{"AttributeName": "cache_key", "AttributeType": "S"}],
    },
    {
        "TableName": "ListingFlags",
        "KeySchema": [{"AttributeName": "listing_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [{"AttributeName": "listing_id", "AttributeType": "S"}],
    },
    {
        "TableName": "CreditsLedger",
        "KeySchema": [
            {"AttributeName": "buyer_id", "KeyType": "HASH"},
            {"AttributeName": "event_id", "KeyType": "RANGE"},
        ],
        "AttributeDefinitions": [
            {"AttributeName": "buyer_id", "AttributeType": "S"},
            {"AttributeName": "event_id", "AttributeType": "S"},
        ],
    },
]


def physical_table_name(logical_name: str) -> str:
    return f"{TABLE_PREFIX}-{logical_name}"


def with_throughput(spec: dict) -> dict:
    table_spec = dict(spec)
    table_spec["TableName"] = physical_table_name(spec["TableName"])
    table_spec["BillingMode"] = "PROVISIONED"
    table_spec["ProvisionedThroughput"] = {
        "ReadCapacityUnits": 1,
        "WriteCapacityUnits": 1,
    }

    if "GlobalSecondaryIndexes" in table_spec:
        table_spec["GlobalSecondaryIndexes"] = [
            {
                **gsi,
                "Projection": {"ProjectionType": "ALL"},
                "ProvisionedThroughput": {
                    "ReadCapacityUnits": 1,
                    "WriteCapacityUnits": 1,
                },
            }
            for gsi in table_spec["GlobalSecondaryIndexes"]
        ]

    return table_spec


def create_table(spec: dict) -> None:
    table_name = physical_table_name(spec["TableName"])
    try:
        dynamodb.create_table(**with_throughput(spec))
        print(f"[CREATE] {table_name}")
    except dynamodb.exceptions.ResourceInUseException:
        print(f"[SKIP] {table_name} already exists")

    wait_until_active(table_name)
    print(f"[OK] {table_name} ACTIVE")


def wait_until_active(table_name: str) -> None:
    while True:
        resp = dynamodb.describe_table(TableName=table_name)
        status = resp["Table"]["TableStatus"]
        if status == "ACTIVE":
            return
        print(f"[WAIT] {table_name} {status}")
        time.sleep(5)


def create_bucket(bucket: str) -> None:
    try:
        s3.head_bucket(Bucket=bucket)
        print(f"[SKIP] {bucket} already exists")
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status != 404:
            raise
        s3.create_bucket(
            Bucket=bucket,
            CreateBucketConfiguration={"LocationConstraint": REGION},
        )
        print(f"[CREATE] {bucket}")

    s3.put_public_access_block(
        Bucket=bucket,
        PublicAccessBlockConfiguration={
            "BlockPublicAcls": True,
            "IgnorePublicAcls": True,
            "BlockPublicPolicy": True,
            "RestrictPublicBuckets": True,
        },
    )
    s3.put_bucket_encryption(
        Bucket=bucket,
        ServerSideEncryptionConfiguration={
            "Rules": [
                {
                    "ApplyServerSideEncryptionByDefault": {
                        "SSEAlgorithm": "AES256",
                    }
                }
            ]
        },
    )
    print(f"[OK] {bucket} private + AES256")


def main() -> None:
    for spec in TABLE_SPECS:
        create_table(spec)

    create_bucket(os.environ["S3_PHOTOS_BUCKET"])
    create_bucket(os.environ["S3_PASSPORTS_BUCKET"])


if __name__ == "__main__":
    main()
