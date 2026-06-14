import json
import os
import re

import boto3

from cache import make_cache_key, cache_get, cache_put
from db import s3 as db_s3
from db.dynamo import update_item

MODEL_ID = os.environ["BEDROCK_TEXT_MODEL_ID"]

_bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"),
)

_SYSTEM_PROMPT = """You write honest, reassuring condition reports for refurbished products.
Help hesitant buyers trust a returned item.
Use ONLY the facts provided — do not invent defects, history, or numbers.
A return for fit or preference is NOT a product defect — frame it fairly.
Respond ONLY with valid JSON matching the exact schema. No extra fields."""

_REQUIRED_KEYS = {"summary", "condition_statement", "why_returned", "buyer_reassurance"}

_HTML_TEMPLATE = """\
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Trust Passport — {item_id}</title></head>
<body>
  <h1>Trust Passport</h1>
  <p><strong>Summary:</strong> {summary}</p>
  <p><strong>Condition:</strong> {condition_statement}</p>
  <p><strong>Why Returned:</strong> {why_returned}</p>
  <p><strong>For Buyers:</strong> {buyer_reassurance}</p>
  <hr>
  <p>Item ID: {item_id} | Grade: {grade} | Verified by: AI Vision Model · AWS Bedrock</p>
</body>
</html>"""


def _build_user_msg(item: dict, grading: dict, credits_data: dict) -> str:
    defects = grading.get("defects", [])
    defects_str = ", ".join(d.get("type", "") for d in defects) if defects else "none"
    return (
        f"Item: {item.get('brand', '')} {item.get('name', '')}\n"
        f"Grade: {grading.get('grade', 'B')}\n"
        f"Defects found: {defects_str}\n"
        f"Owner count: {item.get('owner_count', 1)}\n"
        f"Return history: {item.get('history_note', '')}\n"
        f"Return reason: {item.get('return_reason_text', '')}\n"
        f"CO₂ saved vs buying new: {credits_data.get('co2_saved_kg', 0)} kg\n\n"
        'Return:\n'
        '{\n'
        '  "summary": "<Grade X · N previous owner(s) · one-line verdict>",\n'
        '  "condition_statement": "<honest but fair 1-2 sentence description of physical condition>",\n'
        '  "why_returned": "<neutral explanation of why it came back — not a defect if it was fit/preference>",\n'
        '  "buyer_reassurance": "<one reassuring sentence mentioning the CO₂ saved>"\n'
        '}'
    )


def _extract_json(text: str) -> dict:
    """Strip code fences / reasoning blocks, find first JSON object, parse it."""
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object in model response: {text[:300]!r}")
    return json.loads(match.group(0))


def _call_bedrock(user_msg: str) -> dict:
    response = _bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": user_msg}]}],
        inferenceConfig={"temperature": 0},
    )
    # Find the first content block that actually contains text
    # (some models emit a reasoning block before the text block).
    content_blocks = response["output"]["message"]["content"]
    raw_text = next((c["text"] for c in content_blocks if "text" in c), "")
    return _extract_json(raw_text)


def _parse_and_validate(raw: dict) -> dict:
    missing = _REQUIRED_KEYS - raw.keys()
    if missing:
        raise ValueError(f"Passport response missing keys: {missing}")
    return {k: raw[k] for k in _REQUIRED_KEYS}


def generate_passport(item: dict, grading: dict, credits_data: dict) -> dict:
    """
    Generate a Trust Passport for an item.
    Checks cache first. On miss: calls Bedrock, validates, renders HTML,
    uploads to S3, caches result, updates Items record with passport_key.
    Returns the four text fields plus passport_key.
    """
    item_id = item["item_id"]
    grade = grading.get("grade", "B")
    defects = grading.get("defects", [])
    history_note = item.get("history_note", "")
    co2_saved_kg = credits_data.get("co2_saved_kg", 0)

    cache_key = make_cache_key(
        "passport",
        item_id.encode(),
        grade + str(sorted(str(d) for d in defects)) + history_note + str(co2_saved_kg),
        "v1",
        MODEL_ID,
    )
    cached = cache_get(cache_key)
    if cached:
        return cached

    user_msg = _build_user_msg(item, grading, credits_data)

    # Call Bedrock; retry once on parse failure
    raw = _call_bedrock(user_msg)
    try:
        passport = _parse_and_validate(raw)
    except (ValueError, KeyError):
        # Retry with a repair prompt
        repair_msg = (
            f"Your previous response was missing required keys. "
            f"Raw response: {json.dumps(raw)}\n\n"
            "Return ONLY valid JSON with exactly these keys: "
            "summary, condition_statement, why_returned, buyer_reassurance."
        )
        raw = _call_bedrock(repair_msg)
        passport = _parse_and_validate(raw)

    passport_key = f"passports/{item_id}.html"
    html = _HTML_TEMPLATE.format(
        item_id=item_id,
        summary=passport["summary"],
        condition_statement=passport["condition_statement"],
        why_returned=passport["why_returned"],
        buyer_reassurance=passport["buyer_reassurance"],
        grade=grade,
        model_id=MODEL_ID,
    )
    db_s3.upload_passport_html(item_id, html)

    update_item("Items", {"item_id": item_id}, {"passport_key": passport_key})

    result = {**passport, "passport_key": passport_key}
    cache_put(cache_key, "passport", result)
    # Store text fields directly on item so the passport endpoint can read them
    # without cache-key reconstruction (which fails when co2_saved_kg int/float differs).
    update_item("Items", {"item_id": item_id}, {
        "passport_summary": passport["summary"],
        "passport_condition": passport["condition_statement"],
        "passport_why_returned": passport["why_returned"],
        "passport_reassurance": passport["buyer_reassurance"],
    })
    return result
