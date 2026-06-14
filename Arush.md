# Arush — Supply Side
> Role: Infrastructure · Grading · Disposition · Prevention · Return/Sell API · Return/Prevention Frontend

You own everything that happens when an item *enters* the system: AWS setup, the DynamoDB/S3 layer used by everyone, the AI grading agent, pure-code disposition and prevention agents, the orchestrator, the supply-side API endpoints, and the three frontend screens that a returner or P2P seller interacts with.

**Your counterpart is Anupam.** They own matching, recommendations, passport, credits, and buyer-facing screens. The boundary is clean: you write graded items *into* DynamoDB; Anupam reads them back out for buyers.

---

## Files You Own

```
backend/
  main.py                          ← shared file; you own the supply endpoints
  orchestrator.py
  cache.py
  db/
    dynamo.py
    s3.py
  agents/
    grading.py
    disposition.py
    prevention.py
  seed/
    create_tables.py
    reference/                     ← you create the folder; Anupam writes the JSONs
frontend/
  pages/
    return.tsx
    exchange.tsx
    product/[id].tsx
  components/
    AmazonHeader.tsx               ← shared component, you create it first
    PreventionBadge.tsx
```

> **Never touch** `agents/matching.py`, `agents/passport.py`, `agents/pricing.py`, `agents/green_credits.py`, `seed/buyers.json`, `seed/items.json`, `seed/seed.py`, or any frontend page not listed above.

---

## Interface Contract

### What you expose to Anupam

After each merge, Anupam's code must be able to import and call these without errors:

```python
# db/dynamo.py
from db.dynamo import get_item, put_item, update_item, query_index, batch_get, table_name

# cache.py
from cache import make_cache_key, cache_get, cache_put

# agents/grading.py — grading output shape (Anupam mocks this until your merge at H10)
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
```

### What you consume from Anupam

```python
# agents/matching.py — available after Anupam merges feat/agent-matching (~H12)
# Until then, use this stub in orchestrator.py:
def match_buyers_stub(item, grading, candidates):
    return [{"buyer_id": "BUY-001", "re_return_risk": 0.05, "distance_km": 250,
             "why_this_fits": "stub — awaiting Anupam merge"}]

# agents/pricing.py — available after Anupam merges feat/agent-pricing-credits (~H5)
# Until then, use this stub:
def buyer_price_stub(buyer, base_price_inr, item):
    return base_price_inr

# agents/passport.py — available after Anupam merges feat/agent-passport (~H16)
# Until then, skip passport step in orchestrator and set passport_key = None
```

Replace each stub with the real import as soon as Anupam's branch is merged.

---

## Task List

Work through tasks in order. Each task has a git branch. Merge to `main` when the task is complete and tested locally.

---

### ✅ Task 1 — AWS + Environment Setup
**Branch:** `feat/infra-env`  
**Reference:** `action_plan.md → Phase 0 — Environment Setup`  
**Est:** H0–H1  

1. Create AWS Budget alert (threshold: $5 or ₹500) before any Bedrock calls.
2. Open Bedrock console → Model access → enable the Claude vision and text models. Note the exact model IDs (or cross-region inference profile IDs) — you will need them for `.env`.
3. Create IAM user `secondlife-local-dev`. Attach the exact policy from `action_plan.md → Phase 0 → IAM policy for local development`. Replace `<account-id>` with your real account ID before attaching.
4. Create `backend/.env` using the template in `action_plan.md → Phase 0 → Backend .env`. Fill in:
   - `BEDROCK_VISION_MODEL_ID` and `BEDROCK_TEXT_MODEL_ID` with the real model/profile IDs you found in step 2.
   - `S3_PHOTOS_BUCKET` and `S3_PASSPORTS_BUCKET` with your account ID substituted.
   - `AWS_PROFILE` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.
5. Create `frontend/.env.local` using the template in `action_plan.md → Phase 0 → Frontend .env.local`.
6. Create `backend/requirements.txt` with the exact contents from `action_plan.md → Phase 0 → requirements.txt`.
7. Verify: `aws sts get-caller-identity` returns your account. `aws bedrock list-foundation-models --region ap-south-1` lists models without error.

**Done when:** Both `.env` files exist, `requirements.txt` is committed, AWS credentials work.  
**Merge:** `feat/infra-env` → `main`.

---

### ✅ Task 2 — DynamoDB Tables + S3 + DB Helpers
**Branch:** `feat/infra-db`  
**Reference:** `action_plan.md → Phase 1 — DynamoDB Tables` and `action_plan.md → Phase 4 → db/dynamo.py` and `db/s3.py`  
**Est:** H1–H3  
**Critical:** Merge by H3 — Anupam's API endpoints depend on `db/dynamo.py`.

#### `backend/seed/create_tables.py`

Implement using the exact `TABLE_SPECS` list from `action_plan.md → Phase 1 → create_tables.py exact contract`. Do not change table names, key schemas, GSI names, or attribute definitions — Anupam's queries depend on the exact index names `StatusCategoryIndex`, `ListingStatusIndex`, `RegionCategoryIndex`.

Rules:
- Use `BillingMode="PROVISIONED"`, `ReadCapacityUnits=1`, `WriteCapacityUnits=1` on every table and every GSI.
- Use `Projection={"ProjectionType": "ALL"}` on every GSI.
- Skip tables that already exist (catch `ResourceInUseException`).
- After creating each table, poll until `DescribeTable` returns `TableStatus == "ACTIVE"`.
- Print `[OK] TableName ACTIVE` for each table.

#### `backend/db/dynamo.py`

Implement all functions from `action_plan.md → Phase 4 → db/dynamo.py`. Key implementation notes:

```python
def to_ddb(value):
    # Recursively walk dicts and lists.
    # Convert float → Decimal (str(v) trick avoids float precision issues).
    # Leave str, int, bool, None, list, dict as-is (recurse into containers).
    import json
    from decimal import Decimal
    return json.loads(json.dumps(value), parse_float=Decimal)

def from_ddb(value):
    # Recursively convert Decimal → int if value == int(value), else float.
    # This ensures FastAPI JSON serialization never sees Decimal.
    pass

def update_item(logical_table, key, updates):
    # Build: UpdateExpression = "SET #k0 = :v0, #k1 = :v1, ..."
    # Use ExpressionAttributeNames to avoid reserved-word collisions.
    # Use ExpressionAttributeValues with to_ddb() applied to values.
    # Return the updated item via ReturnValues="ALL_NEW".
    pass

def query_index(logical_table, index_name, key_expr, expr_values):
    # Call table.query(IndexName=index_name, KeyConditionExpression=key_expr,
    #                  ExpressionAttributeValues=to_ddb(expr_values))
    # Return [from_ddb(item) for item in resp["Items"]]
    pass

def batch_get(logical_table, keys):
    # Use dynamodb.batch_get_item with RequestItems.
    # Handle pagination (UnprocessedKeys).
    # Return list of hydrated items.
    pass
```

#### `backend/db/s3.py`

Implement all four functions from `action_plan.md → Phase 4 → db/s3.py`. No deviations from the exact key paths: `photos/{item_id}/{filename}` and `passports/{item_id}.html`.

#### Create S3 buckets

Run once manually or in `create_tables.py`:
```python
s3.create_bucket(
    Bucket=os.environ["S3_PHOTOS_BUCKET"],
    CreateBucketConfiguration={"LocationConstraint": "ap-south-1"}
)
# Repeat for S3_PASSPORTS_BUCKET
# Enable AES256 server-side encryption on both
# Block all public access on both
```

**Done when:** `python seed/create_tables.py` creates all 6 tables and reaches ACTIVE. `from db.dynamo import get_item` works. `from db.s3 import presign_photo` works.  
**Merge:** `feat/infra-db` → `main`. Notify Anupam to pull immediately.

---

### ✅ Task 3 — cache.py
**Branch:** `feat/cache`  
**Reference:** `action_plan.md → Phase 4 → cache.py`  
**Est:** H3–H4  

Implement exactly as specified. No changes to function signatures — both grading and Anupam's matching/passport agents call these functions.

```python
# Exact signatures — do not rename or add parameters:
def make_cache_key(agent_name: str, primary_input: bytes, secondary_str: str,
                   prompt_version: str, model_id: str) -> str

def cache_get(key: str) -> dict | None

def cache_put(key: str, agent: str, result: dict) -> None
```

**Done when:** Unit test: `cache_put("k", "grading", {"grade": "B"})` then `cache_get("k")` returns `{"grade": "B"}`.  
**Merge:** `feat/cache` → `main`.

---

### ✅ Task 4 — Agent ① Grading
**Branch:** `feat/agent-grading`  
**Reference:** `action_plan.md → Phase 4 → Agent ① — grading.py`  
**Est:** H4–H10  

This is the hardest and most important agent. Read the full section in `action_plan.md` before writing a single line.

#### Key implementation rules

1. **Model ID from env only.** `MODEL_ID = os.environ["BEDROCK_VISION_MODEL_ID"]`. Never hardcode a model string.

2. **Canonicalize before hashing.** Implement `canonicalize_grade_input()` exactly as described:
   - Sort photo bytes by their S3 key (stable alphabetical order).
   - Apply EXIF orientation using `PIL.ImageOps.exif_transpose`.
   - Convert to RGB, resize max edge to 1600px preserving aspect ratio.
   - Save as JPEG quality=85 to a `BytesIO` buffer.
   - Concatenate all canonical image bytes.
   - Serialize only the stable item fields (listed in the action plan) with `json.dumps(sorted_keys)`.

3. **Cache key** = `make_cache_key("grading", canonical_image_bytes, canonical_item_json, "v2-condition-rubric", MODEL_ID)`. Check cache before every Bedrock call.

4. **Bedrock Converse call.** Use the `bedrock-runtime` Converse API with the exact system prompt and user message from the action plan. Pass each canonical image as a base64-encoded `image` content block. Set `temperature=0`.

5. **Parse and validate.** Extract the JSON object from the response text. Validate all required fields exist and enum values are from the allowed sets. If parsing fails, retry once with a JSON-repair prompt that includes the raw response and asks the model to fix it.

6. **Apply `finalize_grade()`** after parsing — exact implementation from the action plan. Do not add your own grading logic beyond what is specified.

7. **Normalize size mismatch** using `size_standard_map.json` (in `seed/reference/`). If `item["category"] == "shoes"` and `detected_size` is in a non-India format, map it to India sizing before comparing.

8. **Return shape** must match exactly the dict shown in `action_plan.md → Agent ① → Return shape`. Anupam's `matching.py` and `passport.py` consume these fields by name.

```python
# Final function signature — do not change:
def grade_item(item: dict, photo_keys: list[str]) -> dict:
    # photo_keys are S3 keys like "photos/ITM-001/front.jpg"
    # Download from S3, canonicalize, hash, check cache, call Bedrock, validate, finalize, cache, return
    pass
```

**Done when:** `grade_item(item, ["photos/ITM-001/front.jpg"])` returns a dict with `"grade"` in `{"A","B","C","D","REVIEW"}` and all required fields. Second call with same inputs returns cached result instantly (no Bedrock call).  
**Merge:** `feat/agent-grading` → `main`. Notify Anupam to pull and replace grading mock in `matching.py`.

---

### ✅ Task 5 — Agent ④ Disposition
**Branch:** `feat/agent-disposition`  
**Reference:** `action_plan.md → Phase 4 → Agent ④ — disposition.py`  
**Est:** H10–H12  

Pure Python — no AWS calls. Implement `compute_disposition()` exactly as specified.

```python
GRADE_FACTOR = {"A": 0.70, "B": 0.55, "C": 0.35, "D": 0.05, "REVIEW": 0.0}
HIGH_VALUE = {"phone", "laptop", "appliance", "kettle"}

def compute_disposition(item: dict, grade: str, trade_in_requested: bool = False) -> dict:
    # Exact logic from action_plan.md — do not change the GRADE_FACTOR values or HIGH_VALUE set
    pass
```

**Done when:** `compute_disposition({"original_price_inr": 9999, "category": "shoes"}, "B")` returns `{"disposition": "resell", "recovered_value_inr": 5499, "trade_in_credit_inr": 0}`.  
**Merge:** `feat/agent-disposition` → `main`.

---

### ✅ Task 6 — Agent ⑦ Prevention
**Branch:** `feat/agent-prevention`  
**Reference:** `action_plan.md → Phase 4 → Agent ⑦ — prevention.py`  
**Est:** H12–H15  

Pure Python + DynamoDB calls. Implement all three mechanisms exactly as specified.

```python
# All three functions must have these exact signatures:
def predict_listing_flag(item: dict) -> None
def correct_listing(item: dict, grading: dict) -> None
def write_listing_flag(item: dict, grading: dict) -> None
```

Key rules:
- `predict_listing_flag` reads `ListingFlags` table. If existing flag has `return_count_for_reason >= 1`, do nothing (flag is already live). This is called before grading starts.
- `correct_listing` calls `update_item("Items", ...)` only when `grading["size_mismatch"]` or `grading["color_mismatch"]` is True.
- `write_listing_flag` increments `return_count_for_reason` by reading the existing record first, then calling `put_item` with the full updated record. Do not use a DynamoDB atomic counter — read-then-write is fine for the demo.

**Done when:** `write_listing_flag` on a fresh `ListingFlags` table creates a new record with `return_count_for_reason: 1`. Called again, it becomes `2`.  
**Merge:** `feat/agent-prevention` → `main`.

---

### ✅ Task 7 — Orchestrator
**Branch:** `feat/orchestrator`  
**Reference:** `action_plan.md → Phase 5 — Orchestrator`  
**Est:** H15–H20  

Pull `main` first to get Anupam's `feat/agent-pricing-credits` (available ~H5) and `feat/agent-matching` (available ~H12). If those are not merged yet, use the stubs defined in the Interface Contract section above.

Implement `process_return()` following the exact 12-step sequence from `action_plan.md → Phase 5`. 

```python
# Imports — use real imports if branch is merged, stub functions otherwise:
from agents.grading import grade_item
from agents.disposition import compute_disposition
from agents.prevention import predict_listing_flag, correct_listing, write_listing_flag
from agents.pricing import buyer_price          # Anupam's — use stub if not merged
from agents.matching import match_buyers        # Anupam's — use stub if not merged
from agents.green_credits import compute_credits # Anupam's — use stub if not merged
from agents.passport import generate_passport   # Anupam's — use stub if not merged
```

Key implementation rules:
- `create_item_record(payload)` puts the item into `Items` table with `status="pending"` and returns the item dict.
- `update_item_field(item, key, value)` is a local helper that calls `db.dynamo.update_item` AND updates the local `item` dict in place — both must stay in sync.
- Steps 5–9 (pricing, candidates, matching, credits, passport) only run if `disp["disposition"] in ("resell", "refurbish", "exchange")`.
- Step 12 (notify seller) is a fire-and-forget `POST /notify-seller` HTTP call (or stub log). Do not let it fail the response.

Also implement `process_existing_item(item_id)` for use by Anupam's `seed.py` — it loads an existing `Items` row, asserts `status == "pending"` and `photo_keys` is set, then runs agents ①–⑦ in the same order without creating a new item.

**Done when:** `process_return(payload, photo_paths)` returns a dict with `"grade"`, `"disposition"`, `"status"`, and `"co2_saved_kg"`. Works end-to-end locally with real AWS calls.  
**Merge:** `feat/orchestrator` → `main`. Notify Anupam to pull and replace orchestrator stub in `seed.py`.

---

### ✅ Task 8 — Supply-Side API Endpoints
**Branch:** `feat/api-supply`  
**Reference:** `action_plan.md → Phase 6 — API Endpoints`  
**Est:** H20–H24  

Create `backend/main.py` with CORS, FastAPI app, and your supply-side endpoints. Anupam will add their demand-side endpoints in `feat/api-demand` — coordinate so there is no conflict on the file structure (you create the file with the app, CORS, and your routes; Anupam adds their routes in their branch, you merge in order).

#### App scaffold (you write this)

```python
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import os

app = FastAPI(title="SecondLife Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ.get("CORS_ORIGINS", "http://localhost:3000")],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

#### Your endpoints

Implement these exactly per `action_plan.md → Phase 6`:

**`GET /health`** — return `{"ok": true, "service": "secondlife-backend", "env": "local", "aws_region": "ap-south-1"}`.

**`GET /config`** — return `{"api_base_url": ..., "demo_buyer_id": "BUY-001", "demo_item_id": "ITM-001", "demo_listing_id": "LST-NIKE-AIR-270-BLK-10"}`.

**`POST /returns`** — `multipart/form-data`. Parse `payload` (JSON string), `photos` (files), `trade_in` (optional bool string). Save photos to temp files, call `orchestrator.process_return()`, return the response shape from `action_plan.md → Phase 6 → POST /returns → Response`. If `DEMO_MODE=true` and no cache hit exists, still call the orchestrator — DEMO_MODE only prevents uncached calls during *frontend browsing*, not during the return submission flow.

**`POST /community-list`** — same as `/returns` plus `seller_keeps_item` and `listing_price_inr` from payload. Call same orchestrator. If grade is `D` or `REVIEW`, return `{"status": "manual_review" or "recycle"}` without publishing.

**`GET /listings/{listing_id}/warning`** — read `ListingFlags` table. If record exists with `listing_id`, return it with `has_warning: true`. Otherwise `{"listing_id": ..., "has_warning": false}`.

Also create the frontend header component:

#### `frontend/components/AmazonHeader.tsx`

Exact Amazon-style header per `action_plan.md → Phase 7 → Amazon UI/UX baseline`:
- Background: `#232F3E`
- amazon.in logo left, search bar center (non-functional for MVP), cart icon + buyer name + credits badge top-right
- Buyer name and credits loaded via `GET /buyers/{NEXT_PUBLIC_DEMO_BUYER_ID}` on mount
- Export as default, accept no required props (reads buyer ID from env)

**Done when:** `GET /health` returns 200. `POST /returns` with a real photo returns a graded result.  
**Merge:** `feat/api-supply` → `main`.

---

### ✅ Task 9 — Frontend: Return Flow + Prevention Screen
**Branch:** `feat/frontend-supply`  
**Reference:** `action_plan.md → Phase 7 → Screen 4, Screen 5, Screen 2`  
**Est:** H24–H32  
**Status: COMPLETE.** All three screens built, TypeScript build passes clean, all routes return 200 with real API data.  

All three screens use `AmazonHeader`. All data comes from API calls — never compute prices, credits, or risk in React.

#### `frontend/pages/return.tsx` — Screen 4

Reference: `action_plan.md → Phase 7 → Screen 4 — Returns Flow`

- Upload form: item name, category dropdown, brand, return reason dropdown, original price, size, color, photo file input (min 1), trade-in checkbox.
- On submit: `POST /returns` with `multipart/form-data`. Show loading state during the call.
- On success (standard return): show Grade, Route, CO₂ saved, credits earned. Show "Continue with Return" button.
- On success with `trade_in=true` and `disposition="exchange"`: redirect to `/exchange?item_id=...&grade=...&credit=...&co2=...&credits=...` (pass result fields as query params).
- On grade `D` or `REVIEW`: show "Item flagged for manual review" message, no redirect.
- Category and return reason values must match the categories in `carbon_table.json` and common return codes (`fit_too_tight`, `fit_too_loose`, `color_mismatch`, `too_loud`, `too_spicy`, `defective`, `changed_mind`, `other`).

#### `frontend/pages/exchange.tsx` — Screen 5

Reference: `action_plan.md → Phase 7 → Screen 5 — Exchange / Trade-in Confirmation`

- Read `item_id`, `grade`, `credit` (trade_in_credit_inr), `co2`, `credits` from query params.
- Show: item name, grade, trade-in credit amount (₹), CO₂ saved, green credits earned.
- Show credit wallet panel: "₹X store credit. Valid on Second Life certified listings only."
- "Browse Second Life listings →" navigates to `/` (homepage).
- No additional API calls needed on this screen — all data is in query params from the `/returns` response.

#### `frontend/pages/product/[id].tsx` — Screen 2

Reference: `action_plan.md → Phase 7 → Screen 2 — Original Product Page Prevention Widget`

- On mount: call `GET /listings/{id}/warning` where `id` is the route param.
- If `has_warning: true`: render `PreventionBadge` with `flag_type`, `return_count_for_reason`, `recommendation`.
- Below the widget: hardcode a "Second Life Option Available" panel for `ITM-001` demo item (call `GET /items/ITM-001` to get price and grade). "View Certified Second Life →" links to `/refurb/ITM-001`.
- Fake the rest of the PDP (product name, price, rating) using the demo Nike Air Max 270 data. This is a demo — no real catalog.

#### `frontend/components/PreventionBadge.tsx`

Props: `flag_type: "size" | "color"`, `return_count_for_reason: number`, `recommendation: string`.  
Renders a yellow-bordered alert box: `[!] FIT ALERT` or `[!] COLOR ALERT`, count text, recommendation. No emojis — use SVG warning icon.

**Done when:** `/return` page renders, submits, and shows the result. `/exchange` page renders correctly from query params. `/product/LST-NIKE-AIR-270-BLK-10` shows the fit alert badge.  
**Merge:** `feat/frontend-supply` → `main`.

---

### Frontend Implementation Notes (Task 9 — completed)

#### Files created
```
frontend/
  .env.local                          ← NEXT_PUBLIC_API_BASE_URL + NEXT_PUBLIC_DEMO_BUYER_ID
  styles/globals.css                  ← body reset, font, #EAEDED background
  pages/_app.tsx                      ← imports globals.css
  pages/_document.tsx                 ← HTML scaffold
  pages/return.tsx                    ← Screen 4
  pages/exchange.tsx                  ← Screen 5
  pages/product/[id].tsx              ← Screen 2
  components/PreventionBadge.tsx      ← shared, used by product/[id].tsx
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

#### Screen 4 — `/return` (Returns Flow)
- Two-column form grid: item name, category dropdown (all 13 carbon_table categories), brand, return reason dropdown (8 codes), original price, hub city, size, colour.
- Drag-and-drop photo upload area (min 1 file). "Trade-in for store credit" checkbox.
- On submit: `POST /returns` multipart. Shows spinner ("Processing...") during the call.
- **Standard return result:** green banner "Your item earns a second life" + 4 info tiles (Grade, Route, Credits, CO₂). "Continue with Return →" goes home.
- **Trade-in branch:** if `disposition === "exchange"` the page redirects automatically to `/exchange` passing item_id, name, grade, credit, co2, credits as query params.
- **Manual review / Grade D:** yellow warning box — "Item flagged for manual review."

#### Screen 5 — `/exchange` (Trade-in Confirmation)
- Reads all data from URL query params — no extra API call needed.
- Green checkmark header "Trade-in complete!"
- Item name + grade badge + trade-in value in `#B12704` red.
- Orange-bordered credit wallet panel: "₹X store credit. Valid on Second Life certified listings only." + "Browse Second Life listings →" CTA (links to `/`).
- Green CO₂ + credits earned banner below.
- "← Back to Home" link.
- Demo URL: `http://localhost:3000/exchange?item_id=ITM-001&name=Nike+Air+Max+270&grade=A&credit=1665&co2=14.1&credits=141`

#### Screen 2 — `/product/[id]` (Original PDP + Prevention Widget)
- Route param `id` is the `listing_id` (e.g. `LST-NIKE-AIR-270-BLK-10`).
- Fetches `GET /listings/{id}/warning` AND `GET /items/ITM-001` in parallel on mount.
- Fake PDP content: Nike Air Max 270, ₹9,999, ★★★★☆ 2,341 ratings, Add to Cart + Buy Now buttons.
- If `has_warning: true`: `PreventionBadge` renders above the Second Life panel — yellow-bordered box with SVG warning triangle, "[!] FIT ALERT" or "[!] COLOR ALERT", count, recommendation text, "Based on verified return data — AI-analysed".
- Second Life panel: green-bordered box with leaf SVG, grade, price, savings vs new, hub city, "View Certified Second Life →" link to `/refurb/ITM-001`.
- Demo URL: `http://localhost:3000/product/LST-NIKE-AIR-270-BLK-10`

#### Design system applied
- All inline styles — no Tailwind/CSS modules needed.
- SVG icons: leaf (green impact `#2d6a4f`), shield (trust `#146EB4`), pin (location `#555`), warning triangle (`#856404`).
- No emojis anywhere.
- Prices in `#B12704`, savings in `#2d6a4f`, CTAs `#FF9900`, secondary links `#146EB4`.

---

### Frontend Hardening Update (post-MVP — functional cart, checkout, navigation)

After the first frontend pass, the following were added to make the site fully functional end-to-end (no dead buttons) and more robust. Shared/new files; the items below touch Arush-owned surfaces.

#### `components/AmazonHeader.tsx` (Arush-owned) — cart badge + global nav
- Cart icon is now a `<Link href="/cart">` with a live orange count badge driven by the cart store.
- Logo links to `/`.
- New **secondary nav strip** (`#37475A`) rendered on every page: Second Life · Original PDP · Sell Your Item · Returns · Ops. Previously the only way to move between screens was typing URLs.
- Subscribes to the `cart-updated` window event + `storage` event so the badge updates instantly across tabs/components.

#### `pages/product/[id].tsx` (Arush-owned) — working buy buttons
- The original (new) product's "Add to Cart" and "Buy Now" are now functional: Add to Cart adds a `NIKE-NEW-270` line at ₹9,999 (0 CO₂); Buy Now routes to `/order-confirm`. This makes the demo's "buy new vs Second Life" contrast tangible while keeping the Second Life CTA prominent.
- `SecondLifeItem` interface extended with `brand`, `name`, `co2_saved_kg`, `credits`.

#### New shared files
- **`lib/cart.ts`** — client-side cart (no backend cart endpoint in MVP scope). Stored in `localStorage` under `secondlife_cart`, broadcasts a `cart-updated` event. API: `getCart`, `addToCart`, `isInCart`, `removeFromCart`, `clearCart`, `cartCount`. SSR-safe (guards `window`).
- **`pages/cart.tsx`** — shopping cart screen: item list (photo + grade + price), remove, order summary with subtotal + total CO₂, "Proceed to Checkout" (clears cart → `/order-confirm`), empty state.
- **`pages/order-confirm.tsx`** — Screen 8 (Order Confirmation Green Impact), which had not been built in the first pass. Reads `total`, `co2`, `credits`, `items` query params; fetches buyer name for the greeting; shows order #, green-impact panel (CO₂ saved + equivalent km driven + credits added → new balance). When `co2 = 0` (buying new) it shows a "switch to Second Life" nudge instead.

#### Robustness
- Image `onError` fallbacks on recommendation cards, refurb photos, and cart (presigned S3 URLs expire in 15 min — broken images now show "No photo").
- Refurb thumbnail switch resets the image-error flag; savings % guards divide-by-zero.
- Backend CORS now splits `CORS_ORIGINS` on commas and accepts `http://localhost:3000` **and** `:3001` (Next.js falls back to 3001 when 3000 is busy — this previously silently blocked all API calls).

#### "View full passport" UI fix
- Previously opened the raw, unstyled S3 HTML. Now opens a polished **in-app certificate modal** inside `TrustPassport.tsx` (Anupam-owned component) — navy header band, grade badge, labelled sections, with a small "Open certificate document ↗" fallback link to the original S3 file.

---

## Merge Sequence (Your Side)

```
H1   feat/infra-env → main
H3   feat/infra-db → main          ← CRITICAL: notify Anupam to pull
H4   feat/cache → main
H10  feat/agent-grading → main     ← notify Anupam to pull + replace mock
H12  feat/agent-disposition → main
H15  feat/agent-prevention → main
H20  feat/orchestrator → main      ← notify Anupam to pull + replace stub in seed.py
H24  feat/api-supply → main
H32  feat/frontend-supply → main
H34  both pull main, run seed.py, run E2E tests
```

### When to pull from Anupam

```
H5   pull main after Anupam merges feat/agent-pricing-credits
       → replace buyer_price_stub with real import in orchestrator.py
H12  pull main after Anupam merges feat/agent-matching
       → replace match_buyers_stub with real import in orchestrator.py
H16  pull main after Anupam merges feat/agent-passport
       → replace passport stub with real import in orchestrator.py
H22  pull main after Anupam merges feat/api-demand
       → verify /health, run both backends together
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

Health check: `curl http://localhost:8000/health`  
FastAPI docs: `http://localhost:8000/docs`

---

## Fixes Applied (Post Code-Review)

The following bugs were found during a code review and patched after the original merge.

### Fix A — `POST /community-list` price not persisted (`main.py`)
**Problem:** `listing_price_inr` was only patched onto the JSON response; DynamoDB still held the system-computed base price, so downstream reads (`GET /items`, ops dashboard, recommendations) showed the wrong price.  
**Fix:** After the result is assembled, `update_item("Items", ...)` is called to persist the seller's asking price to the `Items` table before returning.

### Fix B — Size-mismatch determinism when model already returns India-format size (`agents/grading.py`)
**Problem:** `_normalize_size` returned early if `detected_size` was not a key in `size_standard_map` (e.g. `"India 9"` is a *value* in the map, not a key). This meant `size_mismatch` was never recomputed in that case, leaving the model's own boolean unchecked against the normalized `listed_size`.  
**Fix:** When `detected_size` is not a key in the map (already normalized or unknown format), it is used as-is. The `listed_size` is still normalized and compared, so `size_mismatch` is always recomputed deterministically.

### Fix C — `CreditsLedger` action name collision (`orchestrator.py`)
**Problem:** `append_credits_ledger` (which records green CO₂ credits earned when an item is resold) wrote `action: "trade_in_credit"`. This collides with the exchange/trade-in store-credit action defined in the spec, making ledger queries ambiguous.  
**Fix:** Green credits earned on resale now use `action: "earn"`. The exchange trade-in store credit (INR-denominated, disposition route) keeps `action: "trade_in_credit"` as specified.

---

## Rules for AI Coding Tools

- Every DynamoDB table name must go through `table_name(logical_name)` from `db/dynamo.py`. Never hardcode `"SecondLife-Items"` directly in agents or endpoints.
- Every S3 key must follow the exact paths in `action_plan.md → Phase 1 → S3 object layout`.
- Model IDs are always read from env vars — `os.environ["BEDROCK_VISION_MODEL_ID"]` and `os.environ["BEDROCK_TEXT_MODEL_ID"]`. Never hardcode them.
- `DEMO_MODE=true` means: if a frontend-browsing endpoint would trigger an uncached Bedrock call, raise `BEDROCK_CACHE_MISS` error. The seed script pre-bakes all cache entries, so this should never fire during the demo.
- Money values are always integers (INR, no paise). `round()` all computed prices.
- Risk scores are floats 0.0–1.0. Never return a raw sigmoid output without `round(..., 4)`.
- Do not add extra fields to any response shape. Frontend components read exact field names from `action_plan.md`.
