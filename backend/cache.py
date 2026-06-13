import hashlib
import json

from db.dynamo import get_item, put_item

CACHE_TABLE = "GradeCache"


def make_cache_key(
    agent_name: str,
    primary_input: bytes,
    secondary_str: str,
    prompt_version: str,
    model_id: str,
) -> str:
    raw = (
        agent_name.encode()
        + b"||"
        + primary_input
        + b"||"
        + secondary_str.encode()
        + b"||"
        + prompt_version.encode()
        + b"||"
        + model_id.encode()
    )
    return hashlib.sha256(raw).hexdigest()


def cache_get(key: str) -> dict | None:
    row = get_item(CACHE_TABLE, {"cache_key": key})
    if row:
        return json.loads(row["result_json"])
    return None


def cache_put(key: str, agent: str, result: dict) -> None:
    put_item(
        CACHE_TABLE,
        {
            "cache_key": key,
            "agent": agent,
            "result_json": json.dumps(result),
        },
    )
