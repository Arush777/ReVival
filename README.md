# ReVival — AI-Powered Circular Commerce

**Amazon HackOn Season 6 | Second-Life Commerce | Live demo:** https://revival-rose.vercel.app

ReVival is an end-to-end circular-commerce system that routes returned and seller-listed products back into the market instead of landfill. It uses a 7-agent pipeline to grade product condition from photos/video, route items to the correct disposition, recommend pricing, match items to low-return-risk buyers, generate trust passports, and prevent repeat listing errors.

## Why this project matters

Returns are expensive, wasteful, and often poorly routed. ReVival treats every returned item as a recoverable asset by combining AI vision, deterministic business rules, explainable buyer matching, and sustainability incentives.

## My contribution

I owned the **supply-side AI + AWS backend**:

- Built the product return and community-listing pipeline in **FastAPI**.
- Implemented the **AI vision grading agent** using AWS Bedrock vision models.
- Added **photo/video-based condition grading** with evidence, defect detection, size/color mismatch detection, and confidence buckets.
- Built the AWS data layer using **DynamoDB**, **S3**, and `boto3`.
- Added **Titan multimodal embedding caching** to reduce redundant Bedrock calls on visually similar products.
- Connected grading output to disposition, pricing, trust-passport generation, and buyer recommendation flows.

## System at a glance

| Area | Implementation |
|---|---|
| Backend | FastAPI, Python 3.12, boto3 |
| Frontend | Next.js, TypeScript |
| AI stack | AWS Bedrock, Qwen3-VL / Claude-compatible vision flow, Mistral/Claude-compatible text flow |
| Storage | DynamoDB + S3 |
| Agents | 7 total: grading, disposition, pricing, matching, green credits, passport, prevention |
| Caching | Titan multimodal image embeddings + deterministic text cache |
| Demo data | 30 buyers, 15 seed items, 10 Indian cities, 13 categories |

## Pipeline

```text
Seller uploads return/listing media
        ↓
AI Vision Grading Agent
        ↓
Disposition Agent
        ↓
Pricing Agent
        ↓
BuyerInterestIndex candidate retrieval
        ↓
LLM-assisted Matching Agent
        ↓
Green Credits calculation
        ↓
Trust Passport Agent
        ↓
Prevention Agent
        ↓
Item listed in buyer recommendation feed
```

## Core features

### 1. AI product grading

The grading agent accepts photos or videos and returns:

- condition grade: `A`, `B`, `C`, `D`, or `REVIEW`
- confidence bucket
- detected defects
- wear level
- functional-status signal
- size/color mismatch detection
- evidence fields for auditability
- image-cache metadata

Guardrails are applied after the LLM response:

- low confidence → `REVIEW`
- unsafe or hygiene-blocked products → `D` or `REVIEW`
- electronics with unknown functionality → `REVIEW`
- not-working products → `D`

### 2. Similarity cache for image grading

To reduce repeated Bedrock calls, product images are canonicalized, embedded through Titan multimodal embeddings, and looked up in an image-vector cache before calling the grading model again.

### 3. Buyer matching

The matching flow uses a two-stage ranking system:

1. Deterministic retrieval from `BuyerInterestIndex`.
2. LLM-assisted reranking using return-reason neutralization and recurrence risk.

The final risk score exposes factor-level explanations, including:

- buyer return rate
- size incompatibility
- condition intolerance
- brand affinity
- return-reason recurrence
- return-reason neutralization
- eco-credit boost

### 4. Trust Passport

Each resale item gets a human-readable condition report with:

- condition summary
- why the item was returned
- buyer reassurance
- AI verification explanation
- S3-hosted passport page

### 5. Prevention loop

If the system detects wrong size/color attributes, it writes listing flags so the original product page can warn future buyers and reduce repeat returns.

## API overview

| Method | Endpoint | Purpose |
|---|---|---|
| `POST` | `/returns` | Process a returned product through the full pipeline |
| `POST` | `/community-list` | Process a peer-to-peer seller listing |
| `POST` | `/grade-preview` | Grade media before listing submission |
| `GET` | `/buyers/{buyer_id}/recommendations` | Personalized resale recommendations |
| `GET` | `/items/{item_id}` | Item detail with grading evidence and buyer-risk breakdown |
| `GET` | `/items/{item_id}/passport` | Trust Passport data + S3 URL |
| `GET` | `/ops/items` | Operations dashboard feed |
| `POST` | `/credits/redeem` | Redeem green credits at checkout |

## Local setup

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp ../.env.example ../.env
python seed/seed.py
uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Create `frontend/.env.local`:

```bash
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_BUYER_ID=BUY-001
```

## Environment variables

Use `.env.example` as the source of truth. Do not commit real AWS bucket names, access keys, or account-specific infrastructure values.

Required categories:

- AWS region/profile
- Bedrock model IDs
- DynamoDB table prefix
- S3 bucket names
- CORS origins
- demo mode flag

## Repository structure

```text
ReVival/
├── backend/
│   ├── main.py
│   ├── orchestrator.py
│   ├── cache.py
│   ├── agents/
│   │   ├── grading.py
│   │   ├── disposition.py
│   │   ├── pricing.py
│   │   ├── matching.py
│   │   ├── green_credits.py
│   │   ├── passport.py
│   │   └── prevention.py
│   ├── db/
│   └── seed/
└── frontend/
    ├── pages/
    ├── components/
    ├── lib/
    └── data/
```

## Numbers at a glance

| Metric | Value |
|---|---:|
| Backend agents | 7 |
| LLM/vision-backed agents | 3 |
| Deterministic agents | 4 |
| DynamoDB tables | 7 |
| S3-backed artifact types | photos + trust passports |
| Frontend pages | 12 |
| React components | 9 |
| Seed buyers | 30 |
| Seed items | 15 |
| Risk-score factors | 7 |

## Demo checklist

Before sharing this repo, add:

- product upload/grading GIF
- buyer recommendation screenshot
- Trust Passport screenshot
- ops dashboard screenshot
- architecture diagram
- short demo video link

## Status

Hackathon prototype with working local/demo flows. The next step is deployment hardening: secrets management, CI checks, structured integration tests, and public demo instrumentation.
