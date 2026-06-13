import os
from pathlib import Path

import boto3
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

s3 = boto3.client("s3", region_name=os.environ["AWS_DEFAULT_REGION"])


def upload_photo(item_id: str, local_path: str, filename: str) -> str:
    key = f"photos/{item_id}/{filename}"
    s3.upload_file(
        local_path,
        os.environ["S3_PHOTOS_BUCKET"],
        key,
        ExtraArgs={"ServerSideEncryption": "AES256"},
    )
    return key


def upload_passport_html(item_id: str, html: str) -> str:
    key = f"passports/{item_id}.html"
    s3.put_object(
        Bucket=os.environ["S3_PASSPORTS_BUCKET"],
        Key=key,
        Body=html.encode("utf-8"),
        ContentType="text/html; charset=utf-8",
        ServerSideEncryption="AES256",
    )
    return key


def presign_photo(key: str, expires: int = 900) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["S3_PHOTOS_BUCKET"], "Key": key},
        ExpiresIn=expires,
    )


def presign_passport(key: str, expires: int = 900) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["S3_PASSPORTS_BUCKET"], "Key": key},
        ExpiresIn=expires,
    )
