import json
import logging
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Union

from dotenv import load_dotenv

# Load from project root .env so all env vars are available before any import
load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from db.dynamo import get_item, put_item, update_item
from orchestrator import process_return
from agents.pricing import recommend_circular_price
from agents.grading import grade_item_from_paths, grade_from_video

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

def _normalize_photos(photos: Optional[Union[UploadFile, List[UploadFile]]]) -> List[UploadFile]:
    """FastAPI may deserialize a single uploaded file as UploadFile instead of List[UploadFile]."""
    if photos is None:
        return []
    if isinstance(photos, list):
        return photos
    return [photos]


async def _save_uploads(photos: List[UploadFile]) -> list[str]:
    paths: list[str] = []
    for photo in photos:
        suffix = os.path.splitext(photo.filename or "photo.jpg")[1] or ".jpg"
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(await photo.read())
            paths.append(tmp.name)
    return paths


async def _save_video(video: UploadFile) -> str:
    with tempfile.NamedTemporaryFile(delete=False, suffix=".mp4") as tmp:
        tmp.write(await video.read())
        return tmp.name


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
    photos: Optional[Union[UploadFile, List[UploadFile]]] = File(default=None),
    trade_in: Optional[str] = Form(None),
    replacement_option: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
):
    item_payload = json.loads(payload)
    is_trade_in = trade_in is not None and trade_in.lower() == "true"

    photos_list = _normalize_photos(photos)
    if not photos_list and not video:
        raise HTTPException(status_code=422, detail="Provide at least one photo or a video.")

    # Inject replacement_option into payload so orchestrator can route it.
    # Accepted values: "direct_replacement" | "replace_with_resale" | None (standard return).
    if replacement_option:
        item_payload["replacement_option"] = replacement_option

    photo_paths = await _save_uploads(photos_list)
    video_path = await _save_video(video) if video else None
    try:
        result = process_return(item_payload, photo_paths, is_trade_in, video_path=video_path)
    finally:
        _cleanup(photo_paths)
        if video_path:
            _cleanup([video_path])

    return result


@app.post("/grade-preview")
async def post_grade_preview(
    category: str = Form(...),
    condition: str = Form("returned_open_box"),
    photos: Optional[Union[UploadFile, List[UploadFile]]] = File(default=None),
    video: Optional[UploadFile] = File(None),
):
    photos_list = _normalize_photos(photos)
    if not photos_list and not video:
        raise HTTPException(status_code=422, detail="Provide at least one photo or a video.")

    item = {
        "category": category,
        "seller_claimed_condition": condition,
        "name": "",
        "brand": "",
        "listed_size": "one-size",
        "listed_color": "unknown",
        "return_reason_code": "no_longer_needed",
        "return_reason_text": "",
        "history_note": f"Seller condition: {condition}",
    }

    photo_paths = await _save_uploads(photos_list)
    video_path = await _save_video(video) if video else None
    try:
        if video_path:
            try:
                grading = grade_from_video(item, video_path)
            except FileNotFoundError:
                # ffmpeg not installed — fall back to photos if available, else friendly error
                if photo_paths:
                    grading = grade_item_from_paths(item, photo_paths)
                else:
                    raise HTTPException(
                        status_code=422,
                        detail="Video grading requires ffmpeg. Please upload photos instead.",
                    )
            except Exception:
                if not photo_paths:
                    raise
                grading = grade_item_from_paths(item, photo_paths)
        else:
            grading = grade_item_from_paths(item, photo_paths)
    finally:
        _cleanup(photo_paths)
        if video_path:
            _cleanup([video_path])

    return {
        "grade": grading["grade"],
        "confidence": grading["confidence_bucket"],
        "wear_level": grading["wear_level"],
        "evidence": grading.get("evidence", []),
    }


@app.post("/community-list")
async def post_community_list(
    payload: str = Form(...),
    photos: Optional[Union[UploadFile, List[UploadFile]]] = File(default=None),
    trade_in: Optional[str] = Form(None),
    video: Optional[UploadFile] = File(None),
):
    item_payload = json.loads(payload)
    listing_price_inr = item_payload.get("listing_price_inr")

    photos_list = _normalize_photos(photos)
    if not photos_list and not video:
        raise HTTPException(status_code=422, detail="Provide at least one photo or a video.")

    photo_paths = await _save_uploads(photos_list)
    video_path = await _save_video(video) if video else None
    try:
        result = process_return(item_payload, photo_paths, False, video_path=video_path)
    finally:
        _cleanup(photo_paths)
        if video_path:
            _cleanup([video_path])

    # D or REVIEW: blocked from publishing; still return grade + recommended price for seller transparency
    if result.get("grade") in ("D", "REVIEW"):
        grade = result["grade"]
        original_price = item_payload.get("original_price_inr", 0)
        category = item_payload.get("category", "other")
        region = item_payload.get("return_hub_city", "Mumbai")
        rec = recommend_circular_price(original_price, grade, category, region) if original_price else None
        return {
            "status": result.get("disposition", "manual_review"),
            "grade": grade,
            "recommended_price_inr": rec["recommended_price"] if rec else None,
            "grade_factor": rec["grade_factor"] if rec else None,
            "demand_factor": rec["demand_factor"] if rec else None,
        }

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


@app.post("/catalog/audit-listings")
async def post_catalog_audit():
    """
    Run AI vision audits on all catalog products that have a seller_description
    and listing_id.  Writes ListingFlags for detected mismatches.

    Skips listings that already have a return-flow flag (flag_source != "listing_audit")
    so that real buyer-report data is never overwritten by the pre-purchase audit.
    """
    import json as _json
    from pathlib import Path as _Path
    from agents.catalog_audit import audit_catalog_listing
    from agents.prevention import write_catalog_listing_flag

    catalog_path = _Path(__file__).resolve().parent.parent / "frontend" / "data" / "catalog.json"
    with open(catalog_path) as f:
        catalog = _json.load(f)

    all_products = catalog.get("heroes", []) + catalog.get("filler", [])
    results = {"audited": 0, "flagged": 0, "skipped_existing": 0, "skipped_no_desc": 0}

    for product in all_products:
        listing_id = product.get("listing_id")
        seller_desc = product.get("seller_description")
        if not listing_id or not seller_desc:
            results["skipped_no_desc"] += 1
            continue

        existing = get_item("ListingFlags", {"listing_id": listing_id})
        if existing and existing.get("flag_source") != "listing_audit":
            results["skipped_existing"] += 1
            continue

        audit = audit_catalog_listing(
            catalog_id=product["catalog_id"],
            title=product["title"],
            category=product.get("category", ""),
            seller_description=seller_desc,
            image_url=product["image"],
        )
        results["audited"] += 1

        if audit["has_mismatch"] and audit["confidence"] != "low":
            write_catalog_listing_flag(listing_id, product["catalog_id"], audit)
            results["flagged"] += 1
            logging.info(
                "[catalog-audit] %s flagged: %s — %s",
                product["catalog_id"], audit["flag_type"], audit["mismatch_description"],
            )
        else:
            logging.info(
                "[catalog-audit] %s clean (has_mismatch=%s confidence=%s)",
                product["catalog_id"], audit["has_mismatch"], audit["confidence"],
            )

    return results


# ---------------------------------------------------------------------------
# Demand-side endpoints (Anupam adds here in feat/api-demand)
# ---------------------------------------------------------------------------

from db.dynamo import query_index, table, from_ddb
from db.s3 import presign_photo, presign_passport
from cache import make_cache_key, cache_get
from agents.matching import get_recommendations as _get_recommendations, risk_factors
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


# Demo order history for BUY-001.
#
# `seller_description` is the seller's ORIGINAL listing claim — it rides into
# the return payload so the AI discrepancy agent can compare it against what
# the returner reports (text-vs-text).
#
# Two items (Adidas ITM-006, Levi's ITM-009) intentionally use item_id =
# the catalog hero's `second_life_item_id` and listing_id = the catalog hero's
# `listing_id`. Those items are NOT pre-seeded as listed, so returning one
# creates exactly the item the product page references — demonstrating the full
# return → grade → list pipeline live. Their seller_description sets up a
# deliberate discrepancy (Adidas → colour, Levi's → size).
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
            "seller_description": "Nike Air Max 270 in classic Black colourway, US 10. True-to-size road running shoe with the oversized Air heel unit and breathable engineered-mesh upper.",
        },
        {
            "order_id": "402-9007781-4521190",
            "order_date": "2024-10-28",
            "item_id": "ITM-006",
            "listing_id": "LST-ADI-ULTRA-9",
            "name": "Adidas Ultraboost 22 Running Shoes",
            "brand": "Adidas",
            "category": "shoes",
            "listed_size": "UK 8",
            "listed_color": "white",
            "original_price_inr": 12999,
            "seller_description": "Adidas Ultraboost 22 in Cloud White colourway, UK 8. Premium BOOST midsole, Primeknit+ upper and Continental rubber outsole. Brand new in box, true to size.",
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
            "seller_description": "H&M Regular Fit Cotton T-Shirt in Olive Green, size M. 100% combed cotton, ribbed crew neck, true to size.",
        },
        {
            "order_id": "402-8899001-2233445",
            "order_date": "2024-08-07",
            "item_id": "ITM-009",
            "listing_id": "LST-LEVI-512-32",
            "name": "Levi's 512 Slim Taper Jeans",
            "brand": "Levi's",
            "category": "jeans",
            "listed_size": "32x30",
            "listed_color": "dark blue",
            "original_price_inr": 3999,
            "seller_description": "Levi's 512 Slim Taper Jeans, 32x30, in a Dark Blue wash. True to size with a slim fit through the thigh tapering to the ankle. Brand new with tags.",
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
            "seller_description": "WildCraft 30L Laptop Backpack in Black. Padded sleeve fits laptops up to 15.6-inch, water-resistant fabric, multiple compartments.",
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
            "seller_description": "boAt Rockerz 500 Bluetooth headphones in Black. Over-ear design, 20-hour playback, deep bass. Brand new, factory sealed.",
        },
    ]
}


@app.get("/buyers/{buyer_id}/orders")
async def get_buyer_orders(buyer_id: str):
    orders = _ORDER_HISTORY.get(buyer_id, [])
    # Hide orders that have already been returned — once an order's item exists
    # in the Items table (a return created it), it should no longer be
    # selectable for return.
    visible = [o for o in orders if not get_item("Items", {"item_id": o["item_id"]})]
    return {"buyer_id": buyer_id, "orders": visible}


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
async def get_buyer_recommendations(buyer_id: str, limit: int = 10, cart: str = ""):
    limit = min(limit, 25)
    cart_item_ids = [c.strip() for c in cart.split(",") if c.strip()] if cart else []

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

        # Seed pre-warms with empty cart — check that base cache is warm.
        no_cart_secondary = f"{sorted_ids}||cart:{json.dumps([])}"
        no_cart_cache_key = make_cache_key(
            "recommendations", buyer_id.encode(), no_cart_secondary, "v2",
            os.environ["BEDROCK_TEXT_MODEL_ID"],
        )
        if not cache_get(no_cart_cache_key):
            return JSONResponse(
                status_code=503,
                content={"error": {
                    "code": "BEDROCK_CACHE_MISS",
                    "message": "Recommendation cache is cold. Run seed.py to warm the cache.",
                    "details": {},
                }},
            )

        # If cart-aware cache hasn't been populated, fall back to no-cart to avoid a Bedrock call.
        if cart_item_ids:
            cart_secondary = f"{sorted_ids}||cart:{json.dumps(sorted(cart_item_ids))}"
            cart_cache_key = make_cache_key(
                "recommendations", buyer_id.encode(), cart_secondary, "v2",
                os.environ["BEDROCK_TEXT_MODEL_ID"],
            )
            if not cache_get(cart_cache_key):
                cart_item_ids = []

    items = _get_recommendations(buyer_id, limit, cart_item_ids=cart_item_ids or None)
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
            "distance_km": item.get("distance_km", 0),
            # XAI transparency fields
            "xai_reason_neutralized": item.get("xai_reason_neutralized", "none"),
            "xai_reason_recurrence": item.get("xai_reason_recurrence", "none"),
            "xai_grade_factor": item.get("xai_grade_factor", 0.0),
            "xai_defects": item.get("xai_defects", []),
            "xai_grading_notes": item.get("xai_grading_notes", ""),
        })
    return {"buyer_id": buyer_id, "items": enriched}


def _enrich_matches(item: dict) -> list:
    """Enrich match entries with buyer name and deterministic risk breakdown."""
    enriched = []
    grading = {
        "grade": item.get("grade", "B"),
        "detected_category": item.get("category", ""),
        "detected_size": item.get("detected_size", item.get("listed_size", "unknown")),
    }
    for m in item.get("matches", []):
        buyer = get_item("Buyers", {"buyer_id": m["buyer_id"]}) or {}
        factors = risk_factors(buyer, item, grading)
        enriched.append({
            **m,
            "buyer_name": buyer.get("name", ""),
            "risk_factors": factors,
        })
    return enriched


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
        "portfolio_recovered_value_inr": item.get("portfolio_recovered_value_inr", 0),
        "portfolio_recovery_basis_inr": item.get("portfolio_recovery_basis_inr", 0),
        "portfolio_recovery_aov_low_inr": item.get("portfolio_recovery_aov_low_inr", 800),
        "portfolio_recovery_aov_high_inr": item.get("portfolio_recovery_aov_high_inr", 1200),
        "recovery_metric_basis": item.get("recovery_metric_basis", ""),
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
        "matches": _enrich_matches(item),
        # Grading evidence — proves AI inspection is real, not hardcoded
        "evidence": item.get("evidence", []),
        "defects": item.get("defects", []),
        "wear_level": item.get("wear_level", ""),
        "functional_status": item.get("functional_status", ""),
        "confidence_bucket": item.get("confidence_bucket", ""),
        "grade_bucket": item.get("grade_bucket", ""),
        "detected_color": item.get("detected_color", ""),
        "detected_size": item.get("detected_size", ""),
        "size_mismatch": item.get("size_mismatch", False),
        "color_mismatch": item.get("color_mismatch", False),
        "mismatch_notes": item.get("mismatch_notes", ""),
        "rubric_version": item.get("rubric_version", ""),
        "grader_model": "AI Vision Model · AWS Bedrock",
        "image_embedding_cache_id": item.get("image_embedding_cache_id", ""),
        "image_embedding_model_id": item.get("image_embedding_model_id", ""),
        "image_embedding_dimensions": item.get("image_embedding_dimensions", 0),
        "image_similarity_score": item.get("image_similarity_score", 0),
        "image_similarity_threshold": item.get("image_similarity_threshold", 0),
        "image_cache_hit": item.get("image_cache_hit", False),
        "video_graded": bool(item.get("video_graded", False)),
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

    # Primary path: text fields stored directly on the item record (set by passport.py)
    if item.get("passport_summary"):
        passport = {
            "summary": item["passport_summary"],
            "condition_statement": item.get("passport_condition", ""),
            "why_returned": item.get("passport_why_returned", ""),
            "buyer_reassurance": item.get("passport_reassurance", ""),
        }
    else:
        # Fallback: try cache key reconstruction (may fail for int/float co2 mismatch)
        grade = item.get("grade", "")
        defects = item.get("defects", [])
        history_note = item.get("history_note", "")
        co2_saved_kg = item.get("co2_saved_kg", 0)
        secondary_str = (
            grade
            + str(sorted(str(d) for d in defects))
            + history_note
            + str(float(co2_saved_kg))  # normalise to float to match generation-time str()
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
            "brand": item.get("brand", ""),
            "category": item.get("category", ""),
            "status": item.get("status", ""),
            "grade": item.get("grade", ""),
            "disposition": item.get("disposition", ""),
            "base_price_inr": item.get("base_price_inr", 0),
            "original_price_inr": item.get("original_price_inr", 0),
            "portfolio_recovered_value_inr": item.get("portfolio_recovered_value_inr", 0),
            "portfolio_recovery_basis_inr": item.get("portfolio_recovery_basis_inr", 0),
            "portfolio_recovery_aov_low_inr": item.get("portfolio_recovery_aov_low_inr", 800),
            "portfolio_recovery_aov_high_inr": item.get("portfolio_recovery_aov_high_inr", 1200),
            "recovery_metric_basis": item.get("recovery_metric_basis", ""),
            "top_match_buyer_id": top.get("buyer_id"),
            "top_match_risk": top.get("re_return_risk"),
            "top_match_why": top.get("why_this_fits", ""),
            "size_mismatch": item.get("size_mismatch", False),
            "color_mismatch": item.get("color_mismatch", False),
            "defects": item.get("defects", []),
            "grading_notes": item.get("history_note", ""),
            "listing_type": item.get("listing_type", ""),
            "listing_notes": item.get("listing_notes", ""),
            "replacement_queued": item.get("replacement_queued", False),
            "co2_saved_kg": item.get("co2_saved_kg", 0),
            "credits": item.get("credits", 0),
            "evidence": item.get("evidence", []),
            "confidence_bucket": item.get("confidence_bucket", ""),
            "wear_level": item.get("wear_level", ""),
            "rubric_version": item.get("rubric_version", ""),
            "image_embedding_cache_id": item.get("image_embedding_cache_id", ""),
            "image_embedding_model_id": item.get("image_embedding_model_id", ""),
            "image_embedding_dimensions": item.get("image_embedding_dimensions", 0),
            "image_similarity_score": item.get("image_similarity_score", 0),
            "image_similarity_threshold": item.get("image_similarity_threshold", 0),
            "image_cache_hit": item.get("image_cache_hit", False),
            "top_match_risk_raw": None,  # placeholder — recomputed client-side
        })
    return {"items": ops_items}


@app.post("/items/{item_id}/request-review")
async def request_item_review(item_id: str):
    item = get_item("Items", {"item_id": item_id})
    if not item:
        raise HTTPException(
            status_code=404,
            detail={"error": {"code": "NOT_FOUND", "message": f"Item {item_id} not found", "details": {}}},
        )
    update_item("Items", {"item_id": item_id}, {"status": "manual_review"})
    logging.info(
        "[HITL] Human review requested for item=%s grade=%s disposition=%s",
        item_id, item.get("grade", "unknown"), item.get("disposition", "unknown"),
    )
    return {
        "item_id": item_id,
        "status": "manual_review",
        "message": "Human review requested. A circular commerce expert will verify this item.",
    }


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
