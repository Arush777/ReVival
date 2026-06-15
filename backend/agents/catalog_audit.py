import io
import json
import os
import re
from pathlib import Path

import boto3
from PIL import Image, ImageOps

from cache import make_cache_key, cache_get, cache_put

MODEL_ID = os.environ["BEDROCK_VISION_MODEL_ID"]
AUDIT_VERSION = "v1-catalog-audit"

_bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"),
)

# Resolve path from backend/agents/ → project root → frontend/public/
FRONTEND_PUBLIC = Path(__file__).resolve().parent.parent.parent / "frontend" / "public"

_SYSTEM_PROMPT = (
    "You are a listing accuracy auditor for an e-commerce marketplace.\n"
    "You receive a product image and the seller's written description.\n"
    "Compare what you actually see in the image against what the description claims.\n"
    "\n"
    "Check these attributes in order of visual detectability:\n"
    "1. COLOR — dominant color of the main product\n"
    "2. PRODUCT TYPE — general category/type of item (e.g. lamp vs mug, chair vs cushion)\n"
    "3. MATERIAL — visible material (e.g. ceramic, metal, fabric, rubber)\n"
    "\n"
    "Rules:\n"
    "- Only flag a mismatch when it is clearly and unambiguously visible in the image.\n"
    "- If the image is packaging, a generic placeholder, or does not show the product\n"
    "  clearly enough to verify the description, set has_mismatch to false and\n"
    "  confidence to 'low'.\n"
    "- Do NOT flag minor shade variations or marketing language differences.\n"
    "- Respond ONLY with valid JSON matching the exact schema. No extra text.\n"
)

_SCHEMA_TEXT = (
    '{\n'
    '  "has_mismatch": <true|false>,\n'
    '  "flag_type": "color|type|material|none",\n'
    '  "detected_primary_attribute": "<what the image clearly shows>",\n'
    '  "claimed_primary_attribute": "<what the description claims>",\n'
    '  "mismatch_description": "<one concise sentence, or empty string if no mismatch>",\n'
    '  "confidence": "high|medium|low"\n'
    '}'
)


def _process_image(raw_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(raw_bytes))
    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    w, h = img.size
    if max(w, h) > 1600:
        if w >= h:
            new_w, new_h = 1600, round(h * 1600 / w)
        else:
            new_h, new_w = 1600, round(w * 1600 / h)
        img = img.resize((new_w, new_h), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _extract_json(text: str) -> dict:
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object in response: {text[:300]}")
    return json.loads(match.group(0))


def audit_catalog_listing(
    catalog_id: str,
    title: str,
    category: str,
    seller_description: str,
    image_url: str,
) -> dict:
    """
    AI vision audit for a new product listing.
    Compares the seller_description against what is actually visible in the product image.

    image_url is the frontend-relative URL, e.g. "/catalog/filler/FIL_01.jpg".

    Returns:
        {
            "has_mismatch": bool,
            "flag_type": "color"|"type"|"material"|"none",
            "detected": str,
            "claimed": str,
            "mismatch_description": str,
            "confidence": "high"|"medium"|"low",
        }
    """
    image_path = FRONTEND_PUBLIC / image_url.lstrip("/")
    if not image_path.exists():
        return {
            "has_mismatch": False,
            "flag_type": "none",
            "detected": "",
            "claimed": "",
            "mismatch_description": f"Image not found: {image_url}",
            "confidence": "low",
        }

    with open(image_path, "rb") as f:
        raw_bytes = f.read()

    canonical_image = _process_image(raw_bytes)
    canonical_text = json.dumps(
        {
            "catalog_id": catalog_id,
            "title": title,
            "category": category,
            "seller_description": seller_description,
        },
        sort_keys=True,
    )

    cache_key = make_cache_key(
        "catalog_audit",
        canonical_image,
        canonical_text,
        AUDIT_VERSION,
        MODEL_ID,
    )
    cached = cache_get(cache_key)
    if cached:
        return cached

    content = [
        {
            "image": {
                "format": "jpeg",
                "source": {"bytes": canonical_image},
            }
        },
        {
            "text": (
                f"Product title: {title}\n"
                f"Category: {category}\n"
                f"Seller description: {seller_description}\n"
                "\n"
                "Compare the image against the seller description. "
                "Respond with this exact JSON schema:\n"
                + _SCHEMA_TEXT
            )
        },
    ]

    raw_resp = _bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": _SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": content}],
        inferenceConfig={"temperature": 0},
    )
    raw_text = raw_resp["output"]["message"]["content"][0]["text"]

    try:
        obs = _extract_json(raw_text)
    except (ValueError, json.JSONDecodeError):
        repair_resp = _bedrock.converse(
            modelId=MODEL_ID,
            system=[{"text": _SYSTEM_PROMPT}],
            messages=[
                {"role": "user", "content": content},
                {"role": "assistant", "content": [{"text": raw_text}]},
                {"role": "user", "content": [{"text": "Return ONLY valid JSON:\n\n" + raw_text}]},
            ],
            inferenceConfig={"temperature": 0},
        )
        obs = _extract_json(repair_resp["output"]["message"]["content"][0]["text"])

    result = {
        "has_mismatch": bool(obs.get("has_mismatch", False)),
        "flag_type": obs.get("flag_type", "none"),
        "detected": obs.get("detected_primary_attribute", ""),
        "claimed": obs.get("claimed_primary_attribute", ""),
        "mismatch_description": obs.get("mismatch_description", ""),
        "confidence": obs.get("confidence", "low"),
    }

    cache_put(cache_key, "catalog_audit", result)
    return result
