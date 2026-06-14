import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional

from dotenv import load_dotenv

# Load from project root .env so all env vars are available before any import
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from db.dynamo import get_item, put_item, update_item
from orchestrator import process_return
from agents.pricing import recommend_circular_price

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SecondLife Backend")

_cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", "http://localhost:3000").split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

async def _save_uploads(photos: List[UploadFile]) -> list[str]:
    paths: list[str] = []
    for photo in photos:
        suffix = os.path.splitext(photo.filename or "photo.jpg")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await photo.read())
            paths.append(tmp.name)
    return paths


def _cleanup(paths: list[str]) -> None:
    for p in paths:
        try:
            os.unlink(p)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Supply-side endpoints (Arush)
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    return {
        "ok": True,
        "service": "secondlife-backend",
        "env": os.environ.get("APP_ENV", "local"),
        "aws_region": os.environ.get("AWS_DEFAULT_REGION", "ap-south-1"),
    }


@app.get("/config")
async def config():
    return {
        "api_base_url": os.environ.get("API_BASE_URL", "http://localhost:8000"),
        "demo_buyer_id": "BUY-001",
        "demo_item_id": "ITM-001",
        "demo_listing_id": "LST-NIKE-AIR-270-BLK-10",
    }


@app.post("/returns")
async def post_returns(
    payload: str = Form(...),
    photos: List[UploadFile] = File(...),
    trade_in: Optional[str] = Form(None),
):
    item_payload = json.loads(payload)
    is_trade_in = trade_in is not None and trade_in.lower() == "true"

    photo_paths = await _save_uploads(photos)
    try:
        result = process_return(item_payload, photo_paths, is_trade_in)
    finally:
        _cleanup(photo_paths)

    return result


@app.post("/community-list")
async def post_community_list(
    payload: str = Form(...),
    photos: List[UploadFile] = File(...),
    trade_in: Optional[str] = Form(None),
):
    item_payload = json.loads(payload)
    listing_price_inr = item_payload.get("listing_price_inr")

    photo_paths = await _save_uploads(photos)
    try:
        result = process_return(item_payload, photo_paths, False)
    finally:
        _cleanup(photo_paths)

    # D or REVIEW: blocked from publishing, return minimal status
    if result.get("grade") in ("D", "REVIEW"):
        return {"status": result.get("disposition", "manual_review")}

    # Use seller-set listing price when provided; persist to DynamoDB so
    # downstream reads (recommendations, ops) see the correct asking price.
    if listing_price_inr is not None:
        price = int(listing_price_inr)
        result["base_price_inr"] = price
        update_item("Items", {"item_id": result["item_id"]}, {"base_price_inr": price})

    return result


@app.get("/listings/recommend-price")
async def get_recommend_price(
    original_price: int,
    grade: str,
    category: str,
    region: str,
):
    breakdown = recommend_circular_price(original_price, grade, category, region)
    return {
        "original_price": original_price,
        "grade": grade.upper(),
        "category": category.lower(),
        "region": region,
        **breakdown,
    }


@app.get("/listings/{listing_id}/warning")
async def get_listing_warning(listing_id: str):
    flag = get_item("ListingFlags", {"listing_id": listing_id})
    if flag:
        return {"has_warning": True, **flag}
    return {"listing_id": listing_id, "has_warning": False}


# ---------------------------------------------------------------------------
# Demand-side endpoints (Anupam adds here in feat/api-demand)
# ---------------------------------------------------------------------------

from db.dynamo import query_index, table, from_ddb
from db.s3 import presign_photo, presign_passport
from cache import make_cache_key, cache_get
from agents.matching import get_recommendations as _get_recommendations
from fastapi.responses import JSONResponse

_DEMO_MODE = os.environ.get("DEMO_MODE", "false").lower() == "true"


@app.get("/buyers")
async def get_buyers(
    region: Optional[str] = None,
    category: Optional[str] = None,
    limit: int = 50,
):
    resp = table("Buyers").scan()
    buyers = from_ddb(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = table("Buyers").scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        buyers.extend(from_ddb(resp.get("Items", [])))

    if region:
        buyers = [b for b in buyers if b.get("region") == region]
    if category:
        buyers = [
            b for b in buyers
            if category in b.get("category_interests", [])
            or b.get("primary_category") == category
        ]

    return {
        "buyers": [
            {
                "buyer_id": b["buyer_id"],
                "name": b.get("name", ""),
                "region": b.get("region", ""),
                "primary_category": b.get("primary_category", ""),
                "credit_score": b.get("credit_score", 0),
                "return_rate": b.get("return_rate", 0.0),
            }
            for b in buyers[:limit]
        ]
    }


_ORDER_HISTORY: dict = {
    "BUY-001": [
        {
            "order_id": "402-7823451-1234567",
            "order_date": "2024-11-12",
            "item_id": "ORD-001",
            "listing_id": "LST-NIKE-AIR-270-BLK-10",
            "name": "Nike Air Max 270",
            "brand": "Nike",
            "category": "shoes",
            "listed_size": "US 10",
            "listed_color": "black",
            "original_price_inr": 9999,
        },
        {
            "order_id": "402-6541230-9876543",
            "order_date": "2024-10-03",
            "item_id": "ORD-002",
            "listing_id": "LST-HM-SHIRT-OLIVE-M",
            "name": "H&M Cotton T-Shirt",
            "brand": "H&M",
            "category": "shirt",
            "listed_size": "M",
            "listed_color": "olive",
            "original_price_inr": 1499,
        },
        {
            "order_id": "402-1122334-5566778",
            "order_date": "2024-09-18",
            "item_id": "ORD-003",
            "listing_id": "LST-WILDCRAFT-BAG-BLK",
            "name": "WildCraft Laptop Bag",
            "brand": "WildCraft",
            "category": "bag",
            "listed_size": "one-size",
            "listed_color": "black",
            "original_price_inr": 1899,
        },
        {
            "order_id": "402-8899001-2233445",
            "order_date": "2024-08-07",
            "item_id": "ORD-004",
            "listing_id": "LST-LEVI-512-BLUE-32",
            "name": "Levi's 512 Slim Taper Jeans",
            "brand": "Levi's",
            "category": "jeans",
            "listed_size": "32x30",
            "listed_color": "blue",
            "original_price_inr": 3999,
        },
        {
            "order_id": "402-5544332-1122009",
            "order_date": "2024-07-21",
            "item_id": "ORD-005",
            "listing_id": "LST-BOAT-BT500-BLK",
            "name": "boAt Rockerz 500 Bluetooth Headphones",
            "brand": "boAt",
            "category": "headphones",
            "listed_size": "one-size",
            "listed_color": "black",
            "original_price_inr": 2499,
        },
    ]
}


@app.get("/buyers/{buyer_id}/orders")
async def get_buyer_orders(buyer_id: str):
    orders = _ORDER_HISTORY.get(buyer_id, [])
    return {"buyer_id": buyer_id, "orders": orders}


@app.get("/buyers/{buyer_id}")
async def get_buyer(buyer_id: str):
    buyer = get_item("Buyers", {"buyer_id": buyer_id})
    if not buyer:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": f"Buyer {buyer_id} not found", "details": {}}},
        )
    return buyer


@app.get("/buyers/{buyer_id}/recommendations")
async def get_buyer_recommendations(buyer_id: str, limit: int = 10):
    limit = min(limit, 25)

    if _DEMO_MODE:
        buyer = get_item("Buyers", {"buyer_id": buyer_id})
        if not buyer:
            raise HTTPException(
                status_code=404,
                detail={"error": {"code": "NOT_FOUND", "message": f"Buyer {buyer_id} not found", "details": {}}},
            )
        # Replicate _query_items_for_buyer to build the cache key without calling Bedrock
        seen: set = set()
        candidates: list = []
        for cat in buyer.get("category_interests", []):
            rows = query_index(
                "Items", "StatusCategoryIndex",
                "status = :s AND category = :c",
                {":s": "listed", ":c": cat},
            )
            for row in rows:
                if row["item_id"] not in seen:
                    seen.add(row["item_id"])
                    candidates.append(row)
            if len(candidates) >= 50:
                break
        candidates = candidates[:50]

        sorted_ids = json.dumps(sorted(i["item_id"] for i in candidates))
        cache_key = make_cache_key(
            "recommendations", buyer_id.encode(), sorted_ids, "v1",
            os.environ["BEDROCK_TEXT_MODEL_ID"],
        )
        if not cache_get(cache_key):
            return JSONResponse(
                status_code=503,
                content={"error": {
                    "code": "BEDROCK_CACHE_MISS",
                    "message": "Recommendation cache is cold. Run seed.py to warm the cache.",
                    "details": {},
                }},
            )

    items = _get_recommendations(buyer_id, limit)
    # Remove items the buyer themselves listed for sale
    items = [i for i in items if i.get("seller_id") != buyer_id]
    enriched = []
    for item in items:
        photo_keys = item.get("photo_keys", [])
        photo_url = presign_photo(photo_keys[0]) if photo_keys else ""
        passport_key = item.get("passport_key", "")
        passport_url = presign_passport(passport_key) if passport_key else ""
        enriched.append({
            "item_id": item.get("item_id", ""),
            "listing_id": item.get("listing_id", ""),
            "brand": item.get("brand", ""),
            "name": item.get("name", ""),
            "category": item.get("category", ""),
            "grade": item.get("grade", ""),
            "original_price_inr": item.get("original_price_inr", 0),
            "price_inr": item.get("price_inr", item.get("base_price_inr", 0)),
            "photo_url": photo_url,
            "passport_url": passport_url,
            "return_hub_city": item.get("return_hub_city", ""),
            "ship_eta_days": item.get("ship_eta_days", 1),
            "co2_saved_kg": item.get("co2_saved_kg", 0),
            "credits": item.get("credits", 0),
            "re_return_risk": item.get("re_return_risk", 0.0),
            "why_this_fits": item.get("why_this_fits", ""),
        })
    return {"buyer_id": buyer_id, "items": enriched}


@app.get("/items/{item_id}")
async def get_item_detail(item_id: str):
    item = get_item("Items", {"item_id": item_id})
    if not item:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": f"Item {item_id} not found", "details": {}}},
        )
    photo_urls = [presign_photo(k) for k in item.get("photo_keys", [])]
    passport_key = item.get("passport_key", "")
    passport_url = presign_passport(passport_key) if passport_key else ""
    return {
        "item_id": item["item_id"],
        "listing_id": item.get("listing_id", ""),
        "category": item.get("category", ""),
        "brand": item.get("brand", ""),
        "name": item.get("name", ""),
        "status": item.get("status", ""),
        "grade": item.get("grade", ""),
        "disposition": item.get("disposition", ""),
        "original_price_inr": item.get("original_price_inr", 0),
        "base_price_inr": item.get("base_price_inr", 0),
        "listed_size": item.get("listed_size", ""),
        "listed_color": item.get("listed_color", ""),
        "return_reason_code": item.get("return_reason_code", ""),
        "return_reason_text": item.get("return_reason_text", ""),
        "return_hub_city": item.get("return_hub_city", ""),
        "photo_urls": photo_urls,
        "passport_url": passport_url,
        "seller_id": item.get("seller_id", ""),
        "owner_count": item.get("owner_count", 1),
        "co2_saved_kg": item.get("co2_saved_kg", 0),
        "credits": item.get("credits", 0),
        "matches": item.get("matches", []),
    }


@app.get("/items/{item_id}/passport")
async def get_item_passport(item_id: str):
    item = get_item("Items", {"item_id": item_id})
    if not item:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": f"Item {item_id} not found", "details": {}}},
        )
    passport_key = item.get("passport_key", f"passports/{item_id}.html")
    passport_url = presign_passport(passport_key)

    grade = item.get("grade", "")
    defects = item.get("defects", [])
    history_note = item.get("history_note", "")
    co2_saved_kg = item.get("co2_saved_kg", 0)
    secondary_str = (
        grade
        + str(sorted(str(d) for d in defects))
        + history_note
        + str(co2_saved_kg)
    )
    cache_key = make_cache_key(
        "passport", item_id.encode(), secondary_str,
        "v1", os.environ["BEDROCK_TEXT_MODEL_ID"],
    )
    raw = cache_get(cache_key)
    _PASSPORT_KEYS = {"summary", "condition_statement", "why_returned", "buyer_reassurance"}
    passport = {k: v for k, v in raw.items() if k in _PASSPORT_KEYS} if raw else raw
    return {"item_id": item_id, "passport_url": passport_url, "passport": passport}


@app.get("/ops/items")
async def get_ops_items(status: Optional[str] = None, limit: int = 50):
    if status:
        rows = query_index(
            "Items", "StatusCategoryIndex",
            "status = :s",
            {":s": status},
        )
    else:
        resp = table("Items").scan()
        rows = from_ddb(resp.get("Items", []))
        while "LastEvaluatedKey" in resp:
            resp = table("Items").scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
            rows.extend(from_ddb(resp.get("Items", [])))

    ops_items = []
    for item in rows[:limit]:
        matches = item.get("matches", [])
        top = matches[0] if matches else {}
        ops_items.append({
            "item_id": item.get("item_id", ""),
            "name": item.get("name", ""),
            "status": item.get("status", ""),
            "grade": item.get("grade", ""),
            "disposition": item.get("disposition", ""),
            "base_price_inr": item.get("base_price_inr", 0),
            "top_match_buyer_id": top.get("buyer_id"),
            "top_match_risk": top.get("re_return_risk"),
            "size_mismatch": item.get("size_mismatch", False),
            "color_mismatch": item.get("color_mismatch", False),
        })
    return {"items": ops_items}


@app.get("/search/suggestions")
async def get_search_suggestions(q: str = "", limit: int = 8):
    if not q or len(q) < 2:
        return {"suggestions": []}

    q_lower = q.lower()
    resp = table("Items").scan()
    rows = from_ddb(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = table("Items").scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        rows.extend(from_ddb(resp.get("Items", [])))

    seen: set = set()
    suggestions = []
    for item in rows:
        name = item.get("name", "")
        brand = item.get("brand", "")
        category = item.get("category", "")
        if any(q_lower in field.lower() for field in [name, brand, category]):
            label = name
            if label not in seen:
                seen.add(label)
                suggestions.append({
                    "label": label,
                    "item_id": item.get("item_id"),
                    "category": category,
                    "brand": brand,
                })
        if len(suggestions) >= limit:
            break

    return {"suggestions": suggestions}


@app.get("/search")
async def search_items(q: str = "", limit: int = 20):
    if not q:
        return {"items": [], "query": q}

    q_lower = q.lower()
    resp = table("Items").scan()
    rows = from_ddb(resp.get("Items", []))
    while "LastEvaluatedKey" in resp:
        resp = table("Items").scan(ExclusiveStartKey=resp["LastEvaluatedKey"])
        rows.extend(from_ddb(resp.get("Items", [])))

    results = []
    for item in rows:
        name = item.get("name", "")
        brand = item.get("brand", "")
        category = item.get("category", "")
        if any(q_lower in field.lower() for field in [name, brand, category]):
            photo_keys = item.get("photo_keys", [])
            photo_url = presign_photo(photo_keys[0]) if photo_keys else ""
            results.append({
                "item_id": item.get("item_id"),
                "name": item.get("name", ""),
                "brand": item.get("brand", ""),
                "category": item.get("category", ""),
                "grade": item.get("grade", ""),
                "status": item.get("status", ""),
                "base_price_inr": item.get("base_price_inr", 0),
                "original_price_inr": item.get("original_price_inr", 0),
                "photo_url": photo_url,
                "return_hub_city": item.get("return_hub_city", ""),
                "co2_saved_kg": item.get("co2_saved_kg", 0),
                "credits": item.get("credits", 0),
            })
        if len(results) >= limit:
            break

    return {"items": results, "query": q}


@app.post("/notify-seller")
async def notify_seller(body: dict):
    logging.info(
        f"[notify-seller] item={body.get('item_id')} event={body.get('event')} "
        f"seller={body.get('seller_id')}"
    )
    return {"notified": True, "channel": "log"}


@app.post("/credits/redeem")
async def redeem_credits(body: dict):
    buyer_id = body.get("buyer_id")
    item_id = body.get("item_id")
    credits_to_use = int(body.get("credits_to_use", 0))

    # Step 1: Load buyer and item
    buyer = get_item("Buyers", {"buyer_id": buyer_id})
    if not buyer:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": f"Buyer {buyer_id} not found", "details": {}}},
        )
    item = get_item("Items", {"item_id": item_id})
    if not item:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": f"Item {item_id} not found", "details": {}}},
        )

    base_price = item.get("base_price_inr", 0)

    # Step 2: Compute credits_applied — capped at 20% of item price
    credits_applied = min(
        credits_to_use,
        buyer.get("credit_score", 0),
        round(base_price * 0.20),
    )

    # Step 3: Final price
    final_price = base_price - credits_applied

    # Step 4: Decrement credit_score in Buyers
    new_credit_score = buyer.get("credit_score", 0) - credits_applied
    update_item("Buyers", {"buyer_id": buyer_id}, {"credit_score": new_credit_score})

    # Step 5: Write CreditsLedger row
    now_iso = datetime.now(timezone.utc).isoformat()
    put_item("CreditsLedger", {
        "buyer_id": buyer_id,
        "event_id": f"{now_iso}#{item_id}#redemption",
        "timestamp": now_iso,
        "item_id": item_id,
        "action": "redemption",
        "credits": -credits_applied,
        "co2_saved_kg": 0,
    })

    # Step 6: Return response
    return {
        "buyer_id": buyer_id,
        "item_id": item_id,
        "credits_used": credits_applied,
        "discount_inr": credits_applied,
        "final_price_inr": final_price,
        "remaining_credits": new_credit_score,
    }
