import json
import math
import os
import re

import boto3

from agents.pricing import CITY_COORDS, haversine
from agents.pricing import buyer_price
from agents.green_credits import compute_credits
from cache import make_cache_key, cache_get, cache_put
from db.dynamo import batch_get, get_item, query_index

MODEL_ID = os.environ["BEDROCK_TEXT_MODEL_ID"]

_base = os.path.join(os.path.dirname(__file__), "..", "seed", "reference")
with open(os.path.join(_base, "size_standard_map.json")) as f:
    SIZE_MAP = json.load(f)

_bedrock = boto3.client(
    "bedrock-runtime",
    region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"),
)

_MATCH_SYSTEM = """You score how well a returned item fits each candidate buyer.
The item was returned for a specific reason.
For each buyer, evaluate two things using ONLY these three values: "none", "partial", or "strong".

reason_neutralized: Does a buyer trait cancel the return reason?
  Examples: "runs small" → buyer who always sizes up = "strong"
            "too spicy" → buyer who loves spicy food = "strong"
            "too loud" → sound engineer/DJ = "strong"
            No matching trait = "none"

reason_recurrence: Does this buyer have a history of returning for this same reason?
  frequent returns for this reason = "strong", some = "partial", none = "none"

Add a one-line rationale per buyer.
Respond ONLY with JSON. No commentary outside JSON."""

_RECOM_SYSTEM = """You score how well returned items fit a specific buyer.
Each item was returned for the stated reason.
For each item, evaluate two things using ONLY these three values: "none", "partial", or "strong".

reason_neutralized: Does a buyer trait cancel the return reason?
  Examples: item "runs small" → buyer who always sizes up = "strong"
            item "too spicy" → buyer who loves spicy food = "strong"
            item "too loud" → buyer is a DJ/sound engineer = "strong"
            No matching buyer trait = "none"

reason_recurrence: Does this buyer have a history of returning for this same reason?
  frequent returns for this reason = "strong", some = "partial", none = "none"

Add a one-line rationale per item.
Respond ONLY with JSON. No commentary outside JSON."""

BUCKET_MAP = {"none": 0.0, "partial": 0.5, "strong": 1.0}
WEIGHTS = {
    "R_base": 0.25, "R_size": 0.30, "R_cond": 0.15, "R_reasonrec": 0.15,
    "B_neutralize": 0.35, "B_affinity": 0.20,
}


def sigmoid(x: float) -> float:
    return 1 / (1 + math.exp(-x))


def _india_size_num(size_str: str):
    """Parse 'India N' → N (int), or None if not parseable / kids size."""
    if not size_str or size_str == "unknown":
        return None
    if "kids" in size_str.lower():
        return None
    parts = size_str.strip().split()
    try:
        return int(parts[-1])
    except (ValueError, IndexError):
        return None


def _normalize_to_india(size_str: str, category: str):
    """Map any size format to an India size number using SIZE_MAP."""
    if not size_str or size_str == "unknown":
        return None
    mapped = SIZE_MAP.get(category, {}).get(size_str)
    if mapped:
        return _india_size_num(mapped)
    return _india_size_num(size_str)


def size_incompatibility(buyer: dict, grading: dict) -> float:
    if grading.get("detected_category") != "shoes":
        return 0.0
    buyer_size_str = buyer.get("size_profile", {}).get("shoes")
    detected = grading.get("detected_size", "unknown")
    if not buyer_size_str or detected == "unknown":
        return 0.3
    buyer_num = _india_size_num(buyer_size_str)
    detected_num = _normalize_to_india(detected, "shoes")
    if buyer_num is None or detected_num is None:
        return 0.3
    diff = abs(buyer_num - detected_num)
    if diff == 0:
        return 0.0
    if diff == 1:
        return 0.3
    return 0.8


def condition_intolerance(buyer: dict, grade: str) -> float:
    tol = buyer.get("size_profile", {}).get("condition_tolerance", "standard")
    if tol == "pristine_only":
        return {"A": 0.0, "B": 0.6, "C": 0.9, "D": 1.0}.get(grade, 0.5)
    return {"A": 0.0, "B": 0.1, "C": 0.3, "D": 0.8}.get(grade, 0.2)


def brand_affinity(buyer: dict, item: dict) -> float:
    brand = item.get("brand", "").lower()
    for entry in buyer.get("purchase_history", []):
        if entry.get("brand", "").lower() == brand and entry.get("kept"):
            return 0.5
    for pref in buyer.get("preferences", []):
        if brand in pref.lower():
            return 0.3
    return 0.0


def compute_risk(buyer: dict, item: dict, grading: dict, llm_signal: dict) -> float:
    R_base = buyer.get("return_rate", 0.1)
    R_size = size_incompatibility(buyer, grading)
    R_cond = condition_intolerance(buyer, grading.get("grade", "B"))
    R_reasonrec = BUCKET_MAP.get(llm_signal.get("reason_recurrence", "none"), 0.0)
    B_neutralize = BUCKET_MAP.get(llm_signal.get("reason_neutralized", "none"), 0.0)
    B_aff = brand_affinity(buyer, item)

    risk_raw = (
        WEIGHTS["R_base"] * R_base
        + WEIGHTS["R_size"] * R_size
        + WEIGHTS["R_cond"] * R_cond
        + WEIGHTS["R_reasonrec"] * R_reasonrec
        - WEIGHTS["B_neutralize"] * B_neutralize
        - WEIGHTS["B_affinity"] * B_aff
    )
    return round(sigmoid(6 * (risk_raw - 0.5)), 4)


def _extract_json(text: str) -> dict:
    """Strip code fences, find first JSON object, parse it."""
    text = re.sub(r"```json\s*", "", text)
    text = re.sub(r"```\s*", "", text)
    # Some models wrap output in <think>...</think> — strip it
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if not match:
        raise ValueError(f"No JSON object in model response: {text[:300]!r}")
    return json.loads(match.group(0))


def _call_bedrock(system_prompt: str, user_msg: str) -> dict:
    response = _bedrock.converse(
        modelId=MODEL_ID,
        system=[{"text": system_prompt}],
        messages=[{"role": "user", "content": [{"text": user_msg}]}],
        inferenceConfig={"temperature": 0},
    )
    # Find the first content block that actually contains text
    # (some models return a reasoning/thinking block before the text block)
    content_blocks = response["output"]["message"]["content"]
    raw_text = next((c["text"] for c in content_blocks if "text" in c), "")
    return _extract_json(raw_text)


def _size_filter(candidates: list[dict], grading: dict) -> list[dict]:
    """For footwear, drop buyers more than 1 India size away from detected size."""
    if grading.get("detected_category") != "shoes":
        return candidates
    detected_num = _normalize_to_india(grading.get("detected_size", "unknown"), "shoes")
    if detected_num is None:
        return candidates
    out = []
    for b in candidates:
        b_num = _india_size_num(b.get("size_profile", {}).get("shoes", ""))
        if b_num is None or abs(b_num - detected_num) <= 1:
            out.append(b)
    return out


def match_buyers(item: dict, grading: dict, candidates: list[dict]) -> list[dict]:
    """
    Stage 1 (size filter) + Stage 2 (Bedrock rerank + risk scoring).
    candidates: pre-fetched buyer records from BuyerInterestIndex.
    Returns list sorted ascending by re_return_risk.
    """
    candidates = _size_filter(candidates, grading)[:50]

    cache_key = make_cache_key(
        "matching",
        item["return_reason_text"].encode(),
        json.dumps(sorted(b["buyer_id"] for b in candidates)),
        "v1",
        MODEL_ID,
    )
    cached = cache_get(cache_key)
    if cached:
        return cached

    user_msg = (
        f"Item returned reason: {item['return_reason_text']}\n"
        f"Return reason code: {item['return_reason_code']}\n\n"
        "Buyers to score:\n"
        + json.dumps(
            [
                {
                    "buyer_id": b["buyer_id"],
                    "preferences": b.get("preferences", []),
                    "return_history": b.get("return_history", []),
                    "recent_reviews": b.get("recent_reviews", []),
                }
                for b in candidates
            ],
            indent=2,
        )
        + '\n\nReturn:\n{"rankings": [{"buyer_id": "...",'
          ' "reason_neutralized": "none|partial|strong",'
          ' "reason_recurrence": "none|partial|strong", "rationale": "..."}]}'
    )

    llm_out = _call_bedrock(_MATCH_SYSTEM, user_msg)
    signal_by_buyer = {r["buyer_id"]: r for r in llm_out.get("rankings", [])}
    buyer_map = {b["buyer_id"]: b for b in candidates}

    scored = []
    for b in candidates:
        signal = signal_by_buyer.get(
            b["buyer_id"],
            {"reason_neutralized": "none", "reason_recurrence": "none", "rationale": ""},
        )
        risk = compute_risk(b, item, grading, signal)
        hub = CITY_COORDS.get(item.get("return_hub_city", ""), [20.0, 78.0])
        dist_km = round(haversine(hub[0], hub[1], b["lat"], b["lng"]), 1)
        scored.append({
            "buyer_id": b["buyer_id"],
            "re_return_risk": risk,
            "distance_km": dist_km,
            "why_this_fits": signal.get("rationale", ""),
            "rationale": signal.get("rationale", ""),
        })

    # eco boost — high-credit-score buyers get priority access
    for s in scored:
        eco_boost = min(0.05, buyer_map[s["buyer_id"]].get("credit_score", 0) / 10000)
        s["re_return_risk"] = max(0, round(s["re_return_risk"] - eco_boost, 4))

    ranked = sorted(scored, key=lambda b: (b["re_return_risk"], b["buyer_id"]))
    cache_put(cache_key, "matching", ranked)
    return ranked


def _query_items_for_buyer(buyer: dict) -> list[dict]:
    """Query listed items across all buyer category interests (no table scan)."""
    seen = set()
    items = []
    for cat in buyer.get("category_interests", []):
        rows = query_index(
            "Items",
            "StatusCategoryIndex",
            "status = :s AND category = :c",
            {":s": "listed", ":c": cat},
        )
        for row in rows:
            if row["item_id"] not in seen:
                seen.add(row["item_id"])
                items.append(row)
        if len(items) >= 50:
            break
    return items[:50]


_LISTING_GRADE_FACTORS: dict[str, float] = {"A": 0.70, "B": 0.55, "C": 0.40, "D": 0.20}


def get_recommendations(
    buyer_id: str,
    limit: int = 10,
    cart_item_ids: list[str] | None = None,
) -> list[dict]:
    """
    Inverted matching: given a buyer, find and rank listed items.
    Cache key includes buyer_id, sorted candidate item_ids, and cart state.
    """
    buyer = get_item("Buyers", {"buyer_id": buyer_id})
    if not buyer:
        return []

    candidates = _query_items_for_buyer(buyer)
    if not candidates:
        return []

    sorted_item_ids_str = json.dumps(sorted(i["item_id"] for i in candidates))
    cart_key_str = json.dumps(sorted(cart_item_ids or []))
    secondary = f"{sorted_item_ids_str}||cart:{cart_key_str}"
    cache_key = make_cache_key(
        "recommendations",
        buyer_id.encode(),
        secondary,
        "v2",
        MODEL_ID,
    )
    cached = cache_get(cache_key)
    if cached:
        return cached

    # Build cart category set for complementary-item boosting
    cart_categories: set[str] = set()
    if cart_item_ids:
        for cid in cart_item_ids:
            cart_item = get_item("Items", {"item_id": cid})
            if cart_item:
                cart_categories.add(cart_item.get("category", ""))

    user_msg = (
        "Buyer profile:\n"
        f"- Preferences: {buyer.get('preferences', [])}\n"
        f"- Return history: {buyer.get('return_history', [])}\n"
        f"- Recent reviews: {buyer.get('recent_reviews', [])}\n"
        f"- Purchase history brands: {[p.get('brand') for p in buyer.get('purchase_history', [])]}\n\n"
        "Items to score:\n"
        + json.dumps(
            [
                {
                    "item_id": i["item_id"],
                    "brand": i.get("brand", ""),
                    "category": i.get("category", ""),
                    "return_reason_text": i.get("return_reason_text", ""),
                    "return_reason_code": i.get("return_reason_code", ""),
                }
                for i in candidates
            ],
            indent=2,
        )
        + '\n\nReturn:\n{"rankings": [{"item_id": "...",'
          ' "reason_neutralized": "none|partial|strong",'
          ' "reason_recurrence": "none|partial|strong", "rationale": "..."}]}'
    )

    llm_out = _call_bedrock(_RECOM_SYSTEM, user_msg)
    signal_by_item = {r["item_id"]: r for r in llm_out.get("rankings", [])}

    scored = []
    for item in candidates:
        signal = signal_by_item.get(
            item["item_id"],
            {"reason_neutralized": "none", "reason_recurrence": "none", "rationale": ""},
        )
        grading = {
            "grade": item.get("grade", "B"),
            "detected_category": item.get("category", ""),
            "detected_size": item.get("detected_size", item.get("listed_size", "unknown")),
        }
        risk = compute_risk(buyer, item, grading, signal)

        hub = CITY_COORDS.get(item.get("return_hub_city", ""), [20.0, 78.0])
        dist_km = round(haversine(hub[0], hub[1], buyer["lat"], buyer["lng"]), 1)

        base_price = item.get("recovered_value_inr", item.get("original_price_inr", 0))
        price = buyer_price(buyer, base_price, item)

        credits_data = compute_credits(item, grading, dist_km)
        grade = item.get("grade", "B")

        scored.append({
            **item,
            "re_return_risk": risk,
            "distance_km": dist_km,
            "price_inr": price,
            "co2_saved_kg": credits_data["co2_saved_kg"],
            "credits": credits_data["credits"],
            "why_this_fits": signal.get("rationale", ""),
            # XAI fields threaded through for frontend transparency
            "xai_reason_neutralized": signal.get("reason_neutralized", "none"),
            "xai_reason_recurrence": signal.get("reason_recurrence", "none"),
            "xai_grade_factor": _LISTING_GRADE_FACTORS.get(grade.upper(), 0.40),
            "xai_defects": item.get("defects", []),
            "xai_grading_notes": item.get("history_note", ""),
        })

    # eco boost
    for s in scored:
        eco_boost = min(0.05, buyer.get("credit_score", 0) / 10000)
        s["re_return_risk"] = max(0, round(s["re_return_risk"] - eco_boost, 4))

    # cart complement boost: items in same category as cart get mild priority
    if cart_categories:
        for s in scored:
            if s.get("category", "") in cart_categories:
                s["re_return_risk"] = max(0, round(s["re_return_risk"] - 0.03, 4))

    ranked = sorted(scored, key=lambda i: (i["re_return_risk"], i["item_id"]))[:limit]
    cache_put(cache_key, "recommendations", ranked)
    return ranked
