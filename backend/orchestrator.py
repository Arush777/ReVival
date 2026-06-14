import logging
import os
from datetime import datetime, timezone

from boto3.dynamodb.conditions import Key

from agents.disposition import compute_disposition
from agents.grading import grade_item
from agents.green_credits import compute_credits
from agents.matching import match_buyers
from agents.passport import generate_passport
from agents.prevention import correct_listing, predict_listing_flag, write_listing_flag
from agents.pricing import CITY_COORDS, haversine
from db.dynamo import batch_get, from_ddb, get_item, put_item, table, update_item
from db.s3 import presign_passport, upload_photo

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def create_item_record(payload: dict) -> dict:
    item = {**payload, "status": "pending"}
    put_item("Items", item)
    return item


def upload_photos(item_id: str, photo_paths: list[str]) -> list[str]:
    keys = []
    for path in photo_paths:
        filename = os.path.basename(path)
        key = upload_photo(item_id, path, filename)
        keys.append(key)
    return keys


def update_item_field(item: dict, key: str, value) -> None:
    """Update one field in DynamoDB and keep the local item dict in sync."""
    update_item("Items", {"item_id": item["item_id"]}, {key: value})
    item[key] = value


def update_item_fields(item: dict, updates: dict) -> None:
    """Update multiple fields in DynamoDB and keep the local item dict in sync."""
    if not updates:
        return
    update_item("Items", {"item_id": item["item_id"]}, updates)
    item.update(updates)


def query_buyers_stage1(item: dict) -> list[dict]:
    """
    Query BuyerInterestIndex table (PK=category) to find interested buyers,
    then batch-get full Buyer records from the Buyers table.
    Same-region buyers are sorted first; cap at 50 candidates.
    BuyerInterestIndex is a base table — query by PK directly, no IndexName.
    """
    category = item["category"]
    hub_city = item.get("return_hub_city", "")

    rows = []
    kwargs: dict = {"KeyConditionExpression": Key("category").eq(category)}
    while True:
        resp = table("BuyerInterestIndex").query(**kwargs)
        rows.extend(from_ddb(r) for r in resp.get("Items", []))
        last = resp.get("LastEvaluatedKey")
        if not last:
            break
        kwargs["ExclusiveStartKey"] = last

    if not rows:
        return []

    seen: set[str] = set()
    unique_keys = []
    for r in rows:
        bid = r["buyer_id"]
        if bid not in seen:
            seen.add(bid)
            unique_keys.append({"buyer_id": bid})

    buyers = batch_get("Buyers", unique_keys[:50])

    hub_coords = CITY_COORDS.get(hub_city, [20.0, 78.0])

    def _sort_key(b: dict) -> tuple:
        same_region = 0 if b.get("region") == hub_city else 1
        dist = haversine(hub_coords[0], hub_coords[1], b.get("lat", 20.0), b.get("lng", 78.0))
        return (same_region, dist)

    buyers.sort(key=_sort_key)
    return buyers[:50]


def append_credits_ledger(seller_id: str, credits_data: dict, item_id: str) -> None:
    ts = datetime.now(timezone.utc).isoformat()
    put_item("CreditsLedger", {
        "buyer_id": seller_id,
        "event_id": f"{ts}#{item_id}#earn",
        "timestamp": ts,
        "item_id": item_id,
        "action": "earn",
        "credits": credits_data["credits"],
        "co2_saved_kg": credits_data["co2_saved_kg"],
    })


def notify_seller_stub(item_id: str, seller_id: str, event: str,
                       buyer_id=None, risk=None) -> None:
    logger.info(
        "[notify-seller] item=%s seller=%s event=%s top_buyer=%s risk=%s",
        item_id, seller_id, event, buyer_id, risk,
    )


def assemble_result(item: dict) -> dict:
    passport_key = item.get("passport_key")
    passport_url = presign_passport(passport_key) if passport_key else None

    top_matches = []
    for m in (item.get("matches") or [])[:3]:
        buyer = get_item("Buyers", {"buyer_id": m["buyer_id"]}) or {}
        top_matches.append({
            "buyer_id": m["buyer_id"],
            "name": buyer.get("name", ""),
            "re_return_risk": m["re_return_risk"],
            "why_this_fits": m.get("why_this_fits", ""),
        })

    return {
        "item_id": item["item_id"],
        "status": item.get("status"),
        "grade": item.get("grade"),
        "disposition": item.get("disposition"),
        "base_price_inr": item.get("base_price_inr"),
        "co2_saved_kg": item.get("co2_saved_kg"),
        "credits": item.get("credits"),
        "trade_in_credit_inr": item.get("trade_in_credit_inr"),
        "passport_url": passport_url,
        "top_matches": top_matches,
        "warning_written": item.get("size_mismatch", False) or item.get("color_mismatch", False),
    }


# ---------------------------------------------------------------------------
# Core pipelines
# ---------------------------------------------------------------------------

def _run_agents(item: dict, s3_keys: list[str], trade_in: bool) -> None:
    """
    Shared agent pipeline (steps 3-10) used by both process_return and
    process_existing_item. Mutates item in place and syncs DynamoDB.
    """
    # 3. Grade
    grading = grade_item(item, s3_keys)
    update_item_fields(item, grading)

    # 4. Disposition
    disp = compute_disposition(item, grading["grade"], trade_in)
    update_item_fields(item, disp)

    if disp["disposition"] in ("resell", "refurbish", "exchange"):
        # 5. Base price = 90% of recovered value
        base_price = round(disp["recovered_value_inr"] * 0.90)
        update_item_field(item, "base_price_inr", base_price)

        # 6. Stage-1 candidate buyers
        candidates = query_buyers_stage1(item)

        # 7. Matching
        ranked = match_buyers(item, grading, candidates)
        update_item_field(item, "matches", ranked[:3])

        # 8. Green Credits
        min_dist = min(b["distance_km"] for b in ranked) if ranked else 1200
        credits_data = compute_credits(item, grading, min_dist)
        update_item_fields(item, credits_data)
        if item.get("seller_id"):
            append_credits_ledger(item["seller_id"], credits_data, item["item_id"])

        # 9. Trust Passport
        passport = generate_passport(item, grading, credits_data)
        update_item_field(item, "passport_key", passport["passport_key"])

    # 10. Prevention (reactive: correct listing + write flag)
    correct_listing(item, grading)
    write_listing_flag(item, grading)

    # 11. Final status
    final_status = (
        "listed"
        if disp["disposition"] in ("resell", "refurbish", "exchange")
        else disp["disposition"]
    )
    update_item_field(item, "status", final_status)

    # 12. Notify seller (fire-and-forget — never blocks response)
    try:
        if final_status == "listed" and item.get("seller_id"):
            top = (item.get("matches") or [{}])[0]
            notify_seller_stub(
                item["item_id"], item["seller_id"], "listed",
                top.get("buyer_id"), top.get("re_return_risk"),
            )
    except Exception:
        pass


def process_return(payload: dict, photo_paths: list[str], trade_in: bool = False) -> dict:
    # 1. Create item record (status=pending)
    item = create_item_record(payload)

    # 1b. Predictive prevention — carries forward any existing flag before grading
    predict_listing_flag(item)

    # 2. Upload photos to S3
    s3_keys = upload_photos(item["item_id"], photo_paths)
    update_item_field(item, "photo_keys", s3_keys)

    _run_agents(item, s3_keys, trade_in)
    return assemble_result(item)


def process_existing_item(item_id: str, trade_in: bool = False) -> dict:
    """
    Used by seed.py after items have already been inserted and photos uploaded.
    Does not create a new item — runs agents ①–⑦ on the existing pending record.
    """
    item = get_item("Items", {"item_id": item_id})
    assert item is not None, f"Item {item_id!r} not found in Items table"
    assert item["status"] == "pending", (
        f"Item {item_id!r} has status={item['status']!r}, expected 'pending'"
    )
    assert item.get("photo_keys"), f"Item {item_id!r} has no photo_keys set"

    predict_listing_flag(item)
    _run_agents(item, item["photo_keys"], trade_in)
    return assemble_result(item)
