# Amazon Second Life — AI-Powered Circular Commerce

An end-to-end system for routing returned products back into the market instead of landfill. When a seller returns or re-lists an item, an agent pipeline grades it, prices it, matches it to the buyer least likely to return it again, generates a verified condition report, and closes the listing prevention loop on the original product page.

# Live Link
[Vercel Live Link](https://revival-rose.vercel.app)
---

## Table of Contents

1. [What It Does](#what-it-does)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [Environment Variables](#environment-variables)
5. [Backend — API Reference](#backend--api-reference)
6. [Agents](#agents)
7. [Database Schema](#database-schema)
8. [Frontend — Pages & Components](#frontend--pages--components)
9. [Seed Data](#seed-data)
10. [Feature Details](#feature-details)
11. [Project Structure](#project-structure)

---

## What It Does

```
Seller uploads return (photos / video)
        │
        ▼
 [Grading Agent]      AI vision → A/B/C/D/REVIEW + defects + size/colour mismatch
        │
        ▼
 [Disposition Agent]  resell / refurbish / donate / recycle / exchange / manual_review
        │
        ▼
 [Pricing Agent]      base_price = 90% × recovered_value
        │
        ▼
 [BuyerInterestIndex] DynamoDB: 50 candidate buyers by category + region
        │
        ▼
 [Matching Agent]     LLM reranks by return-reason neutralisation + recurrence risk
        │
        ▼
 [Green Credits]      CO₂ saved (manufacturing + shipping) → credits
        │
        ▼
 [Passport Agent]     LLM writes honest condition report → S3 HTML + Item record
        │
        ▼
 [Prevention Agent]   Correct listing attributes; write ListingFlags for PDP widget
        │
        ▼
 Items.status = "listed" → appears in buyer recommendation feeds
```

The same pipeline runs for **community P2P listings** — a seller-listed item passes through identical grading, passport generation, and recommendation routing.

---

## Architecture

### Backend

- **FastAPI** + **boto3** on Python 3.12
- **7 agents** — 3 call AWS Bedrock (vision grading, LLM matching, LLM passport); 4 are pure deterministic code
- **AWS Bedrock** for AI calls — vision model for grading (Qwen 3 VL 235B / Claude Sonnet 4.6), text model for matching + passport (Mistral Large 3 / Claude Haiku 4.5)
- **DynamoDB** — 7 tables (Items, Buyers, BuyerInterestIndex, ListingFlags, CreditsLedger, GradeCache, ImageVectorCache)
- **S3** — 2 buckets (photos, passports)
- **Hybrid AI caching** — image agents use Amazon Titan Multimodal Embeddings (`amazon.titan-embed-image-v1`) in `ImageVectorCache` for cosine-similarity hits; text-only agents keep deterministic cache keys in `GradeCache`

### Frontend

- **Next.js** + **TypeScript**, Amazon-style UI
- 12 pages, 9 components
- LocalStorage cart with cross-tab sync via custom event emitter
- Grade-preview flow: uploads media → backend AI grades → recommended price appears with green/yellow/red traffic-light indicator

---

## Quick Start

### Prerequisites

- Python 3.12+, Node.js 18+
- AWS account with Bedrock access (ap-south-1)
- `ffmpeg` installed (required for video grading; photo-only flows work without it)
- AWS profile configured (`secondlife-local-dev` or set `AWS_PROFILE`)

### Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env   # fill in your values
python seed/seed.py          # create tables, upload photos, pre-warm cache
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
# create frontend/.env.local:
# NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
# NEXT_PUBLIC_DEMO_BUYER_ID=BUY-001
npm run dev    # http://localhost:3000
```

---

## Environment Variables

Copy `.env` to the project root and fill in:

```ini
APP_ENV=local
DEMO_MODE=true                              # bypass some live Bedrock calls for demo speed

AWS_DEFAULT_REGION=ap-south-1
AWS_PROFILE=secondlife-local-dev

# Bedrock model IDs
BEDROCK_REGION=ap-south-1
BEDROCK_VISION_MODEL_ID=qwen.qwen3-vl-235b-a22b
# or: anthropic.claude-sonnet-4-6
BEDROCK_TEXT_MODEL_ID=mistral.mistral-large-3-675b-instruct
# or: anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_IMAGE_EMBED_MODEL_ID=amazon.titan-embed-image-v1
IMAGE_EMBEDDING_DIMENSIONS=256
IMAGE_CACHE_SIMILARITY_THRESHOLD=0.985

# Financial recovery metrics
GENERAL_ECOMMERCE_AOV_INR=1000              # clamped to the realistic ₹800–1,200 band

# DynamoDB (tables are prefixed, e.g. SecondLifeItems)
DDB_TABLE_PREFIX=SecondLife

# S3 (must exist in your account)
S3_PHOTOS_BUCKET=secondlife-photos-478982785786
S3_PASSPORTS_BUCKET=secondlife-passports-478982785786

# CORS (comma-separated)
CORS_ORIGINS=http://localhost:3000
```

Frontend (`frontend/.env.local`):

```ini
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_BUYER_ID=BUY-001
```

---

## Backend — API Reference

### Health & Config

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | `{ok, service, env, aws_region}` |
| `GET` | `/config` | API base URL + demo IDs |

### Supply-Side (Return / Sell Flow)

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/returns` | Process a return: `multipart/form-data` with `payload` (JSON), optional `photos[]`, optional `video`. Runs full agent pipeline. Returns `{item_id, status, grade, disposition, base_price_inr, co2_saved_kg, credits, trade_in_credit_inr, top_matches, warning_written}` |
| `POST` | `/community-list` | P2P seller listing: same form-data shape as `/returns`. On success returns the full item result; on D/REVIEW returns `{status, grade, recommended_price_inr, grade_factor, demand_factor}` |
| `POST` | `/grade-preview` | Pre-submission AI grade: `category`, `condition` (form fields) + `photos[]` or `video`. Returns `{grade, confidence, wear_level, evidence[]}`. Used by the sell page to show a price recommendation before final submit. Returns HTTP 422 if ffmpeg is missing and only a video was provided |
| `GET` | `/listings/recommend-price` | `?original_price=&grade=&category=&region=` → `{recommended_price, grade_factor, demand_factor}` |
| `GET` | `/listings/{listing_id}/warning` | Size/colour mismatch flag for a listing (PDP prevention widget) |

### Demand-Side (Buyer / Browse Flow)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/buyers` | List buyers; filter by `?region=&category=` |
| `GET` | `/buyers/{buyer_id}` | Full buyer record |
| `GET` | `/buyers/{buyer_id}/orders` | Order history |
| `GET` | `/buyers/{buyer_id}/recommendations` | Two-stage personalised feed with `?limit=&cart=` cart-aware ranking. Each item includes `re_return_risk`, `why_this_fits`, and all XAI transparency fields |
| `GET` | `/search` | `?q=&category=&grade=` full-text search |
| `GET` | `/search/suggestions` | `?q=` autocomplete |
| `GET` | `/items/{item_id}` | Full item detail: photos, passport URL, 13 grading evidence fields, `_enrich_matches` with per-buyer 7-factor risk breakdown |
| `GET` | `/items/{item_id}/passport` | Trust Passport text fields + presigned S3 HTML URL |
| `POST` | `/items/{item_id}/request-review` | Flag item for human review |

### Ops & Credits

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/ops/items` | Ops dashboard feed: `?status=&limit=`. Returns evidence, confidence_bucket, wear_level, rubric_version, image embedding cache metadata, and AOV-grounded recovery metrics |
| `POST` | `/credits/redeem` | Buyer redeems credits at checkout (max 20% of item price); writes CreditsLedger row |
| `POST` | `/notify-seller` | Fire-and-forget seller notification stub |

---

## Agents

### 1. Grading Agent (`agents/grading.py`)

Runs AI vision on photos or video to assign a condition grade.

**Model:** `BEDROCK_VISION_MODEL_ID` (Qwen 3 VL 235B or Claude Sonnet 4.6)

**Grading rubric:**

| Grade | Meaning |
|-------|---------|
| A | New-like / open-box — no meaningful wear |
| B | Fully usable, light cosmetic wear, no repair needed |
| C | Usable but visibly worn, needs cleaning / minor repair |
| D | Not resellable: non-functional, unsafe, missing critical parts |
| REVIEW | Insufficient or ambiguous evidence |

**Deterministic guardrails applied after the LLM response:**
- Low-confidence → REVIEW
- Safety/hygiene blocker flagged → D
- `functional_status = not_working` → D
- Electronics with `functional_status = unknown` → REVIEW
- Unsealed hygiene/food item → REVIEW

**Outputs:** `grade`, `raw_llm_grade`, `grade_bucket`, `confidence_bucket`, `defects[]`, `wear_level`, `functional_status`, `detected_color`, `detected_size`, `size_mismatch`, `color_mismatch`, `mismatch_notes`, `evidence[]`, `rubric_version`, `image_embedding_cache_id`, `image_embedding_model_id`, `image_similarity_score`, `image_similarity_threshold`

**Similarity-cache guarantee:** images are canonicalised (EXIF, RGB JPEG, max 1600px, q=85), embedded through Amazon Titan Multimodal Embeddings, and looked up in `ImageVectorCache` by cosine similarity before any grading/audit Bedrock call. Stable item/listing metadata remains an exact guardrail so visually similar products do not reuse results across different return context.

**Three entry points:**
- `grade_item(item, s3_keys)` — orchestrator path (downloads from S3)
- `grade_item_from_paths(item, local_paths)` — `/grade-preview` path (local temp files, no S3 upload)
- `grade_from_video(item, video_path)` — extracts 5 frames via ffmpeg, then calls image grading

---

### 2. Disposition Agent (`agents/disposition.py`)

Pure deterministic routing — no LLM.

| Grade | Default route | High-value electronics |
|-------|--------------|------------------------|
| A | resell | resell |
| B | resell | resell |
| C | donate | refurbish |
| D | recycle | recycle |
| REVIEW | manual_review | manual_review |

Trade-in flag upgrades A/B → exchange. Item resale value = `original_price × {A:0.70, B:0.55, C:0.35, D:0.05}` and is used for listing/trade-in economics.

Portfolio recovery metrics are grounded separately on a realistic general e-commerce AOV:

```
portfolio_recovered_value = GENERAL_ECOMMERCE_AOV_INR × grade_factor
default GENERAL_ECOMMERCE_AOV_INR = ₹1,000
allowed realistic band = ₹800–1,200
```

---

### 3. Pricing Agent (`agents/pricing.py`)

Pure math — no LLM.

**Seller-facing (listing price recommendation):**
```
recommended_price = original_price × grade_factor × demand_factor
demand_factor ∈ [0.8, 1.1] mapped from demand_table signal ∈ [0.5, 0.95]
```

**Buyer-facing (dynamic geo-aware pricing):**
```
proximity_discount = min(0.25, 0.25 × (1 − distance_km / 1500))
price = base_price × (1 − proximity_discount) × demand_factor
```

---

### 4. Matching Agent (`agents/matching.py`)

Two-stage matching to find the buyer least likely to return an item.

**Stage 1 (deterministic):** Query `BuyerInterestIndex` → up to 50 candidates by category + region, ranked by distance.

**Stage 2 (LLM):** Text model scores each candidate on two discrete signals:
- `reason_neutralized` — does a buyer trait cancel the return reason? ("runs small" + "always sizes up" → `strong`)
- `reason_recurrence` — has the buyer returned for this same reason before?

**7-factor re-return risk score:**

| Factor | Weight | Direction | Type |
|--------|--------|-----------|------|
| `buyer_return_rate` | 0.25 | risk ↑ | deterministic |
| `size_incompatibility` | 0.30 | risk ↑ | deterministic |
| `condition_intolerance` | 0.15 | risk ↑ | deterministic |
| `brand_affinity` | 0.20 | benefit ↓ | deterministic |
| `reason_recurrence` | 0.15 | risk ↑ | LLM-derived |
| `reason_neutralization` | 0.35 | benefit ↓ | LLM-derived |
| `eco_boost` | cap 0.05 | benefit ↓ | deterministic |

Final score = sigmoid(6 × (raw − 0.5)) → normalised [0, 1]. Lower = safer buyer.

The `risk_factors()` function returns the full per-factor breakdown (value, weight, direction, `llm_derived` bool) attached to every buyer match via `_enrich_matches()` — surfaced in the XAI panel on the listing page.

---

### 5. Green Credits Agent (`agents/green_credits.py`)

Pure lifecycle maths — no LLM.

```
co2_manufacturing = carbon_table[category].manufacturing_kg_co2
co2_shipping = max(0, 1200 − nearest_buyer_km) × item_weight_kg × 0.0001
co2_saved_kg  = co2_manufacturing + co2_shipping
credits        = round(co2_saved_kg × 10)
```

Redemption tiers:
- **Tier 1 — Priority access:** eco_boost (max 0.05) applied to risk score for high-credit buyers
- **Tier 2 — Discount:** up to 20% of item price at checkout
- **Tier 3 — NGO donation:** tree-planting on order confirmation page

---

### 6. Trust Passport Agent (`agents/passport.py`)

Generates an honest, human-readable condition report via LLM.

**Model:** `BEDROCK_TEXT_MODEL_ID`

**Four text fields:** `summary`, `condition_statement`, `why_returned`, `buyer_reassurance`

Fields are written directly onto the Item DynamoDB record (`passport_summary`, `passport_condition`, `passport_why_returned`, `passport_reassurance`) at generation time. The `/items/{id}/passport` endpoint reads stored fields directly, avoiding brittle cache-key reconstruction when DynamoDB number types round-trip differently. Cache reconstruction remains only as a fallback for legacy items.

The rendered S3 HTML shows `Verified by: AI Vision Model · AWS Bedrock` (not the raw Bedrock model ID).

---

### 7. Prevention Agent (`agents/prevention.py`)

Pure deterministic — no LLM.

**Supply-side:** If grading detected a size/colour mismatch, update the Item record to the detected values. Wrong attributes cannot re-enter the catalog.

**Demand-side:** Write a `ListingFlags` entry keyed by the original product's `listing_id`. The PDP widget shows: *"Runs small — 5 buyers found this."*

---

## Database Schema

### DynamoDB Tables

| Table | PK | SK | Purpose |
|-------|----|----|---------|
| `{prefix}Items` | `item_id` | — | All items post-grading. Stores all grading fields, photo_keys, passport fields, matches, credits |
| `{prefix}Buyers` | `buyer_id` | — | Buyer profiles: region, return_rate, credit_score, size_profile, purchase/return history |
| `{prefix}BuyerInterestIndex` | `category` | `region#buyer_id` | Stage-1 match index: fast scan of buyers per category+region |
| `{prefix}ListingFlags` | `listing_id` | — | Mismatch flags for PDP prevention widget |
| `{prefix}CreditsLedger` | `buyer_id` | `{timestamp}#{item_id}#{action}` | Append-only credits history |
| `{prefix}GradeCache` | `cache_key` | — | Deterministic text/cache-control output cache for matching, passport, and legacy reads |
| `{prefix}ImageVectorCache` | `vector_id` | — | Titan image embeddings + cached image-agent outputs for similarity search |

### S3 Buckets

| Bucket | Key pattern | Content |
|--------|------------|---------|
| `S3_PHOTOS_BUCKET` | `photos/{item_id}/{filename}` | Item photos |
| `S3_PASSPORTS_BUCKET` | `passports/{item_id}.html` | Trust Passport HTML pages |

---

## Frontend — Pages & Components

### Pages

| Route | Description |
|-------|-------------|
| `/` | Buyer homepage: banner carousel, hero recommendation grid, green corner, trending nearby |
| `/sell` | P2P seller flow: item details → rough asking price → media upload → AI grade-preview → traffic-light price rec → submit |
| `/return` | Retailer return flow: return reasons, replacement options, trade-in toggle, media upload |
| `/refurb/[id]` | Refurbished item detail: photo carousel, 📹 video-analysis badge, grade badge, price (save-X% guarded), Trust Passport, AI Grading Evidence panel, buyer match cards with risk breakdown |
| `/product/[id]` | Original catalog PDP with prevention widget |
| `/search` | Search with autocomplete suggestions |
| `/cart` | Cart: items, CO₂ total, credits, checkout |
| `/exchange` | Trade-in credit calculator |
| `/order-confirm` | Post-purchase: CO₂ impact, credits awarded, NGO donation option |
| `/ops` | Ops dashboard: item table, status filter, AI grading evidence, confidence badge, audit trail, HITL human review |

### Components

| Component | Purpose |
|-----------|---------|
| `AmazonHeader` | Navigation bar with cart count and buyer points badge |
| `RecommendationCard` | Item card with grade badge, XAI "why this fits" inline expand, add-to-cart |
| `AIGradingEvidence` | Collapsible AI inspection report: evidence[], defect scan with severity badges, size/colour verification, 7-factor risk formula breakdown, audit trail |
| `TrustPassport` | Passport modal with condition report + "How AI verified this" expandable section (raw evidence, model, confidence, embedding match) |
| `PreventionBadge` | PDP warning chip ("Runs small — N buyers found this") |
| `CreditsRedemption` | Credits discount calculator (≤20% of item price) |
| `GreenImpact` | CO₂ saved + credits earned pill |
| `CatalogCard` | New-product card for hero catalog grid |
| `Spinner` | Inline loading spinner |

---

## Seed Data

The seed script (`backend/seed/seed.py`) is idempotent and runs in 8 steps:

1. Create all 7 DynamoDB tables + 2 S3 buckets
2. Validate reference JSON files
3. Write 30 buyers → `Buyers` + `BuyerInterestIndex`
4. Write 15 items → `Items` (status = pending)
5. Upload local seed photos (`seed/ITM_XXX/`) to S3
6. Run `process_existing_item()` per item → grades, routes, generates passports, populates GradeCache and ImageVectorCache
7. Pre-warm recommendation cache for every buyer
8. Print summary + verify cache hit latency < 100ms

**Reference data** (`seed/reference/`):

| File | Contents |
|------|----------|
| `carbon_table.json` | Manufacturing CO₂ kg + item weight per category |
| `demand_table.json` | Regional demand signal (0.3–0.95) per city × category |
| `city_coords.json` | Lat/long for 10 Indian cities |
| `size_standard_map.json` | Category-specific size normalisation (US ↔ India sizing) |

---

## Feature Details

### Sell Page — Grade-Before-Price Flow

1. Seller fills in item details + rough asking price (hint shown: *upload media to unlock AI rec*)
2. Uploads **photos (1–5) or a video (max 60s / 100 MB)** — at least one required
   - Video duration enforced client-side via `loadedmetadata`
   - >5 photos: explicit warning, first 5 kept
   - Single-file uploads normalised via `_normalize_photos()` (FastAPI Pydantic v2 fix)
3. On media upload → `POST /grade-preview` fires → spinner: *"AI grading your media…"*
4. Real AI grade returned → `POST /listings/recommend-price` called with that grade → card: `AI grade: B · Recommended: ₹X (demand ×1.2)`
5. Traffic-light on asking price: 🔴 too high / 🟡 too low / 🟢 optimal
6. If ffmpeg missing + video-only → HTTP 422: *"Video grading requires ffmpeg. Please upload photos instead."*
7. On D/REVIEW outcome → result panel always shows `recommended_price_inr` (backend computes it regardless of disposition)

### Video Grading & Thumbnail

When a video is uploaded with no photos:
1. `extract_video_thumbnail()` → ffmpeg extracts a high-quality frame at 1s
2. Thumbnail uploaded to S3 as `photos/{item_id}/thumbnail.jpg`, stored in `photo_keys`
3. `video_graded: True` written to the Item record
4. Listing page shows a 📹 *AI video analysis* overlay badge

### Replacement Routing

`/returns` accepts optional `replacement_option`:
- `direct_replacement` — set `replacement_queued=True`; item routes through normal pipeline
- `replace_with_resale` — force listing regardless of grade; add defective-deal notes; still calculate recommendations

### Cart-Aware Recommendations

`GET /buyers/{buyer_id}/recommendations?cart=item1,item2` excludes cart items from results and passes them to the LLM ranking prompt for feed diversification.

### Photo Upload Compatibility

FastAPI 0.111.0 / Pydantic v2 does not coerce a single `UploadFile` into `List[UploadFile]`. All photo-accepting endpoints declare `Optional[Union[UploadFile, List[UploadFile]]]` and normalise through `_normalize_photos()`.

---

## Project Structure

```
ReVival/
├── .env                            # Root env file
├── backend/
│   ├── main.py                     # FastAPI app — all routes
│   ├── orchestrator.py             # Agent pipeline runner + video thumbnail extraction
│   ├── cache.py                    # deterministic text cache + Titan image vector cache
│   ├── agents/
│   │   ├── grading.py              # AI vision grading (photos + video, 3 entry points)
│   │   ├── disposition.py          # Deterministic routing
│   │   ├── pricing.py              # Circular pricing + geo-aware buyer pricing
│   │   ├── matching.py             # 2-stage buyer matching + 7-factor risk_factors()
│   │   ├── green_credits.py        # CO₂ + credits calculation
│   │   ├── passport.py             # LLM condition report + S3 HTML
│   │   └── prevention.py           # Attribute correction + listing flags
│   ├── db/
│   │   ├── dynamo.py               # DynamoDB helpers
│   │   └── s3.py                   # S3 upload + presign helpers
│   └── seed/
│       ├── seed.py                 # Idempotent seed script (8 steps)
│       ├── buyers.json             # 30 buyer records
│       ├── items.json              # 15 item records
│       ├── ITM_XXX/                # Seed photos per item
│       └── reference/              # carbon, demand, city_coords, size_map JSON
└── frontend/
    ├── pages/
    │   ├── index.tsx               # Buyer homepage
    │   ├── sell.tsx                # P2P seller + grade-preview flow
    │   ├── return.tsx              # Return / trade-in flow
    │   ├── search.tsx              # Search results
    │   ├── cart.tsx                # Shopping cart
    │   ├── exchange.tsx            # Trade-in calculator
    │   ├── order-confirm.tsx       # Post-purchase confirmation
    │   ├── ops.tsx                 # Ops dashboard
    │   ├── product/[id].tsx        # Original PDP
    │   └── refurb/[id].tsx         # Refurbished item detail
    ├── components/
    │   ├── AmazonHeader.tsx
    │   ├── RecommendationCard.tsx
    │   ├── AIGradingEvidence.tsx
    │   ├── TrustPassport.tsx
    │   ├── PreventionBadge.tsx
    │   ├── CreditsRedemption.tsx
    │   ├── GreenImpact.tsx
    │   ├── CatalogCard.tsx
    │   └── Spinner.tsx
    ├── lib/
    │   └── cart.ts                 # Cart state (localStorage + custom event bus)
    └── data/
        └── catalog.json            # Static product catalog
```

---

## Numbers at a Glance

| | |
|--|--|
| API endpoints | 25+ |
| Agents | 7 (3 LLM, 4 deterministic) |
| DynamoDB tables | 7 |
| S3 buckets | 2 |
| Seed buyers | 30 |
| Seed items | 15 |
| Supported Indian cities | 10 |
| Product categories | 13 |
| Risk score factors | 7 (4 deterministic + 2 LLM-derived + 1 eco) |
| Frontend pages | 12 |
| React components | 9 |
