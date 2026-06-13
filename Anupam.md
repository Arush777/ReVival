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

### Task 1 — Reference JSON Files
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

### Task 2 — Seed Data: Buyers + Items
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

### Task 3 — Agent ⑤ Pricing + Agent ⑥ Green Credits
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

### Task 4 — Agent ② Matching
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

### Task 5 — Agent ③ Passport
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

### Task 6 — Seed Script
**Branch:** `feat/seed`  
**Reference:** `action_plan.md → Phase 8 — Seed Script`  
**Est:** H16–H18  

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

### Task 7 — Demand-Side API Endpoints
**Branch:** `feat/api-demand`  
**Reference:** `action_plan.md → Phase 6 — API Endpoints`  
**Est:** H18–H24  

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

### Task 8 — Frontend: Buyer Feed + Refurb Page + Ops Dashboard + Sell Flow
**Branch:** `feat/frontend-demand`  
**Reference:** `action_plan.md → Phase 7 → Screen 1, Screen 3, Screen 6, Screen 7`  
**Est:** H24–H34  

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
**Merge:** `feat/frontend-demand` → `main`.

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

## Local Run

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Frontend
cd frontend
npm install
npm run dev
```

FastAPI docs: `http://localhost:8000/docs`  
Hero screen: `http://localhost:3000`

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
