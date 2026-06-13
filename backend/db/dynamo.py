import json
import os
import re
import time
from decimal import Decimal
from pathlib import Path

import boto3
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

dynamodb = boto3.resource("dynamodb", region_name=os.environ["AWS_DEFAULT_REGION"])
dynamodb_client = boto3.client("dynamodb", region_name=os.environ["AWS_DEFAULT_REGION"])


def table_name(logical_name: str) -> str:
    return f"{os.environ.get('DDB_TABLE_PREFIX', 'SecondLife')}-{logical_name}"


def table(logical_name: str):
    return dynamodb.Table(table_name(logical_name))


def to_ddb(value):
    return json.loads(json.dumps(value), parse_float=Decimal)


def from_ddb(value):
    if isinstance(value, list):
        return [from_ddb(item) for item in value]
    if isinstance(value, dict):
        return {key: from_ddb(item) for key, item in value.items()}
    if isinstance(value, Decimal):
        if value == value.to_integral_value():
            return int(value)
        return float(value)
    return value


def get_item(logical_table: str, key: dict) -> dict | None:
    resp = table(logical_table).get_item(Key=to_ddb(key))
    return from_ddb(resp.get("Item"))


def put_item(logical_table: str, item: dict) -> None:
    table(logical_table).put_item(Item=to_ddb(item))


def update_item(logical_table: str, key: dict, updates: dict) -> dict:
    if not updates:
        item = get_item(logical_table, key)
        if item is None:
            raise ValueError("Cannot update item with empty updates before it exists")
        return item

    names = {f"#k{i}": field for i, field in enumerate(updates)}
    values = {f":v{i}": to_ddb(value) for i, value in enumerate(updates.values())}
    update_expr = "SET " + ", ".join(
        f"#k{i} = :v{i}" for i in range(len(updates))
    )
    resp = table(logical_table).update_item(
        Key=to_ddb(key),
        UpdateExpression=update_expr,
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
        ReturnValues="ALL_NEW",
    )
    return from_ddb(resp["Attributes"])


def query_index(logical_table: str, index_name: str, key_expr, expr_values: dict) -> list[dict]:
    expr_names = None
    if isinstance(key_expr, str):
        key_expr, expr_names = _alias_key_expression(key_expr)

    items = []
    kwargs = {
        "IndexName": index_name,
        "KeyConditionExpression": key_expr,
        "ExpressionAttributeValues": to_ddb(expr_values),
    }
    if expr_names:
        kwargs["ExpressionAttributeNames"] = expr_names

    while True:
        resp = table(logical_table).query(**kwargs)
        items.extend(resp.get("Items", []))
        last_key = resp.get("LastEvaluatedKey")
        if not last_key:
            break
        kwargs["ExclusiveStartKey"] = last_key
    return [from_ddb(item) for item in items]


def batch_get(logical_table: str, keys: list[dict]) -> list[dict]:
    if not keys:
        return []

    request_items = {table_name(logical_table): {"Keys": to_ddb(keys)}}
    items = []
    while request_items:
        resp = dynamodb.batch_get_item(RequestItems=request_items)
        items.extend(resp.get("Responses", {}).get(table_name(logical_table), []))
        request_items = resp.get("UnprocessedKeys", {})
        if request_items:
            time.sleep(0.25)
    return [from_ddb(item) for item in items]


def _alias_key_expression(key_expr: str) -> tuple[str, dict[str, str]]:
    names = {}

    def replace(match):
        field = match.group(1)
        placeholder = f"#k{len(names)}"
        names[placeholder] = field
        return f"{placeholder} {match.group(2)}"

    aliased = re.sub(r"\b([A-Za-z_][A-Za-z0-9_]*)\s*(=|<=|>=|<|>)", replace, key_expr)
    return aliased, names
