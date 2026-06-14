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

logging.basicConfig(level=logging.INFO)

app = FastAPI(title="SecondLife Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("CORS_ORIGINS", "http://localhost:3000")],
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

    # Use seller-set listing price when provided
    if listing_price_inr is not None:
        result["base_price_inr"] = int(listing_price_inr)

    return result


@app.get("/listings/{listing_id}/warning")
async def get_listing_warning(listing_id: str):
    flag = get_item("ListingFlags", {"listing_id": listing_id})
    if flag:
        return {"has_warning": True, **flag}
    return {"listing_id": listing_id, "has_warning": False}


# ---------------------------------------------------------------------------
# Demand-side endpoints (Anupam adds here in feat/api-demand)
# ---------------------------------------------------------------------------
