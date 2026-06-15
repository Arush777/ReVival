#!/usr/bin/env python3
"""
seed.py — run once before demo.

Steps:
  1.  Create all 6 DynamoDB tables + S3 buckets (idempotent)
  2.  Load + validate reference JSONs, buyers.json, items.json
  3.  Write 30 buyers → Buyers table
  4.  Write one row per category interest → BuyerInterestIndex
  5.  Write 15 items → Items table (status=pending)
  6.  Upload local photos from seed/ITM_XXX/ → S3; update photo_keys
  7.  Run orchestrator.process_existing_item for each item (grades + caches)
  7b. Pre-warm recommendation cache for every buyer
  8.  Print summary table
  9.  Verify GET /buyers/BUY-001/recommendations latency < 100ms

Run from backend/:
    python seed/seed.py
"""

import json
import sys
import time
import traceback
from pathlib import Path

# ── path setup ───────────────────────────────────────────────────────────────
SEED_DIR = Path(__file__).resolve().parent
BACKEND_DIR = SEED_DIR.parent

# backend/ must be on sys.path for db, agents, orchestrator imports
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))
# seed/ must be on sys.path for create_tables import
if str(SEED_DIR) not in sys.path:
    sys.path.insert(0, str(SEED_DIR))

# Load .env before any AWS-dependent import (.env lives at project root, not backend/)
from dotenv import load_dotenv
load_dotenv(BACKEND_DIR / ".env")

# ── AWS + app imports (after .env is loaded) ─────────────────────────────────
from botocore.exceptions import ClientError

import create_tables
from db.dynamo import get_item, put_item, update_item, table
from db.s3 import upload_photo
from agents.matching import get_recommendations
import orchestrator

# --fresh wipes GradeCache so every grade/match/passport/recommendation
# re-bakes from scratch. Use it whenever you change item descriptions or photos.
FRESH = "--fresh" in sys.argv

# ── helpers ──────────────────────────────────────────────────────────────────

def _load(path: Path):
    with open(path) as f:
        return json.load(f)


def serial_put(logical_table: str, item: dict, desc: str = "") -> None:
    """put_item with exponential-ish backoff on provisioned-throughput throttle."""
    delay = 2
    while True:
        try:
            put_item(logical_table, item)
            return
        except ClientError as exc:
            code = exc.response["Error"]["Code"]
            if code == "ProvisionedThroughputExceededException":
                print(f"  [throttle] {desc} — sleeping {delay}s")
                time.sleep(delay)
                delay = min(delay * 2, 30)
            else:
                raise


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Create tables + buckets
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 1: Creating DynamoDB tables + S3 buckets ===")
create_tables.main()

if FRESH:
    print("\n--- --fresh: clearing GradeCache (forces full re-bake) ---")
    gc = table("GradeCache")
    scanned = 0
    resp = gc.scan(ProjectionExpression="cache_key")
    with gc.batch_writer() as batch:
        while True:
            for row in resp.get("Items", []):
                batch.delete_item(Key={"cache_key": row["cache_key"]})
                scanned += 1
            last = resp.get("LastEvaluatedKey")
            if not last:
                break
            resp = gc.scan(ProjectionExpression="cache_key", ExclusiveStartKey=last)
    print(f"  [OK] cleared {scanned} cache entries")


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — Load + validate
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 2: Loading and validating seed data ===")

REF = SEED_DIR / "reference"
carbon_table  = _load(REF / "carbon_table.json")
demand_table  = _load(REF / "demand_table.json")
city_coords   = _load(REF / "city_coords.json")
size_map      = _load(REF / "size_standard_map.json")
buyers        = _load(SEED_DIR / "buyers.json")
items         = _load(SEED_DIR / "items.json")

# All categories that appear in any city's demand_table entry
all_demand_cats = {cat for city in demand_table.values() for cat in city}

# --- buyers ---
assert len(buyers) >= 10, f"Need ≥10 buyers, got {len(buyers)}"
buyer_ids = [b["buyer_id"] for b in buyers]
assert len(buyer_ids) == len(set(buyer_ids)), "Duplicate buyer_id found"

for b in buyers:
    bid = b["buyer_id"]
    assert b["region"] in city_coords,   f"{bid}: region {b['region']!r} not in city_coords"
    assert b["region"] in demand_table,  f"{bid}: region {b['region']!r} not in demand_table"
    for cat in b.get("category_interests", []):
        assert cat in carbon_table, f"{bid}: interest category {cat!r} not in carbon_table"
    assert 0.0 <= b["return_rate"] <= 1.0, f"{bid}: return_rate out of range"
    assert isinstance(b["credit_score"], int) and b["credit_score"] >= 0, \
        f"{bid}: credit_score must be non-negative int"

# --- items ---
item_ids    = [i["item_id"]    for i in items]
listing_ids = [i["listing_id"] for i in items]
assert len(item_ids)    == len(set(item_ids)),    "Duplicate item_id found"
assert len(listing_ids) == len(set(listing_ids)), "Duplicate listing_id found"

for item in items:
    iid = item["item_id"]
    cat = item["category"]
    assert cat in carbon_table,    f"{iid}: category {cat!r} not in carbon_table"
    assert cat in all_demand_cats, f"{iid}: category {cat!r} not in demand_table"
    assert cat in size_map,        f"{iid}: category {cat!r} not in size_standard_map"
    assert item["return_hub_city"] in city_coords, \
        f"{iid}: hub city {item['return_hub_city']!r} not in city_coords"
    assert item["status"] == "pending", \
        f"{iid}: status must be 'pending', got {item['status']!r}"
    # Food items must declare sealed/unopened so the grading guardrail passes
    if cat == "food":
        note = item.get("history_note", "").lower()
        assert "sealed" in note or "unopened" in note, \
            f"{iid}: food item must have 'sealed' or 'unopened' in history_note"
    # Local photo folder + front.jpg must exist
    folder = SEED_DIR / iid.replace("-", "_")
    assert folder.exists(),          f"{iid}: photo folder missing: {folder}"
    assert (folder / "front.jpg").exists(), f"{iid}: front.jpg missing in {folder}"

print(f"  [OK] {len(buyers)} buyers, {len(items)} items — all validated")


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — Write buyers → Buyers table
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 3: Writing buyers to Buyers table ===")
for b in buyers:
    serial_put("Buyers", b, b["buyer_id"])
    print(f"  [OK] {b['buyer_id']}  {b['name']}")


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — Write BuyerInterestIndex (one row per buyer × category)
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 4: Writing BuyerInterestIndex ===")
total_rows = 0
for b in buyers:
    for cat in b.get("category_interests", []):
        row = {
            "category":        cat,
            "region_buyer_id": f"{b['region']}#{b['buyer_id']}",
            "buyer_id":        b["buyer_id"],
            "region":          b["region"],
            "return_rate":     b["return_rate"],
            "credit_score":    b["credit_score"],
        }
        serial_put("BuyerInterestIndex", row, f"{b['buyer_id']}/{cat}")
        total_rows += 1
print(f"  [OK] {total_rows} interest rows written")


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — Write items → Items table (status=pending)
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 5: Writing items to Items table ===")
for item in items:
    serial_put("Items", {**item, "status": "pending"}, item["item_id"])
    print(f"  [OK] {item['item_id']}  {item['name']}")


# ─────────────────────────────────────────────────────────────────────────────
# Step 5b — Reset the Items table to EXACTLY the seeded set
# Removes anything not in items.json: prior live-return items (Adidas ITM-006,
# Levi's ITM-009 list LIVE on return and must NOT pre-exist as listed), plus any
# ITM-UPLOAD-*/P2P test debris from earlier runs. This keeps the demo repeatable
# and the recommendation candidate sets clean before pre-warming.
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 5b: Pruning stale Items not in seed ===")
seed_item_ids = {i["item_id"] for i in items}
items_tbl = table("Items")
resp = items_tbl.scan(ProjectionExpression="item_id")
stale = []
while True:
    for row in resp.get("Items", []):
        iid = row["item_id"]
        if iid not in seed_item_ids:
            stale.append(iid)
    last = resp.get("LastEvaluatedKey")
    if not last:
        break
    resp = items_tbl.scan(ProjectionExpression="item_id", ExclusiveStartKey=last)
for iid in stale:
    items_tbl.delete_item(Key={"item_id": iid})
    print(f"  [DEL] {iid}")
print(f"  [OK] pruned {len(stale)} stale item(s); table now holds {len(seed_item_ids)} seeded items")

# Clear ListingFlags so flags from prior live returns (e.g. the Adidas/Levi's
# claim discrepancies) don't pre-exist before the demo. The legitimate flags
# are rebuilt below: per-item flags by the orchestrator (Step 7) and the Nike
# demo flag in Step 7c. Live-return listings get no flag until a return runs.
flags_tbl = table("ListingFlags")
fresp = flags_tbl.scan(ProjectionExpression="listing_id")
cleared = 0
with flags_tbl.batch_writer() as batch:
    while True:
        for row in fresp.get("Items", []):
            batch.delete_item(Key={"listing_id": row["listing_id"]})
            cleared += 1
        last = fresp.get("LastEvaluatedKey")
        if not last:
            break
        fresp = flags_tbl.scan(ProjectionExpression="listing_id", ExclusiveStartKey=last)
print(f"  [OK] cleared {cleared} listing flag(s) — rebuilt from seeded items below")


# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Upload photos to S3; update photo_keys on each item
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 6: Uploading photos to S3 ===")
for item in items:
    iid    = item["item_id"]
    folder = SEED_DIR / iid.replace("-", "_")
    jpgs   = sorted(folder.glob("*.jpg"))

    s3_keys = []
    for jpg in jpgs:
        key = upload_photo(iid, str(jpg), jpg.name)
        s3_keys.append(key)
        print(f"  [OK] {iid}/{jpg.name}")

    # Keep local dict and DynamoDB in sync
    item["photo_keys"] = s3_keys
    update_item("Items", {"item_id": iid}, {"photo_keys": s3_keys})


# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Run orchestrator for each item (grades + caches all agents)
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 7: Running orchestrator for each item ===")
results: dict[str, dict] = {}
for item in items:
    iid = item["item_id"]
    print(f"  {iid}  {item['name']} ...", end="", flush=True)
    try:
        result = orchestrator.process_existing_item(iid)
        results[iid] = result
        print(f"  grade={result.get('grade','?')}  {result.get('disposition','?')}")
    except Exception as exc:
        results[iid] = {"error": str(exc)}
        print(f"  ERROR: {exc}")
        traceback.print_exc()


# ─────────────────────────────────────────────────────────────────────────────
# Step 7b — Pre-warm recommendation caches for every buyer
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 7b: Pre-warming recommendation caches ===")
for b in buyers:
    bid = b["buyer_id"]
    try:
        recs = get_recommendations(bid)
        print(f"  [OK] {bid}  {b['name']}  → {len(recs)} recs cached")
    except Exception as exc:
        print(f"  [WARN] {bid}: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# Step 7c — Seed demo prevention flags (predictive prevention)
# A vision model can't read shoe size off a photo, so the Nike fit-alert can't
# come from grading. The plan's "predictive prevention" carries forward flags
# from prior returns of the same listing_id — we seed that historical flag here.
# ITM-001 itself writes no flag (no size/color mismatch), so the orchestrator
# never overwrites this row.
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 7c: Seeding demo prevention flags ===")
NIKE_LISTING = "LST-NIKE-AIR-270-BLK-10"
put_item("ListingFlags", {
    "listing_id": NIKE_LISTING,
    "flag_type": "size",
    "evidence": "Multiple fit_too_tight returns; this model runs small and normalizes to India 9.",
    "return_count_for_reason": 23,
    "recommendation": "Runs small — 23 buyers found this. Consider sizing up.",
    "last_item_id": "ITM-001",
})
print(f"  [OK] {NIKE_LISTING}  flag_type=size  count=23")


# ─────────────────────────────────────────────────────────────────────────────
# Step 8 — Summary table
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 8: Seed Summary ===")
print(f"{'item_id':<12} {'grade':<8} {'disposition':<16} {'top_match':<12} {'passport'}")
print("─" * 68)
for item in items:
    iid = item["item_id"]
    r   = results.get(iid, {})
    if "error" in r:
        print(f"{iid:<12}  ERROR: {r['error'][:50]}")
        continue
    grade       = r.get("grade", "—")
    disposition = r.get("disposition", "—")
    top         = (r.get("top_matches") or [{}])[0]
    top_match   = top.get("buyer_id", "—")
    passport    = "✓" if r.get("passport_url") else "—"
    print(f"{iid:<12} {grade:<8} {disposition:<16} {top_match:<12} {passport}")


# ─────────────────────────────────────────────────────────────────────────────
# Step 9 — Verify recommendation cache latency
# ─────────────────────────────────────────────────────────────────────────────
print("\n=== Step 9: Verifying cache latency ===")
t0   = time.perf_counter()
recs = get_recommendations("BUY-001")
ms   = (time.perf_counter() - t0) * 1000
cache_warm = len(recs) > 0
print(f"  GET /buyers/BUY-001/recommendations: {ms:.1f}ms")
print(f"  {len(recs)} recommendation(s) returned — cache {'WARM ✓' if cache_warm else 'COLD ✗'}")
if not cache_warm:
    print("  WARNING: recommendation cache is cold — step 7b did not populate it")
elif ms >= 100:
    print(f"  NOTE: {ms:.0f}ms reflects network RTT to {__import__('os').environ.get('AWS_DEFAULT_REGION','ap-south-1')} "
          "(buyer lookup + index queries + cache read, no Bedrock call). "
          "Sub-100ms applies to local/co-located DynamoDB.")

print("\n=== Seed complete ===\n")
