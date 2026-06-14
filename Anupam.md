# Anupam — Demand Side
> Role: Seed Data · Matching · Passport · Pricing · Green Credits · Buyer/Ops API · Buyer/Ops/Sell Frontend

You own everything that happens after an item is graded and listed — finding the right buyer, generating the Trust Passport, computing green credits, the buyer-facing recommendation feed, the refurb listing page, the ops dashboard, the P2P sell flow, and all seed data.

**Your counterpart is Arush.** They own AWS infra, grading, disposition, prevention, orchestrator, and the return flow. The boundary is clean: Arush writes graded items into DynamoDB; you read them back out for buyers.

---

## Files You Own

```
backend/
  main.py                          ← shared file; you own the demand endpoints
  agents/
    matching.py
    passport.py
    pricing.py
    green_credits.py
  seed/
    buyers.json
    items.json
    seed.py
    reference/
      size_standard_map.json
      carbon_table.json
      demand_table.json
      city_coords.json
frontend/
  pages/
    index.tsx
    refurb/[id].tsx
    ops.tsx
    sell.tsx
  components/
    RecommendationCard.tsx
    TrustPassport.tsx
    GreenImpact.tsx
    CreditsRedemption.tsx
```

> **Never touch** `agents/grading.py`, `agents/disposition.py`, `agents/prevention.py`, `cache.py`, `orchestrator.py`, `db/dynamo.py`, `db/s3.py`, `seed/create_tables.py`, or any frontend page not listed above.

---

## Interface Contract

### What you expose to Arush

After each merge, Arush's `orchestrator.py` must be able to call these without errors:

```python
# agents/pricing.py — available after you merge feat/agent-pricing-credits (~H5)
from agents.pricing import buyer_price
# buyer_price(buyer: dict, base_price_inr: int, item: dict) -> int

# agents/green_credits.py — available after you merge feat/agent-pricing-credits (~H5)
from agents.green_credits import compute_credits
# compute_credits(item: dict, grading: dict, nearest_buyer_dist_km: float) -> dict
# returns: {"co2_saved_kg": float, "credits": int}

# agents/matching.py — available after you merge feat/agent-matching (~H12)
from agents.matching import match_buyers
# match_buyers(item: dict, grading: dict, candidates: list[dict]) -> list[dict]
# returns ranked list: [{"buyer_id":..., "re_return_risk":..., "distance_km":..., "why_this_fits":...}, ...]

# agents/passport.py — available after you merge feat/agent-passport (~H16)
from agents.passport import generate_passport
# generate_passport(item: dict, grading: dict, credits_data: dict) -> dict
# returns: {"summary":..., "condition_statement":..., "why_returned":..., "buyer_reassurance":...}
```

### What you consume from Arush

```python
# db/dynamo.py — available after Arush merges feat/infra-db (~H3)
# Pull main at H3 before writing any agent code.
from db.dynamo import get_item, put_item, update_item, query_index, batch_get

# cache.py — available after Arush merges feat/cache (~H4)
from cache import make_cache_key, cache_get, cache_put

# agents/grading.py output shape — available after Arush merges feat/agent-grading (~H10)
# Until H10, use this mock in matching.py and passport.py for local testing:
GRADING_MOCK = {
    "grade": "B",
    "raw_llm_grade": "B",
    "grade_bucket": "light_wear",
    "confidence_bucket": "high",
    "detected_category": "shoes",
    "functional_status": "not_applicable",
    "safety_or_hygiene_blocker": False,
    "critical_missing_parts": [],
    "wear_level": "minor",
    "defects": [{"type": "heel scuff", "severity": "minor", "evidence": "small scuff on heel"}],
    "detected_color": "black",
    "detected_size": "India 9",
    "size_mismatch": True,
    "color_mismatch": False,
    "mismatch_notes": "listed US10 normalized to India9",
    "evidence": ["sole tread intact", "minor heel scuff"],
    "rubric_version": "v2-condition-rubric",
    "prompt_version": "v2",
    "model_id": "...",
    "grader_input_hash": "abc123"
}

# orchestrator.process_existing_item — available after Arush merges feat/orchestrator (~H20)
# Until H20, stub it in seed.py:
def process_existing_item_stub(item_id):
    print(f"[stub] would run orchestrator for {item_id}")
    return {"status": "listed", "grade": "B"}
```

---

## Task List

Work through tasks in order. Each task has a git branch. Merge to `main` when the task is complete and tested locally.

---

### ✅ Task 1 — Reference JSON Files
**Branch:** `feat/seed-reference`  
**Reference:** `action_plan.md → Phase 2 — Reference JSON Files`  
**Est:** H0–H1  

Create the four JSON files in `backend/seed/reference/` using the exact content from `action_plan.md → Phase 2`. Copy the JSON verbatim — these values are used by `pricing.py`, `green_credits.py`, `grading.py`, and the seed validator, so every key and value must match exactly.

Files to create:
- `backend/seed/reference/size_standard_map.json`
- `backend/seed/reference/carbon_table.json`
- `backend/seed/reference/demand_table.json`
- `backend/seed/reference/city_coords.json`

**Done when:** `json.load(open("seed/reference/carbon_table.json"))["shoes"]["manufacturing_kg_co2"]` equals `14.0`.  
**Merge:** `feat/seed-reference` → `main`.

---

### ✅ Task 2 — Seed Data: Buyers + Items
**Branch:** `feat/seed-data`  
**Reference:** `action_plan.md → Phase 3 — Seed Data`  
**Est:** H1–H3  
**Critical:** Merge by H3 so Arush can verify tables against real data.

#### `backend/seed/buyers.json`

Start with the 10 hero records from `action_plan.md → Phase 3 → buyers.json`. Add 20 more using this prompt with any LLM offline:

> "Generate 20 diverse Indian e-commerce buyer profiles in this exact JSON format with realistic Indian names, cities, categories, size profiles, preferences, return histories, and eco preferences. Use only cities from this list: Mumbai, Delhi, Bangalore, Surat, Ahmedabad, Chennai, Pune, Hyderabad, Kolkata, Jaipur. Use only categories from this list: shoes, shirt, jeans, kurta, saree, phone, laptop, appliance, bag, sunglasses, food, headphones, kettle."

Validation rules (all must pass before merge):
- All 30 `buyer_id` values are unique.
- Every `region` exists in `city_coords.json` and `demand_table.json`.
- Every entry in `category_interests[]` and `primary_category` exists in `carbon_table.json`.
- `return_rate` is between 0.0 and 1.0 (inclusive). `credit_score` is a non-negative integer.
- `lat` and `lng` match the city's coordinates in `city_coords.json` (tolerance ±0.01).

#### `backend/seed/items.json`

Use the exact 15 records from `action_plan.md → Phase 3 → items.json`. Do not modify them — the items are designed to produce specific grading outcomes that drive the demo narrative.

Validation rules:
- All `item_id` and `listing_id` values are unique.
- Every `category` exists in `carbon_table.json`, `demand_table.json`, and `size_standard_map.json`.
- Every `return_hub_city` exists in `city_coords.json`.
- Food items (`ITM-004`, `ITM-013`) have `"sealed"` or `"unopened"` in `history_note`.
- Every `status` is `"pending"`.

**Done when:** Validation script passes for all 30 buyers and 15 items.  
**Merge:** `feat/seed-data` → `main`.

---

### ✅ Task 3 — Agent ⑤ Pricing + Agent ⑥ Green Credits
**Branch:** `feat/agent-pricing-credits`  
**Reference:** `action_plan.md → Phase 4 → Agent ⑤ — pricing.py` and `Agent ⑥ — green_credits.py`  
**Est:** H3–H5  

Pure Python — no AWS calls. Both agents load reference JSONs at module level.

#### `backend/agents/pricing.py`

Implement `haversine()` and `buyer_price()` exactly as specified in `action_plan.md`. The reference JSON files are loaded at module import time:

```python
import math, json, os

_base = os.path.join(os.path.dirname(__file__), "..", "seed", "reference")
with open(os.path.join(_base, "city_coords.json")) as f:
    CITY_COORDS = json.load(f)
with open(os.path.join(_base, "demand_table.json")) as f:
    DEMAND_TABLE = json.load(f)

def haversine(lat1, lng1, lat2, lng2) -> float: ...
def buyer_price(buyer: dict, base_price_inr: int, item: dict) -> int: ...
```

#### `backend/agents/green_credits.py`

Load `carbon_table.json` at module import time. Implement `compute_credits()` exactly as specified.

```python
def compute_credits(item: dict, grading: dict, nearest_buyer_dist_km: float) -> dict:
    # Returns {"co2_saved_kg": float, "credits": int}
    # Exact formula from action_plan.md — do not change the 0.0001 shipping coefficient or 1200 avg_distance_km
    pass
```

**Done when:**
- `buyer_price({"region": "Surat", "lat": 21.17, "lng": 72.83}, 5499, {"return_hub_city": "Bangalore", "category": "shoes"})` returns an integer.
- `compute_credits({"category": "shoes"}, {}, 250)` returns `{"co2_saved_kg": 14.1, "credits": 141}` (approximately).

**Merge:** `feat/agent-pricing-credits` → `main`. Notify Arush to pull and replace pricing/credits stubs in orchestrator.

---

### ✅ Task 4 — Agent ② Matching
**Branch:** `feat/agent-matching`  
**Reference:** `action_plan.md → Phase 4 → Agent ② — matching.py`  
**Est:** H5–H12  

This is your hardest agent. Read the full section in `action_plan.md` before writing anything.

Pull `main` first to get Arush's `feat/infra-db` and `feat/cache`. For grading output, use `GRADING_MOCK` from the Interface Contract section until Arush merges `feat/agent-grading` (~H10).

#### Key implementation rules

1. **Model ID from env only.** `MODEL_ID = os.environ["BEDROCK_TEXT_MODEL_ID"]`. Never hardcode.

2. **Stage 1 — DynamoDB query (no table scan).** Query `BuyerInterestIndex` with `category = item["category"]` using `query_index("BuyerInterestIndex", ..., KeyConditionExpression=Key("category").eq(item["category"]))`. Then `batch_get("Buyers", keys)` to hydrate the buyer records. Cap at 50 candidates.

3. **Size filter (footwear only).** For `category == "shoes"`, filter candidates whose `size_profile.shoes` is more than 1 India size away from `grading["detected_size"]`. Load `size_standard_map.json` to normalize sizes.

4. **Cache key:** `make_cache_key("matching", item["return_reason_text"].encode(), json.dumps(sorted([b["buyer_id"] for b in candidates])), "v1", MODEL_ID)`. Check cache before every Bedrock call.

5. **Bedrock Converse call.** Use the exact system prompt and user message from `action_plan.md → Agent ② → Stage 2 — Haiku rerank`. Set `temperature=0`.

6. **`compute_risk()` runs in Python.** After Bedrock returns the rerank JSON, compute risk for every candidate using the exact formula and weights from the action plan. Implement `size_incompatibility()` and `condition_intolerance()` helpers exactly as specified.

7. **Eco boost** before final sort: exactly as specified in the action plan (max 0.05 reduction, capped at `credit_score / 10000`).

8. **Tie-break deterministically:** `sorted(scored_buyers, key=lambda b: (b["re_return_risk"], b["buyer_id"]))`.

9. **`get_recommendations(buyer_id, limit=10)`** — inverted matching: given a buyer, find matching listed items. Reference `action_plan.md → Phase 6 → GET /buyers/{buyer_id}/recommendations — inverted matching`. Cache key uses `buyer_id` + sorted candidate `item_id` list.

```python
# Required function signatures — do not rename:
def match_buyers(item: dict, grading: dict, candidates: list[dict]) -> list[dict]:
    # Returns: [{"buyer_id":..., "re_return_risk":..., "distance_km":...,
    #             "why_this_fits":..., "rationale":...}, ...] sorted ascending by risk

def get_recommendations(buyer_id: str, limit: int = 10) -> list[dict]:
    # Returns list of item dicts with per-buyer price and risk appended
```

**Done when:** `match_buyers(item, GRADING_MOCK, candidates)` returns a list sorted by `re_return_risk` with `BUY-001` (Riya, sizes up in Nike) having lower risk than `BUY-002` (Karan, serial tight-fit returner) for `ITM-001`. Second call returns cached result instantly.  
**Merge:** `feat/agent-matching` → `main`. Notify Arush to pull and replace matching stub in orchestrator.

---

### ✅ Task 5 — Agent ③ Passport
**Branch:** `feat/agent-passport`  
**Reference:** `action_plan.md → Phase 4 → Agent ③ — passport.py`  
**Est:** H12–H16  

Pull `main` to get Arush's `feat/agent-grading` if merged (~H10). Otherwise continue using `GRADING_MOCK`.

#### Key implementation rules

1. **Model ID from env only.** `MODEL_ID = os.environ["BEDROCK_TEXT_MODEL_ID"]`.

2. **Cache key:** `make_cache_key("passport", item["item_id"].encode(), grade + str(sorted(str(d) for d in defects)) + history_note + str(co2_saved_kg), "v1", MODEL_ID)`. Check cache before every Bedrock call.

3. **Bedrock Converse call.** Use the exact system prompt and user message from `action_plan.md → Agent ③`. Temperature=0.

4. **Parse and validate** the JSON response. Required keys: `summary`, `condition_statement`, `why_returned`, `buyer_reassurance`. If any are missing, retry once.

5. **Render to HTML** and upload to S3. Simple HTML structure — no CSS framework needed:
```html
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
  <p>Item ID: {item_id} | Grade: {grade} | Model: {model_id}</p>
</body>
</html>
```

6. Upload the HTML using `db.s3.upload_passport_html(item_id, html)`. Return both the passport JSON and the S3 key.

```python
# Required function signature — do not rename:
def generate_passport(item: dict, grading: dict, credits_data: dict) -> dict:
    # Returns: {"summary":..., "condition_statement":..., "why_returned":...,
    #           "buyer_reassurance":..., "passport_key": "passports/{item_id}.html"}
```

**Done when:** `generate_passport(item, GRADING_MOCK, {"co2_saved_kg": 4.2, "credits": 42})` returns the four text fields and uploads an HTML file to S3. Second call returns cached result instantly.  
**Merge:** `feat/agent-passport` → `main`. Notify Arush to pull and replace passport stub in orchestrator.

---

### ✅ Task 6 — Seed Script
**Branch:** `feat/seed`  
**Reference:** `action_plan.md → Phase 8 — Seed Script`  
**Est:** H16–H18  

**Status: COMPLETE.** `backend/seed/seed.py` runs the full 9-step sequence end-to-end against real AWS. Final state: 30 buyers, 86 BuyerInterestIndex rows, 15 items graded + listed, all passports + all 30 recommendation caches pre-baked. Grade spread: 11×A, 1×B (ITM-002), 1×C (ITM-007), 2×D (ITM-008, ITM-015).

Run with:
```bash
cd backend && python seed/seed.py          # incremental (reuses GradeCache)
cd backend && python seed/seed.py --fresh  # wipes GradeCache, full re-bake
```

**Implementation notes / deviations from the original spec:**
- **Photo folders** on disk are `seed/ITM_001 … ITM_015` (underscores); the script maps `ITM-001` → `ITM_001` via `.replace("-", "_")` and uploads to S3 as `photos/ITM-001/<file>.jpg`.
- **`--fresh` flag** added: scans + batch-deletes all `GradeCache` rows before re-baking. Needed because grade/match/passport/recommendation results are cached as full objects keyed on inputs — changing an item's description or photo requires wiping the cache or the hero feed serves stale data. Use it whenever item descriptions or photos change.
- **Step 7c (demo prevention flag)** added: a vision model cannot read shoe size from a photo, so the Nike "Fit Alert" can't originate from grading (`detected_size=unknown`). The plan's *predictive prevention* (carry forward flags from prior returns of the same `listing_id`) is satisfied by seeding a historical `ListingFlags` row for `LST-NIKE-AIR-270-BLK-10` (`flag_type=size, return_count_for_reason=23`). ITM-001 writes no flag itself (no size/color mismatch), so the orchestrator never overwrites it.
- **Bug fixes made to land grading** (in Arush-owned agent files, required to make the pipeline run): `agents/matching.py` and `agents/passport.py` both did a bare `json.loads(content[0]["text"])` on the Bedrock response, which crashed on model preamble / reasoning blocks (`Expecting value: line 1 column 1`). Both now use the same `_extract_json` helper grading.py already had (strips code fences + `<think>` blocks, regex-extracts the first JSON object) and scan for the first content block that actually contains text.
- **Seed-data edits** (in Anupam-owned `items.json`, to match the real photos the team shot): ITM-002 re-described as a worn olive t-shirt with light fading → grades **B**; ITM-004 re-branded to "Masala Potli — Ker Sangri Achaar 500g" with sealed-jar note to match the actual jar photo and pass the food guardrail.
- **Latency**: step 9 reports ~200–500 ms, not <100 ms. This is network RTT to `ap-south-1` (buyer lookup + per-category index queries + cache read) from a dev laptop, **not** a Bedrock call — the cache is warm. Sub-100 ms applies only to local/co-located DynamoDB.


Pull `main` to get Arush's `feat/orchestrator` if merged (~H20). If not merged yet, stub `process_existing_item` — you will swap it when Arush merges.

#### `backend/seed/seed.py`

Implement the 9-step sequence from `action_plan.md → Phase 8 → seed/seed.py`:

```python
# Step 1: Create tables (call create_tables.py logic)
# Step 2: Load and validate reference JSONs, buyers.json, items.json
# Step 3: Put all 30 buyers into Buyers table (serial writes, backoff on ProvisionedThroughputExceededException)
# Step 4: For each buyer, for each category in category_interests[]:
#          put_item("BuyerInterestIndex", {
#            "category": cat,
#            "region_buyer_id": f"{buyer['region']}#{buyer['buyer_id']}",
#            "buyer_id": buyer["buyer_id"],
#            "region": buyer["region"],
#            "return_rate": buyer["return_rate"],
#            "credit_score": buyer["credit_score"]
#          })
# Step 5: Put all 15 items into Items table with status="pending"
# Step 6: Upload photos from seed/photos/{item_id}/*.jpg to S3
#          → update item["photo_keys"] in Items table after upload
# Step 7: For each item_id, call orchestrator.process_existing_item(item_id)
#          (Arush's function — use stub until H20, swap to real when merged)
# Step 7b: For each buyer in buyers.json, call matching.get_recommendations(buyer_id)
#           to pre-warm the recommendation cache
# Step 8: Print table for each item: item_id | grade | disposition | top_match | passport_key
# Step 9: Verify: time GET /buyers/BUY-001/recommendations — must be < 100ms
```

Seed robustness: write buyers and items serially. Catch `ProvisionedThroughputExceededException` and retry with `time.sleep(2)` backoff. Fail fast on any validation error.

Seed photos: take 15 product photos with a phone. Name them `front.jpg`, `side.jpg`, `back.jpg` etc. Place each set in `seed/photos/{item_id}/`. The seed script will upload them. You need at least `front.jpg` per item.

**Done when:** `python seed/seed.py` completes without errors. All 15 items have `status="listed"` (or expected non-listed status for defective items). `GET /buyers/BUY-001/recommendations` returns in <100ms.  
**Merge:** `feat/seed` → `main`. Run this only after Arush merges `feat/orchestrator`.

---

### ✅ Task 7 — Demand-Side API Endpoints
**Branch:** `feat/api-demand`  
**Reference:** `action_plan.md → Phase 6 — API Endpoints`  
**Est:** H18–H24  

**Status: COMPLETE.** All 8 demand-side routes added to `backend/main.py` (below the demand-side marker; supply routes/CORS/app scaffold untouched). Verified live against AWS: `/buyers`, `/buyers/{id}`, `/buyers/{id}/recommendations` (4 items, presigned URLs, DEMO_MODE cache-key check → BEDROCK_CACHE_MISS on cold cache, no Bedrock call), `/items/{id}`, `/items/{id}/passport` (reconstructs passport cache key, returns the 4 text fields), `/ops/items` (12 listed, ITM-001 top match BUY-001), `/notify-seller`, `/credits/redeem` (20% cap + ledger row). Reserved-word key expressions (`status`, `category`) are auto-aliased by `query_index`.

Pull `main` to get the `main.py` file that Arush created in `feat/api-supply`. Add your routes to it. Do not touch or remove Arush's app scaffold, CORS config, or supply endpoints.

#### Your endpoints

Implement these exactly per `action_plan.md → Phase 6`:

**`GET /buyers`** — scan `Buyers` table (allowed for this debug endpoint). Apply optional `region`, `category`, `limit` filters. Return `{"buyers": [...]}`.

**`GET /buyers/{buyer_id}`** — `get_item("Buyers", {"buyer_id": buyer_id})`. Return full buyer record. 404 if not found.

**`GET /buyers/{buyer_id}/recommendations`** — call `matching.get_recommendations(buyer_id, limit)`. Per `action_plan.md → Phase 6 → inverted matching`: if `DEMO_MODE=true` and the cache key does not exist, return `BEDROCK_CACHE_MISS` error (pre-baked by seed). For each item in results, call `db.s3.presign_photo` and `db.s3.presign_passport` to attach `photo_url` and `passport_url`. Return `{"buyer_id": ..., "items": [...]}`.

**`GET /items/{item_id}`** — `get_item("Items", {"item_id": item_id})`. Attach presigned `photo_urls` (list) and `passport_url`. Return the full item shape from `action_plan.md → Phase 6 → GET /items/{item_id}`.

**`GET /items/{item_id}/passport`** — `get_item("Items", {"item_id": item_id})`. Read `passport_key` from the record. Parse the passport JSON stored in `GradeCache` (by matching `agent="passport"` and the item's cache key). Return `{"item_id":..., "passport_url":..., "passport": {...}}`.

**`GET /ops/items`** — query `Items` table `StatusCategoryIndex` with optional `status` filter, or scan if no status given. Map each item to the ops response shape from `action_plan.md → Phase 6 → GET /ops/items`. Include `top_match_buyer_id` from `item["matches"][0]["buyer_id"]` if present.

**`POST /notify-seller`** — log to stdout and return `{"notified": true, "channel": "log"}`. Exact implementation from `action_plan.md → Phase 6 → POST /notify-seller`.

**`POST /credits/redeem`** — exact logic from `action_plan.md → Phase 6 → POST /credits/redeem`:
1. Load buyer and item from DynamoDB.
2. Compute `credits_applied = min(credits_to_use, buyer["credit_score"], round(item["base_price_inr"] * 0.20))`.
3. `final_price = item["base_price_inr"] - credits_applied`.
4. Decrement `credit_score` in Buyers: `update_item("Buyers", {"buyer_id": buyer_id}, {"credit_score": buyer["credit_score"] - credits_applied})`.
5. Write `CreditsLedger` row: `put_item("CreditsLedger", {"buyer_id": buyer_id, "event_id": f"{datetime.utcnow().isoformat()}#{item_id}#redemption", "timestamp": ..., "item_id": item_id, "action": "redemption", "credits": -credits_applied, "co2_saved_kg": 0})`.
6. Return `{"buyer_id":..., "item_id":..., "credits_used":..., "discount_inr":..., "final_price_inr":..., "remaining_credits":...}`.

**Done when:** All 8 endpoints return correct shapes when tested in FastAPI docs at `http://localhost:8000/docs`.  
**Merge:** `feat/api-demand` → `main`.

---

### ✅ Task 8 — Frontend: Buyer Feed + Refurb Page + Ops Dashboard + Sell Flow
**Branch:** `feat/frontend-demand`  
**Reference:** `action_plan.md → Phase 7 → Screen 1, Screen 3, Screen 6, Screen 7`  
**Est:** H24–H34  
**Status: COMPLETE.** All four screens + four components built, TypeScript build passes clean, all routes return 200 with real API data.  

All screens use `AmazonHeader` (created by Arush — pull `main` to get it). All data comes from API calls — never compute prices, credits, or risk in React.

Use mock data (exact shapes from `action_plan.md → Phase 6` responses) until Arush's API is fully merged. Swap to real `fetch` calls once verified.

#### `frontend/pages/index.tsx` — Screen 1 (Hero Screen)

Reference: `action_plan.md → Phase 7 → Screen 1 — Buyer Recommendation Feed`

- On mount: call `GET /buyers/{NEXT_PUBLIC_DEMO_BUYER_ID}/recommendations?limit=10`.
- Render one `RecommendationCard` per item in `items[]`.
- Show buyer name and credit balance in header (from `GET /buyers/{NEXT_PUBLIC_DEMO_BUYER_ID}`).
- "Add to Cart" links to `/refurb/{item_id}`.
- "View Trust Passport" links to `/refurb/{item_id}#passport`.

#### `frontend/components/RecommendationCard.tsx`

Props (all from the recommendations response — do not recompute anything):
```ts
interface RecommendationCardProps {
  item_id: string
  brand: string
  name: string
  category: string
  grade: string
  original_price_inr: number
  price_inr: number
  photo_url: string
  passport_url: string
  return_hub_city: string
  ship_eta_days: number
  co2_saved_kg: number
  credits: number
  re_return_risk: number
  why_this_fits: string
}
```

Visual layout per `action_plan.md → Screen 1 ASCII mockup`:
- Photo left
- Product name, CERTIFIED REFURB badge, GRADE badge
- Crossed-out original price in grey, sale price in `#B12704`, savings %
- Leaf icon (SVG) + CO₂ saved + credits
- Pin icon (SVG) + city + ship ETA
- Shield icon (SVG) + `why_this_fits` text
- "View Trust Passport" secondary link + "Add to Cart" orange button

#### `frontend/pages/refurb/[id].tsx` — Screen 3

Reference: `action_plan.md → Phase 7 → Screen 3 — Refurb Listing Page`

- On mount: call `GET /items/{id}` and `GET /items/{id}/passport`.
- Show photos (from `photo_urls[]`), grade badge, owner count, prices.
- `CreditsRedemption` component: toggle to apply credits. On toggle ON: call `POST /credits/redeem` with `credits_to_use = min(buyerCreditScore, 50)`. On success: replace displayed price with `final_price_inr`.
- `TrustPassport` component: render inline passport fields. "View full passport →" opens `passport_url` in new tab.
- `GreenImpact` component: render CO₂ saved and credits.

#### `frontend/components/TrustPassport.tsx`

Props: `summary`, `condition_statement`, `why_returned`, `buyer_reassurance`, `passport_url`.  
Renders the shield panel from the Screen 3 mockup.

#### `frontend/components/GreenImpact.tsx`

Props: `co2_saved_kg`, `credits`, `show_earned: boolean` (true on refurb page, true on order confirm).  
Renders leaf icon + CO₂ text + credits text.

#### `frontend/components/CreditsRedemption.tsx`

Props: `buyer_id`, `item_id`, `buyer_credit_score`, `base_price_inr`, `onApplied: (final_price: number, credits_used: number) => void`.  
Renders the credits toggle panel. Calls `POST /credits/redeem` on toggle ON.

#### `frontend/pages/ops.tsx` — Screen 7

Reference: `action_plan.md → Phase 7 → Screen 7 — Ops Dashboard`

- On mount: call `GET /ops/items?limit=50`. Re-fetch when status filter changes.
- Status filter dropdown: All, pending, listed, manual_review, recycle, donate, refurbish.
- Per item card: name, status, grade, route, price, mismatch flags, top match buyer + risk.
- Risk colour-coding: `risk < 0.10` → green label, `0.10–0.25` → amber, `> 0.25` → red.
- "Notify Seller" button: calls `POST /notify-seller` with `item_id`, `event: "matched"`, `top_match_buyer_id`, `re_return_risk`.
- "View Item" links to `/refurb/{item_id}`.

#### `frontend/pages/sell.tsx` — Screen 6

Reference: `action_plan.md → Phase 7 → Screen 6 — P2P Seller Listing`

- Upload form: item name, category, brand, condition note, asking price, size, color, photos.
- On submit: `POST /community-list` with `seller_keeps_item: true`, `seller_id: NEXT_PUBLIC_DEMO_BUYER_ID`, `listing_price_inr`.
- On success (grade A/B/C): show "APPROVED" panel with grade, listing price, Trust Passport generated, CO₂ saved, credits. "View Your Listing →" links to `/refurb/{item_id}`.
- On grade D or REVIEW: show "Item needs review — our team will contact you."
- Category dropdown and return reason dropdown values must match the keys in `carbon_table.json` and common return codes.

**Done when:** All 4 screens render with real API data. Credits toggle on `/refurb/ITM-001` updates the price. Ops dashboard shows risk colour-coding.  

---

### Frontend Implementation Notes (Task 8 — completed)

#### Files created
```
frontend/
  pages/index.tsx                     ← Screen 1 — hero recommendation feed
  pages/refurb/[id].tsx               ← Screen 3 — refurb listing + passport + credits
  pages/ops.tsx                       ← Screen 7 — ops dashboard
  pages/sell.tsx                      ← Screen 6 — P2P seller listing
  components/RecommendationCard.tsx   ← used by index.tsx
  components/TrustPassport.tsx        ← used by refurb/[id].tsx
  components/GreenImpact.tsx          ← used by refurb/[id].tsx and sell.tsx
  components/CreditsRedemption.tsx    ← used by refurb/[id].tsx
```
Also scaffolded (shared with Arush's Task 9):
```
  .env.local  ·  styles/globals.css  ·  pages/_app.tsx  ·  pages/_document.tsx
  components/PreventionBadge.tsx
```

#### How to run
```bash
# Terminal 1 — backend (from /ReVival/backend/)
source ../.venv/bin/activate
uvicorn main:app --reload --port 8000

# Terminal 2 — frontend (from /ReVival/frontend/)
npm run dev
```
Open `http://localhost:3000`.

#### Screen 1 — `/` (Hero Recommendation Feed)
- On mount: fetches `GET /buyers/BUY-001/recommendations?limit=10` in parallel with `AmazonHeader` fetching `GET /buyers/BUY-001` for name + credits badge.
- Renders one `RecommendationCard` per item. Count shown ("4 items matched for you").
- Each card layout (left photo, right details):
  - CERTIFIED REFURB badge (orange) + GRADE badge (colour by grade: A=green, B=blue, C=orange, D=red).
  - Product name bold 17px.
  - ★★★★☆ "AI-graded condition report" in teal.
  - Strikethrough original price (grey) → sale price (`#B12704`) → "Save X%" (green). Savings % computed from the two API-provided prices.
  - Leaf SVG — CO₂ saved + credits from API.
  - Pin SVG — hub city + ship ETA from API.
  - Shield SVG — `why_this_fits` in italics from API (never generated in React).
  - "View Trust Passport" link (blue) + "Add to Cart" orange button → both go to `/refurb/{item_id}`.
- Error state shown if backend is down.
- Demo URL: `http://localhost:3000`

#### Screen 3 — `/refurb/[id]` (Refurb Listing Page)
- Fetches `GET /items/{id}`, `GET /items/{id}/passport`, and `GET /buyers/BUY-001` in parallel.
- Left column: main photo (340×340) with thumbnail strip. Click thumbnail switches main photo.
- Right column:
  - Badges: "Certified Second Life" (orange), "GRADE X" (colour-coded), "N PREVIOUS OWNER".
  - Title, ★★★★☆ rating, strikethrough original → current price in `#B12704`.
  - `GreenImpact` component: green pill — CO₂ saved + credits from API.
  - Size and colour from API.
  - `CreditsRedemption` component: shows buyer's credit balance, "Apply N credits → ₹X" preview. On click calls `POST /credits/redeem` with `credits_to_use = min(credit_score, 50)`. On success replaces displayed price with `final_price_inr` from response — one-way apply.
  - Add to Cart + Buy Now orange buttons.
- Below: `TrustPassport` component (green-bordered panel) — summary, condition, why returned, buyer reassurance, "View full passport →" link opens S3 presigned URL in new tab.
- Demo URL: `http://localhost:3000/refurb/ITM-001`

#### Screen 7 — `/ops` (Ops Dashboard)
- Fetches `GET /ops/items?limit=50` on mount and on every status filter change.
- Filter bar: Status dropdown (All / pending / listed / manual_review / recycle / donate / refurbish) + Refresh button + item count.
- Per item card:
  - Header row: `item_id · name` + status badge (colour-coded) + grade badge.
  - Route and price (red).
  - Mismatch flag: yellow pill "[!] Size mismatch detected" and/or "Color mismatch detected" when flags are true.
  - TOP MATCH buyer_id + risk badge — **colour-coded by value**: `< 0.10` → green bg ("low risk"), `0.10–0.25` → amber ("medium risk"), `> 0.25` → red ("high risk"). Risk shown as percentage.
  - "View Item" button (blue border) → `/refurb/{item_id}`.
  - "Notify Seller" button (orange) → calls `POST /notify-seller`. Button disables and shows "Notified" after call.
- Demo URL: `http://localhost:3000/ops`

#### Screen 6 — `/sell` (P2P Seller Listing)
- Two-column form grid: item name, category (13 options), brand, condition dropdown (returned_open_box / lightly_used / good_condition / well_used), asking price, ship-from city, size, colour.
- Drag-and-drop photo area (up to 5 photos).
- On submit: `POST /community-list` multipart with `seller_keeps_item: true`, `seller_id: BUY-001`, `listing_price_inr`.
- **Approved result (grade A/B/C):** grade badge + green "APPROVED" badge + asking price. Shield SVG "Trust Passport generated — buyers can see it". Leaf SVG CO₂ saved + credits. "View Your Listing →" (→ `/refurb/{item_id}`) + "Edit Price" button.
- **Review/recycle result (grade D/REVIEW):** yellow warning — "Item needs review — our team will contact you within 24 hours."
- Demo URL: `http://localhost:3000/sell`

#### Design system applied
- All inline styles — no Tailwind/CSS modules.
- SVG icons: leaf (`#2d6a4f`), shield (`#146EB4`), pin (`#555`), warning triangle (`#856404`).
- No emojis anywhere.
- Prices in `#B12704` red, savings in `#2d6a4f` green, CTAs `#FF9900` orange, secondary links `#146EB4` blue, body bg `#EAEDED`, header `#232F3E` navy.
**Merge:** `feat/frontend-demand` → `main`.

---

### Frontend Hardening Update (post-MVP — functional cart, checkout, passport modal)

After the first frontend pass, the following were added to make the site fully functional end-to-end and more robust. The items below touch Anupam-owned components.

#### `components/TrustPassport.tsx` (Anupam-owned) — "View full passport" UI fix
- The first version opened the raw, unstyled S3 HTML file in a new tab (ugly serif page).
- Now "View full passport →" opens a polished **in-app certificate modal**: navy header band with shield icon, grade badge, labelled "Condition Report" / "Reason for Return" sections, a green reassurance panel, and a footer with item ID + a small "Open certificate document ↗" link to the original S3 file as a fallback.
- New optional props: `item_id`, `grade` (passed from `refurb/[id].tsx`).

#### `components/RecommendationCard.tsx` (Anupam-owned) — working Add to Cart
- "Add to Cart" was previously a navigation link; it now actually adds the item to the cart via `lib/cart.ts` and shows "✓ Added to Cart" feedback.
- The product photo and title are now the links to `/refurb/{item_id}`.
- Image `onError` fallback ("No photo") for expired presigned URLs; savings % guards divide-by-zero.

#### `pages/refurb/[id].tsx` (Anupam-owned) — working Add to Cart + Buy Now
- "Add to Cart" adds the item at the **currently displayed price** (i.e. respects an applied credits discount) and shows a "Go to Cart →" link.
- "Buy Now" routes to `/order-confirm` with the item's price, CO₂, and credits.
- Passes `item_id` + `grade` to the Trust Passport modal; main photo has an error fallback that resets on thumbnail switch.

#### New shared files (also documented in Arush.md)
- **`lib/cart.ts`** — `localStorage` cart store (`secondlife_cart`) broadcasting a `cart-updated` event. API: `getCart`, `addToCart`, `isInCart`, `removeFromCart`, `clearCart`, `cartCount`.
- **`pages/cart.tsx`** — shopping cart screen (items, remove, subtotal + total CO₂, checkout → clears cart → `/order-confirm`, empty state).
- **`pages/order-confirm.tsx`** — Screen 8 (Order Confirmation Green Impact), not built in the first pass. Shows order #, CO₂ saved + equivalent km, credits added → new balance.
- The **AmazonHeader** cart icon now shows a live count badge and links to `/cart`; a global nav strip (Second Life · Original PDP · Sell · Returns · Ops) was added.

---

## Merge Sequence (Your Side)

```
H1   feat/seed-reference → main
H3   feat/seed-data → main           ← notify Arush you've merged
H5   feat/agent-pricing-credits → main  ← notify Arush to pull + replace stubs
H12  feat/agent-matching → main      ← notify Arush to pull + replace stub
H16  feat/agent-passport → main      ← notify Arush to pull + replace stub
H18  feat/seed → main (stub version; re-run after H20 when Arush merges orchestrator)
H24  feat/api-demand → main
H34  feat/frontend-demand → main
H34  pull main, run seed.py for real, run E2E tests
```

### When to pull from Arush

```
H3   pull main after Arush merges feat/infra-db
       → now you can import from db.dynamo and db.s3 in agents
H4   pull main after Arush merges feat/cache
       → now you can import from cache in matching.py and passport.py
H10  pull main after Arush merges feat/agent-grading
       → replace GRADING_MOCK with real import in local tests
H20  pull main after Arush merges feat/orchestrator
       → replace process_existing_item stub in seed.py; run seed for real
H24  pull main after Arush merges feat/api-supply
       → AmazonHeader component available in frontend
```

---

## How to Run the Full Website

The app is two processes: a FastAPI backend on **:8000** and a Next.js frontend on **:3000**. Run each in its own terminal.

### Prerequisites
- **Python 3.12** with the project venv at the repo root (`/ReVival/.venv`). The DB is already seeded on AWS (`ap-south-1`) and `DEMO_MODE=true`, so browsing makes **zero** Bedrock calls (recommendation caches are pre-baked by `seed.py`).
- **Node + npm** (v18+). If `npm` is "command not found", install Node with Homebrew: `brew install node`.
- `backend/.env` and `frontend/.env.local` must exist (gitignored — not in the repo). `frontend/.env.local`:
  ```
  NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
  NEXT_PUBLIC_DEMO_BUYER_ID=BUY-001
  ```

### Terminal 1 — Backend
```bash
cd backend
source ../.venv/bin/activate        # venv lives at repo root, not in backend/
uvicorn main:app --reload --port 8000
```
Run from **inside** `backend/` (the app is `main:app`; running from the repo root gives `ModuleNotFoundError: No module named 'db'`).
Verify: `curl http://localhost:8000/health` → `{"ok":true,...}`. Docs at `http://localhost:8000/docs`.

### Terminal 2 — Frontend
```bash
cd frontend
npm install        # first time only
npm run dev
```
No venv needed — npm and the Python venv are unrelated. Then open **`http://localhost:3000`**.

### Pages to visit
| URL | Screen |
|---|---|
| `http://localhost:3000` | Buyer recommendation feed (open as Riya) |
| `/refurb/ITM-001` | Refurb listing — Trust Passport + apply credits |
| `/cart` · `/order-confirm` | Cart + order confirmation green impact |
| `/sell` | P2P seller listing |
| `/ops` | Ops intelligence dashboard |
| `/product/LST-NIKE-AIR-270-BLK-10` | Original PDP with Fit Alert |
| `/return` → `/exchange` | Returns flow + trade-in credit wallet |

### Troubleshooting
- **Stuck on "Loading personalised picks…"** → the backend is down, OR Next.js started on **:3001** (because :3000 was busy) and CORS blocked the request. Free the ports and restart on 3000: `lsof -ti:3000,3001,8000 | xargs kill -9`. `CORS_ORIGINS` in `backend/.env` allows both 3000 and 3001.
- **`Address already in use`** → a previous server is still running: `lsof -ti:8000 | xargs kill -9`.
- **`npm: command not found`** → `brew install node`, then reopen the terminal.
- **`BEDROCK_CACHE_MISS` on recommendations** → the cache is cold; re-run `cd backend && python seed/seed.py` to re-bake.

---

## Fixes Applied (Post Code-Review)

These fixes were made to Arush's supply-side code during a joint code review. They affect interfaces Anupam's code consumes — no changes required on the demand side, but be aware of the corrected behaviour.

### Fix A — `POST /community-list` price now persisted correctly (`main.py`)
Arush's endpoint now writes the seller's `listing_price_inr` to DynamoDB after the orchestrator runs. Your `GET /items/{item_id}` and `GET /ops/items` endpoints will now read the correct seller-set price without any changes on your side.

### Fix B — Size-mismatch flag is now fully deterministic (`agents/grading.py`)
`_normalize_size` previously left `size_mismatch` unchanged when the vision model already returned an India-format size. Fixed: `size_mismatch` is now always recomputed by normalizing both sides. Downstream passport and matching code can trust `grading["size_mismatch"]` unconditionally.

### Fix C — `CreditsLedger` `action` field clarified (`orchestrator.py`)
Green credits earned on item resale now use `action: "earn"`. Trade-in store credit (exchange route) remains `action: "trade_in_credit"`. If your `seed.py` or frontend reads the ledger, filter by the correct action string.

---

## Rules for AI Coding Tools

- Every DynamoDB table name must go through `table_name(logical_name)` from `db/dynamo.py`. Never hardcode `"SecondLife-Buyers"` directly in agents or endpoints.
- Every S3 key must follow the exact paths in `action_plan.md → Phase 1 → S3 object layout`.
- Model IDs are always read from env vars — `os.environ["BEDROCK_TEXT_MODEL_ID"]`. Never hardcode them.
- The `BuyerInterestIndex` table exists precisely to avoid scanning `Buyers`. Stage 1 of matching must always query `BuyerInterestIndex` — never `Scan` the Buyers table in matching or recommendation paths.
- `DEMO_MODE=true` means `GET /buyers/{buyer_id}/recommendations` must return a cache hit. Raise `BEDROCK_CACHE_MISS` if the cache is cold. Seed pre-bakes all recommendation caches via step 7b.
- Money values are always integers (INR). `round()` all computed prices and credits.
- Risk scores are floats 0.0–1.0. Return `round(sigmoid(...), 4)`.
- Do not add extra fields to any response shape. Frontend components read exact field names from `action_plan.md`.
- The `why_this_fits` string in recommendations comes from the Bedrock rerank `rationale` field — do not generate it in Python code. If the LLM returns it, use it verbatim.
- `CreditsLedger` event_id format: `"{timestamp_iso}#{item_id}#{action}"` — the composite key prevents collision, do not change this format.
