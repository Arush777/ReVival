# SecondLife Commerce — Action Plan
> Direct implementation guide. Every schema, formula, prompt, and screen is exact. No ambiguity.

---

## Table of Contents

- [Folder Structure](#folder-structure)
- [Tech Stack](#tech-stack)
- [MVP Deployment Boundary](#mvp-deployment-boundary)
  - Local frontend/backend split
  - AWS services used in MVP
  - AWS services explicitly not used in MVP
- [Phase 0 — Environment Setup](#phase-0--environment-setup)
  - `requirements.txt`
  - AWS account setup checklist
  - IAM policy for local development
  - Backend `.env`
  - Frontend `.env.local`
  - Local run commands
  - S3 buckets to create
- [Phase 1 — DynamoDB Tables](#phase-1--dynamodb-tables)
  - Physical table names and billing mode
  - `Items`
  - `Buyers`
  - `BuyerInterestIndex`
  - `GradeCache`
  - `ListingFlags`
  - `CreditsLedger`
  - `create_tables.py` exact contract
  - How the tables connect
  - S3 object layout
- [Phase 2 — Reference JSON Files](#phase-2--reference-json-files)
  - `size_standard_map.json`
  - `carbon_table.json`
  - `demand_table.json`
  - `city_coords.json`
- [Phase 3 — Seed Data](#phase-3--seed-data)
  - `buyers.json`
  - Buyer seed robustness rules
  - `items.json`
  - Item validation rules
- [Phase 4 — Agent Implementation](#phase-4--agent-implementation)
  - `db/dynamo.py`
  - `db/s3.py`
  - `cache.py`
  - Agent ① — grading
  - Agent ④ — disposition
  - Agent ⑤ — pricing
  - Agent ② — matching
  - Agent ⑥ — green credits
  - Agent ③ — passport
  - Agent ⑦ — prevention
  - Community Listing (P2P)
- [Phase 5 — Orchestrator](#phase-5--orchestrator)
  - `process_return`
  - `process_existing_item`
- [Phase 6 — API Endpoints](#phase-6--api-endpoints-mainpy)
  - Endpoint summary
  - Shared response rules
  - `GET /health`
  - `GET /config`
  - `POST /returns`
  - `POST /community-list`
  - `GET /items/{item_id}`
  - `GET /items/{item_id}/passport`
  - `GET /listings/{listing_id}/warning`
  - `GET /buyers`
  - `GET /buyers/{buyer_id}`
  - `GET /buyers/{buyer_id}/recommendations`
  - `GET /ops/items`
  - `POST /notify-seller`
  - `POST /credits/redeem`
  - Frontend page-to-endpoint map
- [Phase 7 — Frontend Screens](#phase-7--frontend-screens)
  - Screen 1 — Buyer Recommendation Feed
  - Screen 2 — Original Product Page Prevention Widget
  - Screen 3 — Refurb Listing Page
  - Screen 4 — Returns Flow
  - Screen 5 — Exchange / Trade-in Confirmation
  - Screen 6 — P2P Seller Listing
  - Screen 7 — Ops Dashboard
  - Screen 8 — Order Confirmation Green Impact
- [Phase 8 — Seed Script](#phase-8--seed-script)
  - `seed/seed.py`
  - Demo cache warmup
  - Seed validation checks
- [Phase 9 — Demo Script](#phase-9--demo-script-record-this-exactly)
  - 90-second demo narrative
- [Phase 10 — Build Order](#phase-10--build-order)

---

## Folder Structure

```
secondlife/
├── backend/
│   ├── main.py                  # FastAPI app + all routes
│   ├── orchestrator.py          # runs 7 agents in order
│   ├── agents/
│   │   ├── grading.py           # Agent ①  Bedrock vision
│   │   ├── matching.py          # Agent ②  Bedrock text
│   │   ├── passport.py          # Agent ③  Bedrock text
│   │   ├── disposition.py       # Agent ④  pure code
│   │   ├── pricing.py           # Agent ⑤  pure code
│   │   ├── green_credits.py     # Agent ⑥  pure code
│   │   └── prevention.py        # Agent ⑦  pure code
│   ├── db/
│   │   ├── dynamo.py            # DynamoDB client + helpers
│   │   └── s3.py                # S3 upload/download helpers
│   ├── cache.py                 # content-hash cache (GradeCache table)
│   ├── seed/
│   │   ├── seed.py              # one-time seed script
│   │   ├── buyers.json          # 30 buyer records
│   │   ├── items.json           # 15 item records
│   │   └── reference/
│   │       ├── size_standard_map.json
│   │       ├── carbon_table.json
│   │       ├── demand_table.json
│   │       └── city_coords.json
│   └── requirements.txt
├── frontend/
│   ├── pages/
│   │   ├── index.tsx            # buyer recommendation feed (hero screen)
│   │   ├── return.tsx           # returner upload flow + exchange branch
│   │   ├── exchange.tsx         # trade-in store credit confirmation screen
│   │   ├── sell.tsx             # P2P community listing flow
│   │   ├── ops.tsx              # ops/seller dashboard
│   │   ├── product/[id].tsx     # original PDP + prevention widget
│   │   └── refurb/[id].tsx      # refurb listing + passport + credits redemption
│   └── components/
│       ├── AmazonHeader.tsx     # navy #232F3E header, search bar, cart icon
│       ├── RecommendationCard.tsx
│       ├── TrustPassport.tsx
│       ├── GreenImpact.tsx
│       ├── PreventionBadge.tsx
│       └── CreditsRedemption.tsx
└── README.md
```

---

## Tech Stack

| Layer | Use exactly this |
|---|---|
| Backend | Python 3.11, FastAPI, uvicorn running locally |
| AI | boto3, `bedrock-runtime` client, Converse API |
| Vision model | Env var `BEDROCK_VISION_MODEL_ID`; recommended Claude Sonnet 4.x/4.5 vision model available in your Bedrock account |
| Text model | Env var `BEDROCK_TEXT_MODEL_ID`; recommended Claude Haiku 4.x/4.5 text model available in your Bedrock account |
| Database | AWS DynamoDB (6 tables) |
| File storage | AWS S3 (2 buckets) |
| Frontend | Next.js 14, React, shadcn/ui running locally |
| AWS region | `ap-south-1` (Mumbai — India-first) |

---

## MVP Deployment Boundary

For HackOn, do **not** deploy the backend or frontend to AWS unless there is extra time. Keep the app fast, cheap, and debuggable:

```
Browser
  -> local Next.js frontend at http://localhost:3000
  -> local FastAPI backend at http://localhost:8000
  -> AWS Bedrock for AI calls
  -> AWS DynamoDB for persistent tables
  -> AWS S3 for photos and Trust Passport HTML
```

**AWS services used in MVP:**
- `Amazon Bedrock`: grading, matching rerank, Trust Passport generation.
- `Amazon DynamoDB`: Items, Buyers, BuyerInterestIndex, GradeCache, ListingFlags, CreditsLedger.
- `Amazon S3`: uploaded product photos and generated passport HTML.
- `IAM`: one least-privilege local development user/role.
- `CloudWatch Logs`: optional debugging if Lambda is added later; not required for local FastAPI.
- `AWS Budgets`: cost guardrail. Create a low budget alert before running Bedrock calls.

**AWS services explicitly not used in MVP:**
- No Lambda, API Gateway, EC2, ECS, App Runner, NAT Gateway, RDS, OpenSearch, Bedrock Knowledge Base, or custom domain.
- No backend deployment for the demo. The public demo video can run against localhost.

**Why this split works:** judges still see real AWS AI, database, and storage. We avoid deployment risk during the 48-hour build.

---

## Phase 0 — Environment Setup

### requirements.txt
```
fastapi==0.111.0
uvicorn==0.29.0
boto3==1.34.0
python-multipart==0.0.9
pillow==10.3.0
python-dotenv==1.0.1
```

### AWS account setup checklist

1. Choose AWS region `ap-south-1`.
2. Open Bedrock console → Model access → request/enable access for the Claude vision/text models available to the account.
3. Create a local IAM user named `secondlife-local-dev` or use an AWS SSO profile.
4. Attach least-privilege permissions for only Bedrock invoke, DynamoDB table access, S3 bucket access, and CloudWatch logs if needed.
5. Create an AWS Budget alert before running seed. Suggested threshold: `$5` or `₹500`.

### IAM policy for local development

Replace `<account-id>` and bucket names before attaching.

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "BedrockInvoke",
      "Effect": "Allow",
      "Action": [
        "bedrock:InvokeModel",
        "bedrock:InvokeModelWithResponseStream",
        "bedrock:Converse",
        "bedrock:ConverseStream"
      ],
      "Resource": "*"
    },
    {
      "Sid": "DynamoSecondLifeTables",
      "Effect": "Allow",
      "Action": [
        "dynamodb:CreateTable",
        "dynamodb:DescribeTable",
        "dynamodb:ListTables",
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:UpdateItem",
        "dynamodb:DeleteItem",
        "dynamodb:Query",
        "dynamodb:Scan",
        "dynamodb:BatchGetItem",
        "dynamodb:BatchWriteItem"
      ],
      "Resource": [
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/SecondLife-*",
        "arn:aws:dynamodb:ap-south-1:<account-id>:table/SecondLife-*/index/*"
      ]
    },
    {
      "Sid": "S3SecondLifeBuckets",
      "Effect": "Allow",
      "Action": [
        "s3:CreateBucket",
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::secondlife-photos-<account-id>",
        "arn:aws:s3:::secondlife-photos-<account-id>/*",
        "arn:aws:s3:::secondlife-passports-<account-id>",
        "arn:aws:s3:::secondlife-passports-<account-id>/*"
      ]
    }
  ]
}
```

### Backend `.env`

Create `backend/.env`:

```
APP_ENV=local
DEMO_MODE=true
AWS_DEFAULT_REGION=ap-south-1
BEDROCK_REGION=ap-south-1

# Use the exact model or inference profile IDs enabled in your Bedrock account.
# If ap-south-1 requires cross-region inference, paste the inference profile ID here.
BEDROCK_VISION_MODEL_ID=<bedrock-claude-sonnet-vision-model-or-inference-profile-id>
BEDROCK_TEXT_MODEL_ID=<bedrock-claude-haiku-text-model-or-inference-profile-id>

DDB_TABLE_PREFIX=SecondLife
S3_PHOTOS_BUCKET=secondlife-photos-<account-id>
S3_PASSPORTS_BUCKET=secondlife-passports-<account-id>

CORS_ORIGINS=http://localhost:3000
```

Use either `AWS_PROFILE=<profile-name>` or `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`. Prefer `AWS_PROFILE` for local development.

### Frontend `.env.local`

Create `frontend/.env.local`:

```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
NEXT_PUBLIC_DEMO_BUYER_ID=BUY-001
```

### Local run commands

Backend:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Frontend:

```bash
cd frontend
npm install
npm run dev
```

Open:
- Frontend: `http://localhost:3000`
- Backend docs: `http://localhost:8000/docs`
- Health check: `http://localhost:8000/health`

### S3 buckets to create

The seed script can create these automatically. If creating manually, use:

```
secondlife-photos-<your-account-id>
secondlife-passports-<your-account-id>
```

Bucket rules:
- Region: `ap-south-1`
- Block public access: ON
- Server-side encryption: S3 managed keys (`AES256`)
- Store public-facing URLs through backend presigned URLs, not public bucket policy.

---

## Phase 1 — DynamoDB Tables

Create all 6 tables. PK/SK and GSIs listed below.

**Physical table names:** prefix every table with `DDB_TABLE_PREFIX`. With the default `.env`, the tables are:
- `SecondLife-Items`
- `SecondLife-Buyers`
- `SecondLife-BuyerInterestIndex`
- `SecondLife-GradeCache`
- `SecondLife-ListingFlags`
- `SecondLife-CreditsLedger`

**Billing mode:** use `PROVISIONED`, `ReadCapacityUnits=1`, `WriteCapacityUnits=1` for every table and GSI. This is slower during seeding but safer for free-tier usage. The seed script must write serially with retries/backoff on throttling.

**Helper naming rule:** application code refers to logical names (`Items`, `Buyers`) and `db/dynamo.py` maps them to physical names with:

```python
def table_name(logical_name: str) -> str:
    return f"{os.environ.get('DDB_TABLE_PREFIX', 'SecondLife')}-{logical_name}"
```

### Table: `Items`
- PK: `item_id` (String)
- No SK
- GSI name: `StatusCategoryIndex`
  - GSI PK: `status` (String)
  - GSI SK: `category` (String)
  - Use for buyer recommendation feeds: query `status="listed"` once per buyer interest category.
- GSI name: `ListingStatusIndex`
  - GSI PK: `listing_id` (String)
  - GSI SK: `status` (String)
  - Use for original PDP: show certified second-life options for the same listing family.

### Table: `Buyers`
- PK: `buyer_id` (String)
- GSI name: `RegionCategoryIndex`
  - GSI PK: `region` (String)
  - GSI SK: `primary_category` (String)
- This is useful for simple ops/debug queries. Do not rely on it alone for matching, because DynamoDB cannot query array elements inside `category_interests`.

### Table: `BuyerInterestIndex`
- PK: `category` (String)
- SK: `region_buyer_id` (String) formatted as `{region}#{buyer_id}`
- Attributes: `buyer_id`, `region`, `return_rate`, `credit_score`
- One row per `(buyer_id, category_interests[])`. This is the scalable Stage-1 retrieval path for matching without scanning all buyers.

### Table: `GradeCache`
- PK: `cache_key` (String)
- No SK
- TTL attribute: omit for demo caches. Only use TTL in production if you are okay with a future re-grade.

### Table: `ListingFlags`
- PK: `listing_id` (String)
- No SK

### Table: `CreditsLedger`
- PK: `buyer_id` (String)
- SK: `event_id` (String) formatted as `{timestamp_iso}#{item_id}#{action}`
- Include `timestamp`, `item_id`, `action`, `credits`, and `co2_saved_kg` as attributes. The composite SK avoids collisions when multiple credit events happen in the same second.

### create_tables.py exact contract

Implement `backend/seed/create_tables.py` with this table spec. It should skip tables that already exist and wait until every table is `ACTIVE`.

```python
TABLE_SPECS = [
    {
        "TableName": "Items",
        "KeySchema": [{"AttributeName": "item_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [
            {"AttributeName": "item_id", "AttributeType": "S"},
            {"AttributeName": "status", "AttributeType": "S"},
            {"AttributeName": "category", "AttributeType": "S"},
            {"AttributeName": "listing_id", "AttributeType": "S"}
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "StatusCategoryIndex",
                "KeySchema": [
                    {"AttributeName": "status", "KeyType": "HASH"},
                    {"AttributeName": "category", "KeyType": "RANGE"}
                ]
            },
            {
                "IndexName": "ListingStatusIndex",
                "KeySchema": [
                    {"AttributeName": "listing_id", "KeyType": "HASH"},
                    {"AttributeName": "status", "KeyType": "RANGE"}
                ]
            }
        ]
    },
    {
        "TableName": "Buyers",
        "KeySchema": [{"AttributeName": "buyer_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [
            {"AttributeName": "buyer_id", "AttributeType": "S"},
            {"AttributeName": "region", "AttributeType": "S"},
            {"AttributeName": "primary_category", "AttributeType": "S"}
        ],
        "GlobalSecondaryIndexes": [
            {
                "IndexName": "RegionCategoryIndex",
                "KeySchema": [
                    {"AttributeName": "region", "KeyType": "HASH"},
                    {"AttributeName": "primary_category", "KeyType": "RANGE"}
                ]
            }
        ]
    },
    {
        "TableName": "BuyerInterestIndex",
        "KeySchema": [
            {"AttributeName": "category", "KeyType": "HASH"},
            {"AttributeName": "region_buyer_id", "KeyType": "RANGE"}
        ],
        "AttributeDefinitions": [
            {"AttributeName": "category", "AttributeType": "S"},
            {"AttributeName": "region_buyer_id", "AttributeType": "S"}
        ]
    },
    {
        "TableName": "GradeCache",
        "KeySchema": [{"AttributeName": "cache_key", "KeyType": "HASH"}],
        "AttributeDefinitions": [{"AttributeName": "cache_key", "AttributeType": "S"}]
    },
    {
        "TableName": "ListingFlags",
        "KeySchema": [{"AttributeName": "listing_id", "KeyType": "HASH"}],
        "AttributeDefinitions": [{"AttributeName": "listing_id", "AttributeType": "S"}]
    },
    {
        "TableName": "CreditsLedger",
        "KeySchema": [
            {"AttributeName": "buyer_id", "KeyType": "HASH"},
            {"AttributeName": "event_id", "KeyType": "RANGE"}
        ],
        "AttributeDefinitions": [
            {"AttributeName": "buyer_id", "AttributeType": "S"},
            {"AttributeName": "event_id", "AttributeType": "S"}
        ]
    }
]
```

When creating each table, use:

```python
ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
BillingMode="PROVISIONED"
```

When creating each GSI, use:

```python
Projection={"ProjectionType": "ALL"}
ProvisionedThroughput={"ReadCapacityUnits": 1, "WriteCapacityUnits": 1}
```

Do not use DynamoDB scans in production paths. Scans are allowed only in `GET /buyers` for ops/debug and in seed validation.

### How the tables connect

```text
Items.item_id
  -> S3 photos in S3_PHOTOS_BUCKET at photos/{item_id}/...
  -> S3 passport in S3_PASSPORTS_BUCKET at passports/{item_id}.html
  -> matches[] contains top buyer_ids from Buyers
  -> listing_id points to ListingFlags for PDP prevention

Buyers.buyer_id
  -> duplicated into BuyerInterestIndex once per category_interests[] entry
  -> used by matching and recommendation endpoints
  -> CreditsLedger partition key when buyer earns/redeems green credits

BuyerInterestIndex.category
  -> Stage-1 matching query for item-centric matching
  -> returns buyer_id values to BatchGet from Buyers

GradeCache.cache_key
  -> stores raw/final LLM outputs for grading, matching, passport
  -> guarantees same demo input returns same result

ListingFlags.listing_id
  -> read by original PDP page to show return-prevention warning

CreditsLedger.buyer_id
  -> audit trail of credits and trade-in credit events
```

### S3 object layout

Use two private buckets:

```text
S3_PHOTOS_BUCKET/
  photos/{item_id}/front.jpg
  photos/{item_id}/side.jpg
  photos/{item_id}/back.jpg

S3_PASSPORTS_BUCKET/
  passports/{item_id}.html
```

The backend returns presigned URLs to the frontend:
- Photo URLs expire in 15 minutes.
- Passport HTML URL expires in 15 minutes.
- Never make buckets public for the demo.

---

## Phase 2 — Reference JSON Files

Place these files in `backend/seed/reference/`.

### size_standard_map.json
```json
{
  "shoes": {
    "US 6": "India 5", "US 7": "India 6", "US 8": "India 7",
    "US 9": "India 8", "US 10": "India 9", "US 11": "India 10",
    "EU 38": "India 5", "EU 39": "India 6", "EU 40": "India 7",
    "EU 41": "India 8", "EU 42": "India 9", "EU 43": "India 10",
    "EU 44": "India 9", "UK 6": "India 7", "UK 7": "India 8",
    "UK 8": "India 9", "UK 9": "India 10"
  },
  "shirt": { "XS": "XS", "S": "S", "M": "M", "L": "L", "XL": "XL", "XXL": "XXL" },
  "kurta": { "XS": "XS", "S": "S", "M": "M", "L": "L", "XL": "XL", "XXL": "XXL" },
  "saree": { "one-size": "one-size" },
  "jeans": { "28x30": "28", "30x30": "30", "32x30": "32", "34x32": "34", "36x32": "36" },
  "bag": { "30L": "30L" },
  "sunglasses": { "one-size": "one-size" },
  "headphones": { "one-size": "one-size" },
  "phone": { "one-size": "one-size" },
  "appliance": { "one-size": "one-size" },
  "kettle": { "1.5L": "1.5L" },
  "food": { "200g": "200g", "500g": "500g" }
}
```

### carbon_table.json
```json
{
  "shoes":     { "manufacturing_kg_co2": 14.0, "weight_kg": 0.8 },
  "shirt":     { "manufacturing_kg_co2": 7.0,  "weight_kg": 0.3 },
  "jeans":     { "manufacturing_kg_co2": 20.0, "weight_kg": 0.7 },
  "kurta":     { "manufacturing_kg_co2": 6.0,  "weight_kg": 0.4 },
  "saree":     { "manufacturing_kg_co2": 8.0,  "weight_kg": 0.6 },
  "phone":     { "manufacturing_kg_co2": 70.0, "weight_kg": 0.2 },
  "laptop":    { "manufacturing_kg_co2": 300.0,"weight_kg": 2.0 },
  "appliance": { "manufacturing_kg_co2": 150.0,"weight_kg": 5.0 },
  "bag":       { "manufacturing_kg_co2": 10.0, "weight_kg": 0.5 },
  "sunglasses":{ "manufacturing_kg_co2": 5.0,  "weight_kg": 0.1 },
  "food":      { "manufacturing_kg_co2": 2.0,  "weight_kg": 0.5 },
  "headphones":{ "manufacturing_kg_co2": 25.0, "weight_kg": 0.3 },
  "kettle":    { "manufacturing_kg_co2": 20.0, "weight_kg": 1.2 }
}
```

### demand_table.json
```json
{
  "Mumbai":    { "shoes": 0.9, "shirt": 0.8, "jeans": 0.8, "phone": 0.9, "appliance": 0.7, "bag": 0.8, "sunglasses": 0.8, "headphones": 0.8, "food": 0.6, "kettle": 0.6, "kurta": 0.6, "saree": 0.7 },
  "Delhi":     { "shoes": 0.8, "shirt": 0.7, "jeans": 0.7, "phone": 0.9, "appliance": 0.8, "bag": 0.7, "sunglasses": 0.7, "headphones": 0.8, "food": 0.7, "kettle": 0.7, "kurta": 0.8, "saree": 0.6 },
  "Bangalore": { "shoes": 0.7, "shirt": 0.6, "jeans": 0.7, "phone": 0.95, "laptop": 0.9, "appliance": 0.8, "bag": 0.7, "sunglasses": 0.6, "headphones": 0.9, "food": 0.7, "kettle": 0.8, "kurta": 0.5, "saree": 0.5 },
  "Surat":     { "shoes": 0.8, "shirt": 0.7, "jeans": 0.7, "phone": 0.7, "appliance": 0.6, "bag": 0.7, "sunglasses": 0.7, "headphones": 0.6, "food": 0.6, "kettle": 0.5, "kurta": 0.8, "saree": 0.9 },
  "Ahmedabad": { "shoes": 0.7, "shirt": 0.7, "jeans": 0.7, "phone": 0.7, "appliance": 0.6, "bag": 0.6, "sunglasses": 0.7, "headphones": 0.6, "food": 0.6, "kettle": 0.5, "kurta": 0.9, "saree": 0.8 },
  "Chennai":   { "shoes": 0.7, "shirt": 0.6, "jeans": 0.6, "phone": 0.8, "appliance": 0.7, "bag": 0.6, "sunglasses": 0.7, "headphones": 0.7, "food": 0.8, "kettle": 0.6, "kurta": 0.6, "saree": 0.9 },
  "Pune":      { "shoes": 0.8, "shirt": 0.7, "jeans": 0.7, "phone": 0.8, "laptop": 0.7, "appliance": 0.7, "bag": 0.7, "sunglasses": 0.7, "headphones": 0.7, "food": 0.6, "kettle": 0.6, "kurta": 0.6, "saree": 0.6 },
  "Hyderabad": { "shoes": 0.7, "shirt": 0.7, "jeans": 0.7, "phone": 0.85, "appliance": 0.7, "bag": 0.6, "sunglasses": 0.7, "headphones": 0.7, "food": 0.8, "kettle": 0.6, "kurta": 0.6, "saree": 0.7 },
  "Kolkata":   { "shoes": 0.7, "shirt": 0.7, "jeans": 0.7, "phone": 0.8, "appliance": 0.7, "bag": 0.7, "sunglasses": 0.7, "headphones": 0.7, "food": 0.8, "kettle": 0.6, "kurta": 0.7, "saree": 0.8 },
  "Jaipur":    { "shoes": 0.7, "shirt": 0.7, "jeans": 0.6, "phone": 0.7, "appliance": 0.6, "bag": 0.6, "sunglasses": 0.8, "headphones": 0.6, "food": 0.8, "kettle": 0.5, "kurta": 0.8, "saree": 0.8 }
}
```

### city_coords.json
```json
{
  "Mumbai":    [19.07, 72.87],
  "Delhi":     [28.61, 77.20],
  "Bangalore": [12.97, 77.59],
  "Surat":     [21.17, 72.83],
  "Ahmedabad": [23.02, 72.57],
  "Chennai":   [13.08, 80.27],
  "Pune":      [18.52, 73.86],
  "Hyderabad": [17.38, 78.48],
  "Kolkata":   [22.57, 88.36],
  "Jaipur":    [26.91, 75.79]
}
```

---

## Phase 3 — Seed Data

### buyers.json — 10 hero records (include these exactly)

```json
[
  {
    "buyer_id": "BUY-001", "name": "Riya Shah",
    "region": "Surat", "primary_category": "shoes",
    "lat": 21.17, "lng": 72.83,
    "category_interests": ["shoes", "bag"],
    "size_profile": { "shoes": "India 9", "fit_tendency": "snug", "shirt": "M" },
    "preferences": ["Nike", "Adidas", "sizes up", "snug fit"],
    "purchase_history": [
      { "category": "shoes", "brand": "Nike", "kept": true },
      { "category": "shoes", "brand": "Puma", "kept": true }
    ],
    "return_history": [],
    "return_rate": 0.04,
    "credit_score": 120,
    "recent_reviews": ["I always size up in Nike, fits perfectly that way", "Snug shoes feel best"],
    "eco_preference": true
  },
  {
    "buyer_id": "BUY-002", "name": "Karan Mehta",
    "region": "Delhi", "primary_category": "shoes",
    "lat": 28.61, "lng": 77.20,
    "category_interests": ["shoes", "shirt"],
    "size_profile": { "shoes": "India 9", "fit_tendency": "loose", "shirt": "L" },
    "preferences": ["loose fit", "wide toe box"],
    "purchase_history": [
      { "category": "shoes", "brand": "Nike", "kept": false }
    ],
    "return_history": [
      { "item": "Nike shoes", "reason": "fit_too_tight" },
      { "item": "Adidas shoes", "reason": "fit_too_tight" }
    ],
    "return_rate": 0.35,
    "credit_score": 10,
    "recent_reviews": ["Always feel tight, prefer roomier shoes"],
    "eco_preference": false
  },
  {
    "buyer_id": "BUY-003", "name": "Priya Nair",
    "region": "Chennai", "primary_category": "food",
    "lat": 13.08, "lng": 80.27,
    "category_interests": ["food", "appliance"],
    "size_profile": {},
    "preferences": ["spicy food", "extra hot", "Rajasthani cuisine"],
    "purchase_history": [
      { "category": "food", "brand": "Rajasthani Spices", "kept": true }
    ],
    "return_history": [],
    "return_rate": 0.02,
    "credit_score": 200,
    "recent_reviews": ["I love the hottest options, the spicier the better", "Ordered double the quantity"],
    "eco_preference": true
  },
  {
    "buyer_id": "BUY-004", "name": "Rahul Sharma",
    "region": "Bangalore", "primary_category": "headphones",
    "lat": 12.97, "lng": 77.59,
    "category_interests": ["headphones", "phone", "appliance"],
    "size_profile": {},
    "preferences": ["loud audio", "bass heavy", "DJ use"],
    "purchase_history": [
      { "category": "headphones", "brand": "JBL", "kept": true }
    ],
    "return_history": [],
    "return_rate": 0.05,
    "credit_score": 80,
    "recent_reviews": ["The louder the better, use them for DJ sets", "Max volume is my baseline"],
    "eco_preference": false
  },
  {
    "buyer_id": "BUY-005", "name": "Neha Gupta",
    "region": "Mumbai", "primary_category": "shirt",
    "lat": 19.07, "lng": 72.87,
    "category_interests": ["shirt", "kurta", "saree"],
    "size_profile": { "shirt": "M", "condition_tolerance": "pristine_only" },
    "preferences": ["pristine condition", "new-like", "zero defects"],
    "purchase_history": [],
    "return_history": [
      { "item": "shirt", "reason": "minor_defect" },
      { "item": "kurta", "reason": "minor_defect" }
    ],
    "return_rate": 0.40,
    "credit_score": 5,
    "recent_reviews": ["Returned because of a tiny thread pull — unacceptable for this price"],
    "eco_preference": false
  },
  {
    "buyer_id": "BUY-006", "name": "Dev Kumar",
    "region": "Delhi", "primary_category": "shoes",
    "lat": 28.61, "lng": 77.20,
    "category_interests": ["shoes", "bag", "shirt"],
    "size_profile": { "shoes": "India 9", "fit_tendency": "standard" },
    "preferences": ["Nike", "Adidas", "standard fit"],
    "purchase_history": [
      { "category": "shirt", "brand": "H&M", "kept": true }
    ],
    "return_history": [],
    "return_rate": 0.08,
    "credit_score": 60,
    "recent_reviews": ["Fits true to size usually"],
    "eco_preference": false
  },
  {
    "buyer_id": "BUY-007", "name": "Anu Patel",
    "region": "Surat", "primary_category": "shoes",
    "lat": 21.17, "lng": 72.83,
    "category_interests": ["shoes", "saree", "kurta"],
    "size_profile": { "shoes": "India 8", "shirt": "S" },
    "preferences": ["refurbished", "value for money", "eco-friendly"],
    "purchase_history": [
      { "category": "shoes", "brand": "Bata", "kept": true }
    ],
    "return_history": [],
    "return_rate": 0.02,
    "credit_score": 350,
    "recent_reviews": ["Love buying second-life products, great value"],
    "eco_preference": true
  },
  {
    "buyer_id": "BUY-008", "name": "Jay Desai",
    "region": "Ahmedabad", "primary_category": "shirt",
    "lat": 23.02, "lng": 72.57,
    "category_interests": ["shirt", "kurta", "shoes"],
    "size_profile": { "shirt": "L", "shoes": "India 9" },
    "preferences": ["budget-conscious", "deals", "near hub"],
    "purchase_history": [],
    "return_history": [],
    "return_rate": 0.06,
    "credit_score": 45,
    "recent_reviews": ["Great deal, happy with the purchase"],
    "eco_preference": true
  },
  {
    "buyer_id": "BUY-009", "name": "Meera Iyer",
    "region": "Bangalore", "primary_category": "shoes",
    "lat": 12.97, "lng": 77.59,
    "category_interests": ["shoes", "bag"],
    "size_profile": { "shoes": "India 8", "fit_tendency": "standard" },
    "preferences": ["Nike", "Puma"],
    "purchase_history": [
      { "category": "shoes", "brand": "Nike", "kept": true }
    ],
    "return_history": [],
    "return_rate": 0.07,
    "credit_score": 90,
    "recent_reviews": ["Nike India 8 fits me perfectly"],
    "eco_preference": false
  },
  {
    "buyer_id": "BUY-010", "name": "Tara Krishnan",
    "region": "Bangalore", "primary_category": "shoes",
    "lat": 12.97, "lng": 77.59,
    "category_interests": ["shoes", "shirt", "phone"],
    "size_profile": { "shoes": "India 9", "shirt": "M" },
    "preferences": ["eco-conscious", "certified refurb", "green shopping"],
    "purchase_history": [
      { "category": "phone", "brand": "OnePlus", "kept": true }
    ],
    "return_history": [],
    "return_rate": 0.03,
    "credit_score": 480,
    "recent_reviews": ["Always choose refurb when available, saves the planet"],
    "eco_preference": true
  }
]
```

> Add 20 more buyers by prompting Claude offline, then commit them to `buyers.json`. Do not generate buyers at runtime. Prompt: "Generate 20 diverse Indian e-commerce buyer profiles in this exact JSON format with realistic Indian names, cities, categories, size profiles, preferences, return histories, and eco preferences. Use only cities present in `city_coords.json` and categories present in `carbon_table.json`."

**Seed robustness rules:**
- Demo can run with the 10 hero buyers above, but the full filmed seed should contain 30 committed buyer records so the recommendation feed feels real.
- Every `buyer_id` must be unique.
- Every `region` must exist in both `city_coords.json` and `demand_table.json`.
- Every `primary_category` and every `category_interests[]` entry must exist in `carbon_table.json`.
- For each buyer/category interest, seed one row into `BuyerInterestIndex`.
- `return_rate` must be between `0` and `1`; `credit_score` must be a non-negative integer.

### items.json — 15 hero records

**Required item fields:** `item_id`, `listing_id`, `category`, `brand`, `name`, `listed_size`, `listed_color`, `original_price_inr`, `return_reason_code`, `return_reason_text`, `return_hub_city`, `owner_count`, `history_note`, `photo_keys`, `status`. Optional but recommended: `seller_claimed_condition` with default `"returned_open_box"`.

**Item validation rules:**
- Every `item_id` and `listing_id` must be unique.
- Every `category` must exist in `carbon_table.json`, `demand_table.json`, and `size_standard_map.json`.
- Every `return_hub_city` must exist in `city_coords.json`.
- Every path in `photo_keys` must exist under `seed/photos/` before upload.
- Food items must have `"sealed"` or `"unopened"` in `history_note`, otherwise the grading guardrail will route them to `REVIEW`.
- Electronics/appliances with a defect return reason should route to `refurbish`, `recycle`, or `manual_review`, not straight resale.

```json
[
  {
    "item_id": "ITM-001",
    "listing_id": "LST-NIKE-AIR-270-BLK-10",
    "category": "shoes", "brand": "Nike",
    "name": "Nike Air Max 270",
    "listed_size": "US 10", "listed_color": "black",
    "original_price_inr": 9999,
    "return_reason_code": "fit_too_tight",
    "return_reason_text": "Felt too tight, especially on the sides near the toe",
    "return_hub_city": "Bangalore",
    "owner_count": 1,
    "history_note": "1 owner, returned for fit only — no damage or defects reported",
    "photo_keys": ["photos/ITM-001/front.jpg", "photos/ITM-001/side.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-002",
    "listing_id": "LST-HM-SHIRT-RED-M",
    "category": "shirt", "brand": "H&M",
    "name": "H&M Cotton Shirt",
    "listed_size": "M", "listed_color": "red",
    "original_price_inr": 1499,
    "return_reason_code": "color_mismatch",
    "return_reason_text": "Color looks maroon/burgundy in real life, photos showed bright red",
    "return_hub_city": "Mumbai",
    "owner_count": 1,
    "history_note": "1 owner, returned because of color discrepancy only",
    "photo_keys": ["photos/ITM-002/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-003",
    "listing_id": "LST-BOAT-BT500",
    "category": "headphones", "brand": "boAt",
    "name": "boAt Rockerz 500 Bluetooth",
    "listed_size": "one-size", "listed_color": "black",
    "original_price_inr": 2499,
    "return_reason_code": "too_loud",
    "return_reason_text": "Even at 30% volume this is uncomfortably loud for me",
    "return_hub_city": "Bangalore",
    "owner_count": 1,
    "history_note": "1 owner, returned due to volume preference — fully functional",
    "photo_keys": ["photos/ITM-003/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-004",
    "listing_id": "LST-RAJSPI-500G",
    "category": "food", "brand": "Rajdhani Spices",
    "name": "Rajasthani Laal Mirch Pickle 500g",
    "listed_size": "500g", "listed_color": "orange",
    "original_price_inr": 299,
    "return_reason_code": "too_spicy",
    "return_reason_text": "Way too spicy for my family, we can't handle it",
    "return_hub_city": "Bangalore",
    "owner_count": 1,
    "history_note": "Unopened. Returned due to spice preference only.",
    "photo_keys": ["photos/ITM-004/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-005",
    "listing_id": "LST-ONEPLUS-11R",
    "category": "phone", "brand": "OnePlus",
    "name": "OnePlus 11R 5G",
    "listed_size": "one-size", "listed_color": "sonic black",
    "original_price_inr": 39999,
    "return_reason_code": "changed_mind",
    "return_reason_text": "Switched to a different brand",
    "return_hub_city": "Delhi",
    "owner_count": 1,
    "history_note": "1 owner, 2 weeks used, no damage. Changed mind only.",
    "photo_keys": ["photos/ITM-005/front.jpg", "photos/ITM-005/back.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-006",
    "listing_id": "LST-ADI-ULTRA-9",
    "category": "shoes", "brand": "Adidas",
    "name": "Adidas Ultraboost 22",
    "listed_size": "UK 8", "listed_color": "white",
    "original_price_inr": 12999,
    "return_reason_code": "fit_too_loose",
    "return_reason_text": "Felt roomy and loose, heel slips",
    "return_hub_city": "Mumbai",
    "owner_count": 1,
    "history_note": "1 owner, returned for fit. Light use, minor sole wear.",
    "photo_keys": ["photos/ITM-006/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-007",
    "listing_id": "LST-FAB-KURTA-BLU-L",
    "category": "kurta", "brand": "FabIndia",
    "name": "FabIndia Cotton Kurta Blue",
    "listed_size": "L", "listed_color": "blue",
    "original_price_inr": 1799,
    "return_reason_code": "defective",
    "return_reason_text": "Button clasp is loose, came off after first wash",
    "return_hub_city": "Delhi",
    "owner_count": 1,
    "history_note": "1 owner. Clasp defect — needs minor repair (refurbish route).",
    "photo_keys": ["photos/ITM-007/front.jpg", "photos/ITM-007/clasp.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-008",
    "listing_id": "LST-SONY-WH1000XM4",
    "category": "headphones", "brand": "Sony",
    "name": "Sony WH-1000XM4 Headphones",
    "listed_size": "one-size", "listed_color": "black",
    "original_price_inr": 19999,
    "return_reason_code": "defective",
    "return_reason_text": "Left driver has crackling noise at higher volumes",
    "return_hub_city": "Bangalore",
    "owner_count": 2,
    "history_note": "2 owners. Left driver defective. Recycle route.",
    "photo_keys": ["photos/ITM-008/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-009",
    "listing_id": "LST-LEVI-512-32",
    "category": "jeans", "brand": "Levi's",
    "name": "Levi's 512 Slim Taper Jeans",
    "listed_size": "32x30", "listed_color": "dark blue",
    "original_price_inr": 3999,
    "return_reason_code": "changed_mind",
    "return_reason_text": "Found a better style, never worn",
    "return_hub_city": "Mumbai",
    "owner_count": 1,
    "history_note": "Never worn, tags intact. Changed mind only.",
    "photo_keys": ["photos/ITM-009/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-010",
    "listing_id": "LST-BIBA-SAREE-PINK",
    "category": "saree", "brand": "BIBA",
    "name": "BIBA Printed Saree",
    "listed_size": "one-size", "listed_color": "pink",
    "original_price_inr": 2499,
    "return_reason_code": "color_mismatch",
    "return_reason_text": "Much more faded/pastel than shown in listing images",
    "return_hub_city": "Surat",
    "owner_count": 1,
    "history_note": "1 owner, returned for color discrepancy only. No wear.",
    "photo_keys": ["photos/ITM-010/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-011",
    "listing_id": "LST-WC-LAPTOP-BAG",
    "category": "bag", "brand": "WildCraft",
    "name": "WildCraft 30L Laptop Bag",
    "listed_size": "30L", "listed_color": "grey",
    "original_price_inr": 1899,
    "return_reason_code": "fit_too_tight",
    "return_reason_text": "Laptop compartment too narrow for my 16-inch MacBook",
    "return_hub_city": "Bangalore",
    "owner_count": 1,
    "history_note": "1 owner. Bag itself fine. Laptop slot too narrow for 16-inch.",
    "photo_keys": ["photos/ITM-011/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-012",
    "listing_id": "LST-BATA-KIDS-2",
    "category": "shoes", "brand": "Bata",
    "name": "Bata Kids School Shoes",
    "listed_size": "India 2 (kids)", "listed_color": "black",
    "original_price_inr": 799,
    "return_reason_code": "other",
    "return_reason_text": "Child outgrew them quickly, only worn twice",
    "return_hub_city": "Chennai",
    "owner_count": 1,
    "history_note": "1 child owner, worn twice. Outgrown — Grade A condition.",
    "photo_keys": ["photos/ITM-012/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-013",
    "listing_id": "LST-AASHIRVAAD-ATTA-SPICE",
    "category": "food", "brand": "MTR",
    "name": "MTR Chilli Powder 200g",
    "listed_size": "200g", "listed_color": "red",
    "original_price_inr": 89,
    "return_reason_code": "too_spicy",
    "return_reason_text": "Extremely spicy, family cannot eat it",
    "return_hub_city": "Hyderabad",
    "owner_count": 1,
    "history_note": "Sealed. Returned due to spice level only.",
    "photo_keys": ["photos/ITM-013/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-014",
    "listing_id": "LST-FASTRACK-SUNGLASS",
    "category": "sunglasses", "brand": "Fastrack",
    "name": "Fastrack Aviator Sunglasses",
    "listed_size": "one-size", "listed_color": "gold-black",
    "original_price_inr": 999,
    "return_reason_code": "changed_mind",
    "return_reason_text": "Style did not suit me",
    "return_hub_city": "Mumbai",
    "owner_count": 1,
    "history_note": "1 owner, tried on once. Changed mind.",
    "photo_keys": ["photos/ITM-014/front.jpg"],
    "status": "pending"
  },
  {
    "item_id": "ITM-015",
    "listing_id": "LST-PRESTIGE-KETTLE",
    "category": "kettle", "brand": "Prestige",
    "name": "Prestige PKOSS 1.5L Electric Kettle",
    "listed_size": "1.5L", "listed_color": "silver",
    "original_price_inr": 799,
    "return_reason_code": "defective",
    "return_reason_text": "Does not heat water fully, stops at 60 degrees",
    "return_hub_city": "Delhi",
    "owner_count": 1,
    "history_note": "Heating element partially defective. Refurbish route.",
    "photo_keys": ["photos/ITM-015/front.jpg"],
    "status": "pending"
  }
]
```

---

## Phase 4 — Agent Implementation

### db/dynamo.py — DynamoDB helper contract

Every module must use these helpers instead of raw table names.

```python
import os
from decimal import Decimal
import boto3

dynamodb = boto3.resource("dynamodb", region_name=os.environ["AWS_DEFAULT_REGION"])

def table_name(logical_name: str) -> str:
    return f"{os.environ.get('DDB_TABLE_PREFIX', 'SecondLife')}-{logical_name}"

def table(logical_name: str):
    return dynamodb.Table(table_name(logical_name))

def to_ddb(value):
    # Convert Python floats to Decimal before writing to DynamoDB.
    pass

def from_ddb(value):
    # Convert Decimal back to int/float for FastAPI JSON responses.
    pass

def get_item(logical_table: str, key: dict) -> dict | None:
    resp = table(logical_table).get_item(Key=to_ddb(key))
    return from_ddb(resp.get("Item"))

def put_item(logical_table: str, item: dict) -> None:
    table(logical_table).put_item(Item=to_ddb(item))

def update_item(logical_table: str, key: dict, updates: dict) -> dict:
    # Build SET expression from updates and return updated item.
    pass

def query_index(logical_table: str, index_name: str, key_expr, expr_values: dict) -> list[dict]:
    # Used for StatusCategoryIndex, ListingStatusIndex, RegionCategoryIndex.
    pass

def batch_get(logical_table: str, keys: list[dict]) -> list[dict]:
    # Used after BuyerInterestIndex lookup to hydrate Buyers.
    pass
```

### db/s3.py — S3 helper contract

```python
import os
import boto3

s3 = boto3.client("s3", region_name=os.environ["AWS_DEFAULT_REGION"])

def upload_photo(item_id: str, local_path: str, filename: str) -> str:
    key = f"photos/{item_id}/{filename}"
    s3.upload_file(local_path, os.environ["S3_PHOTOS_BUCKET"], key, ExtraArgs={"ServerSideEncryption": "AES256"})
    return key

def upload_passport_html(item_id: str, html: str) -> str:
    key = f"passports/{item_id}.html"
    s3.put_object(
        Bucket=os.environ["S3_PASSPORTS_BUCKET"],
        Key=key,
        Body=html.encode("utf-8"),
        ContentType="text/html; charset=utf-8",
        ServerSideEncryption="AES256"
    )
    return key

def presign_photo(key: str, expires: int = 900) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["S3_PHOTOS_BUCKET"], "Key": key},
        ExpiresIn=expires
    )

def presign_passport(key: str, expires: int = 900) -> str:
    return s3.generate_presigned_url(
        "get_object",
        Params={"Bucket": os.environ["S3_PASSPORTS_BUCKET"], "Key": key},
        ExpiresIn=expires
    )
```

### cache.py — content-hash cache used by ALL three LLM agents

```python
import hashlib, json
from db.dynamo import get_item, put_item

CACHE_TABLE = "GradeCache"

def make_cache_key(agent_name: str, primary_input: bytes, secondary_str: str,
                   prompt_version: str, model_id: str) -> str:
    raw = agent_name.encode() + b"||" + primary_input + b"||" + \
          secondary_str.encode() + b"||" + prompt_version.encode() + b"||" + model_id.encode()
    return hashlib.sha256(raw).hexdigest()

def cache_get(key: str):
    row = get_item(CACHE_TABLE, {"cache_key": key})
    if row:
        return json.loads(row["result_json"])
    return None

def cache_put(key: str, agent: str, result: dict):
    put_item(CACHE_TABLE, {
        "cache_key": key,
        "agent": agent,
        "result_json": json.dumps(result)
    })
```

---

### Agent ① — grading.py

**Bedrock model:** `os.environ["BEDROCK_VISION_MODEL_ID"]`
**temperature:** 0
**Cache:** yes — key = `make_cache_key("grading", canonical_image_bytes_concat, canonical_item_json, "v2-condition-rubric", MODEL_ID)`

**Important design decision:** the LLM assigns the product-specific condition grade. Code must not hardcode arbitrary category thresholds like `wear <= 4 => B`, because the product can be shoes, food, headphones, sarees, phones, appliances, or something we did not seed. Code only makes the LLM as deterministic as possible: canonical input, fixed rubric, strict schema, enum outputs, objective guardrails, and content-hash caching.

**Before calling Bedrock, canonicalize the input:**
```python
def canonicalize_grade_input(item: dict, photo_bytes_by_name: dict[str, bytes]) -> tuple[bytes, str]:
    """
    Determinism starts before the model call.
    - Sort photos by stable filename/S3 key.
    - Apply EXIF orientation.
    - Convert to RGB JPEG.
    - Resize max edge to 1600px.
    - Save with fixed JPEG quality.
    - Serialize item metadata with sorted JSON keys.
    """
    pass
```

Include only stable item fields in `canonical_item_json`: `item_id`, `category`, `brand`, `name`, `listed_size`, `listed_color`, `return_reason_code`, `return_reason_text`, `history_note`, and `seller_claimed_condition` (default `"returned_open_box"` if absent). Do not include timestamps, random IDs, request IDs, or user session data.

**System prompt (exact text to use):**
```
You are a product-condition grader for Amazon Second Life Commerce.
You receive one or more photos of a returned item plus what the seller's listing claimed.
Your job is to assign the condition grade using product-specific judgment from the evidence.

Use this universal resale rubric:
A = New-like/open-box. Fully usable, no meaningful wear, no safety/hygiene issue, no critical missing part.
B = Fully usable with light cosmetic wear or minor non-critical issues. No repair needed before resale.
C = Usable but visibly worn, needs cleaning/minor repair, or has a non-critical missing accessory. Still safe and honest to resell/refurbish.
D = Not currently resellable: non-functional, unsafe, expired/contaminated/open hygiene-sensitive item, major damage, counterfeit concern, or critical missing component.
REVIEW = Evidence is insufficient or ambiguous, especially for high-value, safety-sensitive, food, beauty, or electronic items.

Rules:
- Grade the actual item shown, not the ideal catalog product.
- Do not invent damage that is not visible or stated.
- If photos cannot prove a safety/function claim that is necessary for resale, use REVIEW.
- Use only the enum values in the schema. Do not output decimals or free-form scores.
- Respond ONLY with valid JSON matching the exact schema. Do not add fields.
```

**User message to send (build this in code):**
```
Listed attributes:
Item name: {name}
Category: {category}
Brand: {brand}
Listed size: {listed_size}
Listed color: {listed_color}
Seller claimed condition: {seller_claimed_condition or "returned_open_box"}
Return reason code: {return_reason_code}
Return reason text: {return_reason_text}
History note: {history_note}

Inspect the photos and return exactly:
{
  "grade": "A|B|C|D|REVIEW",
  "grade_bucket": "new_like|light_wear|visible_wear|not_resellable|insufficient_evidence",
  "confidence_bucket": "high|medium|low",
  "detected_category": "<string>",
  "functional_status": "works|not_working|not_applicable|unknown",
  "safety_or_hygiene_blocker": <true|false>,
  "critical_missing_parts": ["<string>"],
  "wear_level": "none|minor|moderate|heavy|unknown",
  "defects": [{"type": "<brief name>", "severity": "minor|moderate|major", "evidence": "<visible/text evidence>"}],
  "detected_color": "<string>",
  "detected_size": "<string or 'unknown'>",
  "size_mismatch": <true|false>,
  "color_mismatch": <true|false>,
  "mismatch_notes": "<empty string if no mismatch>",
  "evidence": ["<short objective observation>", "<short objective observation>"]
}
```

**After Bedrock returns, validate and finalize without arbitrary grading thresholds:**
```python
VALID_GRADES = {"A", "B", "C", "D", "REVIEW"}
FUNCTION_SENSITIVE = {"phone", "laptop", "appliance", "headphones", "kettle"}
HYGIENE_SENSITIVE = {"food", "beauty", "personal_care"}

def finalize_grade(item: dict, obs: dict) -> str:
    """
    The LLM owns A/B/C product judgment.
    Code only applies objective blockers and evidence-quality gates.
    """
    grade = obs["grade"]
    if grade not in VALID_GRADES:
        return "REVIEW"

    if obs["confidence_bucket"] == "low":
        return "REVIEW"

    if obs["safety_or_hygiene_blocker"]:
        return "D"

    if obs["functional_status"] == "not_working":
        return "D"

    if item["category"] in FUNCTION_SENSITIVE and obs["functional_status"] == "unknown":
        return "REVIEW"

    if item["category"] in HYGIENE_SENSITIVE and obs["grade"] in {"A", "B", "C"}:
        # Food/beauty must be clearly sealed and safe. If the model cannot prove that,
        # do not let it quietly pass into resale.
        sealed_or_safe = any("sealed" in e.lower() or "unopened" in e.lower() for e in obs["evidence"])
        if not sealed_or_safe:
            return "REVIEW"

    return grade
```

**Full function signature:**
```python
def grade_item(item: dict, photo_paths: list[str]) -> dict:
    # 1. Load photos from S3
    # 2. Canonicalize images + stable item JSON
    # 3. Compute cache key from canonical inputs + rubric version + model id
    # 4. Return cached result if exists
    # 5. Call Bedrock Converse with image blocks + exact prompt above
    # 6. Parse JSON and validate schema/enums
    # 7. Retry once with a JSON-repair prompt if parsing fails
    # 8. Apply finalize_grade() objective blockers
    # 9. Normalize size mismatch using size_standard_map where applicable
    # 10. Cache result with prompt_version, rubric_version, model_id, and evidence
    # 11. Return full grading dict
    pass
```

**Return shape:**
```json
{
  "grade": "B",
  "raw_llm_grade": "B",
  "grade_bucket": "light_wear",
  "confidence_bucket": "high",
  "detected_category": "shoes",
  "functional_status": "not_applicable",
  "safety_or_hygiene_blocker": false,
  "critical_missing_parts": [],
  "wear_level": "minor",
  "defects": [{"type": "heel scuff", "severity": "minor", "evidence": "small scuff visible on heel edge"}],
  "detected_color": "black",
  "detected_size": "India 9",
  "size_mismatch": true,
  "color_mismatch": false,
  "mismatch_notes": "listed US10 normalized to India9, detected India9 — match. But listing says US10 which could confuse buyers.",
  "evidence": ["sole tread is intact", "minor heel scuff", "no tear or structural damage visible"],
  "rubric_version": "v2-condition-rubric",
  "prompt_version": "v2",
  "model_id": "<BEDROCK_VISION_MODEL_ID>",
  "grader_input_hash": "<sha256>"
}
```

**Determinism guarantees to explain to judges:**
- Same canonical photos + same item metadata + same prompt/rubric/model version => same cache key.
- Cached results are never re-generated during demo.
- LLM outputs discrete enums, not unstable 0-1 scores.
- Code does not invent product-specific thresholds. It only blocks unsafe/unknown cases and sends ambiguous items to `REVIEW`.
- Store `evidence`, `grader_input_hash`, `rubric_version`, and `model_id` for auditability.

---

### Agent ④ — disposition.py (pure code)

```python
GRADE_FACTOR = {"A": 0.70, "B": 0.55, "C": 0.35, "D": 0.05, "REVIEW": 0.0}
HIGH_VALUE = {"phone", "laptop", "appliance", "kettle"}

def compute_disposition(item: dict, grade: str, trade_in_requested: bool = False) -> dict:
    recovered = round(item["original_price_inr"] * GRADE_FACTOR[grade])

    if grade == "REVIEW":
        route = "manual_review"
        credit_inr = 0
    elif trade_in_requested:
        route = "exchange"
        credit_inr = round(recovered * 0.90)  # 90% as store credit
    elif grade in ("A", "B"):
        route = "resell"
        credit_inr = 0
    elif grade == "C":
        route = "refurbish" if item["category"] in HIGH_VALUE else "donate"
        credit_inr = 0
    else:
        route = "recycle"
        credit_inr = 0

    return {
        "disposition": route,
        "recovered_value_inr": recovered,
        "trade_in_credit_inr": credit_inr
    }
```

**Exchange route:** when `trade_in_requested=True`, issue `trade_in_credit_inr` as store credit. The buyer cannot redeem it for new products — they are nudged to use it on second-life listings (frontend enforces this at redemption). Write a `CreditsLedger` row with `action: "trade_in_credit"`.

---

### Agent ⑤ — pricing.py (pure code)

```python
import math, json

with open("seed/reference/city_coords.json") as f:
    CITY_COORDS = json.load(f)
with open("seed/reference/demand_table.json") as f:
    DEMAND_TABLE = json.load(f)

def haversine(lat1, lng1, lat2, lng2) -> float:
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * \
        math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return R * 2 * math.asin(math.sqrt(a))

def buyer_price(buyer: dict, base_price_inr: int, item: dict) -> int:
    hub = CITY_COORDS.get(item["return_hub_city"], [20.0, 78.0])
    dist = haversine(hub[0], hub[1], buyer["lat"], buyer["lng"])
    proximity_discount = min(0.25, max(0, 0.25 * (1 - dist / 1500)))
    demand = DEMAND_TABLE.get(buyer["region"], {}).get(item["category"], 0.3)
    demand_factor = 1 + 0.2 * demand
    return round(base_price_inr * (1 - proximity_discount) * demand_factor)
```

---

### Agent ② — matching.py

**Bedrock model:** `os.environ["BEDROCK_TEXT_MODEL_ID"]`
**temperature:** 0
**Cache:** yes — key = `make_cache_key("matching", return_reason.encode(), sorted_buyer_ids_str, "v1", MODEL_ID)`

**Stage 1 — Code filter (DynamoDB query):**
Query `BuyerInterestIndex` with `category = item["category"]`, then `BatchGetItem` the matching `buyer_id`s from `Buyers`. Prefer same-region buyers first by sorting `region_buyer_id` prefix and buyer distance; include other regions only if fewer than 50 candidates are found. Also filter: `size_profile.shoes` must be within 1 size of `detected_size` for footwear. Cap at 50 candidates.

Do not scan the full `Buyers` table except in tiny local tests. DynamoDB cannot query `category_interests[]` directly, which is why `BuyerInterestIndex` exists.

**Stage 2 — Haiku rerank:**

**System prompt (exact text):**
```
You score how well a returned item fits each candidate buyer.
The item was returned for a specific reason.
For each buyer, evaluate two things using ONLY these three values: "none", "partial", or "strong".

reason_neutralized: Does a buyer trait cancel the return reason?
  Examples: "runs small" → buyer who always sizes up = "strong"
            "too spicy" → buyer who loves spicy food = "strong"
            "too loud" → sound engineer/DJ = "strong"
            No matching trait = "none"

reason_recurrence: Does this buyer have a history of returning for this same reason?
  frequent returns for this reason = "strong", some = "partial", none = "none"

Add a one-line rationale per buyer.
Respond ONLY with JSON. No commentary outside JSON.
```

**User message structure:**
```
Item returned reason: {return_reason_text}
Return reason code: {return_reason_code}

Buyers to score:
{json.dumps([{
  "buyer_id": b["buyer_id"],
  "preferences": b["preferences"],
  "return_history": b["return_history"],
  "recent_reviews": b["recent_reviews"]
} for b in candidates], indent=2)}

Return:
{
  "rankings": [
    {"buyer_id": "...", "reason_neutralized": "none|partial|strong",
     "reason_recurrence": "none|partial|strong", "rationale": "..."}
  ]
}
```

**After Bedrock returns, compute risk in code:**
```python
BUCKET_MAP = {"none": 0.0, "partial": 0.5, "strong": 1.0}

WEIGHTS = {
    "R_base": 0.25, "R_size": 0.30, "R_cond": 0.15, "R_reasonrec": 0.15,
    "B_neutralize": 0.35, "B_affinity": 0.20
}

def sigmoid(x): return 1 / (1 + math.exp(-x))

def compute_risk(buyer, item, grading, llm_signal):
    R_base      = buyer["return_rate"]
    R_size      = size_incompatibility(buyer, grading)  # 0 if compatible, 0.8 if not
    R_cond      = condition_intolerance(buyer, grading["grade"])
    R_reasonrec = BUCKET_MAP[llm_signal["reason_recurrence"]]
    B_neutralize= BUCKET_MAP[llm_signal["reason_neutralized"]]
    B_affinity  = brand_affinity(buyer, item)

    risk_raw = (WEIGHTS["R_base"]      * R_base
              + WEIGHTS["R_size"]      * R_size
              + WEIGHTS["R_cond"]      * R_cond
              + WEIGHTS["R_reasonrec"] * R_reasonrec
              - WEIGHTS["B_neutralize"]* B_neutralize
              - WEIGHTS["B_affinity"]  * B_affinity)
    return round(sigmoid(6 * (risk_raw - 0.5)), 4)
```

**Helper — size_incompatibility:**
```python
def size_incompatibility(buyer, grading) -> float:
    if grading["detected_category"] != "shoes": return 0.0
    buyer_size = buyer["size_profile"].get("shoes")
    detected   = grading["detected_size"]
    if not buyer_size or detected == "unknown": return 0.3
    # normalize both to India sizing via size_standard_map
    # if same → 0.0, one off → 0.3, two+ off → 0.8
    return 0.0  # implement normalization
```

**Helper — condition_intolerance:**
```python
def condition_intolerance(buyer, grade) -> float:
    tol = buyer["size_profile"].get("condition_tolerance", "standard")
    if tol == "pristine_only":
        return {"A": 0.0, "B": 0.6, "C": 0.9, "D": 1.0}[grade]
    return {"A": 0.0, "B": 0.1, "C": 0.3, "D": 0.8}[grade]
```

**Tie-breaking (deterministic):**
```python
ranked = sorted(scored_buyers, key=lambda b: (b["re_return_risk"], b["buyer_id"]))
top_3 = ranked[:3]
```

**Green credit priority boost (Tier 1):**
```python
# Before final sort, add a tiny boost for high-credit-score buyers
# so eco-loyal buyers get priority access (never changes rank by more than 1 position)
for b in scored_buyers:
    eco_boost = min(0.05, b["credit_score"] / 10000)  # max 0.05 reduction
    b["re_return_risk"] = max(0, b["re_return_risk"] - eco_boost)
```

---

### Agent ⑥ — green_credits.py (pure code)

```python
def compute_credits(item: dict, grading: dict, nearest_buyer_dist_km: float) -> dict:
    carbon = CARBON_TABLE.get(item["category"], {"manufacturing_kg_co2": 10.0, "weight_kg": 0.5})
    co2_manufacturing = carbon["manufacturing_kg_co2"]
    avg_distance_km   = 1200
    shipping_saved    = max(0, avg_distance_km - nearest_buyer_dist_km)
    co2_shipping      = shipping_saved * carbon["weight_kg"] * 0.0001
    co2_saved_kg      = round(co2_manufacturing + co2_shipping, 1)
    credits           = round(co2_saved_kg * 10)
    return {"co2_saved_kg": co2_saved_kg, "credits": credits}
```

---

### Agent ③ — passport.py

**Bedrock model:** `os.environ["BEDROCK_TEXT_MODEL_ID"]`
**temperature:** 0
**Run once per item. Store result. Never regenerate.**
**Cache:** yes — key = `make_cache_key("passport", item_id.encode(), grade+str(sorted(defects))+history_note+str(co2_saved_kg), "v1", MODEL_ID)`

**System prompt (exact text):**
```
You write honest, reassuring condition reports for refurbished products.
Help hesitant buyers trust a returned item.
Use ONLY the facts provided — do not invent defects, history, or numbers.
A return for fit or preference is NOT a product defect — frame it fairly.
Respond ONLY with valid JSON matching the exact schema. No extra fields.
```

**User message:**
```
Item: {brand} {name}
Grade: {grade}
Defects found: {defects_list or "none"}
Owner count: {owner_count}
Return history: {history_note}
Return reason: {return_reason_text}
CO₂ saved vs buying new: {co2_saved_kg} kg

Return:
{
  "summary": "<Grade X · N previous owner(s) · one-line verdict>",
  "condition_statement": "<honest but fair 1-2 sentence description of physical condition>",
  "why_returned": "<neutral explanation of why it came back — not a defect if it was fit/preference>",
  "buyer_reassurance": "<one reassuring sentence mentioning the CO₂ saved>"
}
```

**After Bedrock returns, render to HTML:**
Build a simple HTML file using the passport JSON + photo URLs from S3. Upload to `S3_PASSPORTS_BUCKET/passports/{item_id}.html`. Save `passport_key` to the Item DynamoDB record.

---

### Agent ⑦ — prevention.py (pure code)

**Three mechanisms. All run here.**

**Mechanism 0 — Predictive prevention (run at listing creation, before any return):**
When a new item is listed (status set to `pending`), scan `ListingFlags` for the same `listing_id`. If a flag already exists with `return_count_for_reason >= 1`, pre-attach the warning to the new listing immediately. This means the PDP widget fires on the *first* sale of a new batch, not only after a return from that batch — making prevention predictive rather than purely reactive.

```python
def predict_listing_flag(item: dict):
    """
    Called at item creation time (before grading).
    If the same listing_id already has a flag from prior returns of this product,
    carry it forward so the PDP warning fires immediately on new inventory.
    """
    existing_flag = get_item("ListingFlags", {"listing_id": item["listing_id"]})
    if existing_flag and existing_flag.get("return_count_for_reason", 0) >= 1:
        # Listing already has a known issue — flag carries over with no increment
        # The grading agent will increment the count if this item also returns
        pass  # flag already live; PDP widget will display it from the existing record
```

Call `predict_listing_flag(item)` in `orchestrator.process_return()` immediately after `create_item_record()`, before grading starts.

**Mechanism 1 — Supply-side (Trust Passport auto-corrects listing):**
When an item is re-listed after grading, update its listing attributes with detected (real) values:
```python
def correct_listing(item: dict, grading: dict):
    # Update Item record: listed_size = detected_size, listed_color = detected_color
    # This means the item can never be re-listed with the old wrong attributes
    updates = {}
    if grading["size_mismatch"]:
        updates["listed_size"] = grading["detected_size"]
    if grading["color_mismatch"]:
        updates["listed_color"] = grading["detected_color"]
    if updates:
        update_item("Items", {"item_id": item["item_id"]}, updates)
```

**Mechanism 2 — Demand-side (PDP prevention widget):**
Write/update a `ListingFlags` record for the ORIGINAL product listing:
```python
def write_listing_flag(item: dict, grading: dict):
    if not (grading["size_mismatch"] or grading["color_mismatch"]):
        return
    flag_type = "size" if grading["size_mismatch"] else "color"
    rec = get_item("ListingFlags", {"listing_id": item["listing_id"]}) or {}
    count = rec.get("return_count_for_reason", 0) + 1
    if flag_type == "size":
        recommendation = f"Runs small — {count} buyers found this. Consider sizing up."
    else:
        recommendation = f"Color may differ from photos — {count} buyers noted this."
    put_item("ListingFlags", {
        "listing_id": item["listing_id"],
        "flag_type": flag_type,
        "evidence": grading["mismatch_notes"],
        "return_count_for_reason": count,
        "recommendation": recommendation,
        "last_item_id": item["item_id"]
    })
```

The `return_count_for_reason` is shown on the PDP widget: *"23 buyers found this runs small."*

---

### Community Listing (P2P) — new endpoint

Add `POST /community-list` to `main.py`. It accepts the same payload as `POST /returns` but with:
- `seller_keeps_item: true`
- `listing_price_inr: <user-set price>`

Pipeline is identical: grading → disposition → pricing (use seller price if publishable) → Trust Passport → prevention check. The only difference is the seller retains the item and ships directly when sold. Do not force unsafe or ambiguous P2P items into resale: `REVIEW` goes to manual review and `D` stays blocked. The grading + Trust Passport is what makes P2P trusted within Amazon's ecosystem.

No separate marketplace infra needed. The grading agent IS the trust layer.

---

## Phase 5 — Orchestrator

### orchestrator.py

```python
def process_return(payload: dict, photo_paths: list[str], trade_in: bool = False) -> dict:
    # 1. Create item in DynamoDB (status=pending)
    item = create_item_record(payload)

    # 1b. Predictive prevention — check if listing_id already has a known flag
    predict_listing_flag(item)

    # 2. Upload photos to S3
    s3_keys = upload_photos(item["item_id"], photo_paths)
    update_item_field(item, "photo_keys", s3_keys)

    # 3. Agent ① — Grading
    grading = grade_item(item, s3_keys)
    update_item_fields(item, grading)

    # 4. Agent ④ — Disposition
    disp = compute_disposition(item, grading["grade"], trade_in)
    update_item_fields(item, disp)

    if disp["disposition"] in ("resell", "refurbish", "exchange"):
        # 5. Agent ⑤ — Base price
        base_price = round(disp["recovered_value_inr"] * 0.90)
        update_item_field(item, "base_price_inr", base_price)

        # 6. Stage-1 candidate filter
        candidates = query_buyers_stage1(item)

        # 7. Agent ② — Matching (Bedrock rerank + risk formula)
        ranked = match_buyers(item, grading, candidates)
        update_item_field(item, "matches", ranked[:3])

        # 8. Agent ⑥ — Green Credits
        min_dist = min(b["distance_km"] for b in ranked) if ranked else 1200
        credits_data = compute_credits(item, grading, min_dist)
        update_item_fields(item, credits_data)
        if item.get("seller_id"):
            append_credits_ledger(item["seller_id"], credits_data, item["item_id"])

        # 9. Agent ③ — Trust Passport
        passport = generate_passport(item, grading, credits_data)
        upload_passport_html(item["item_id"], passport)
        update_item_field(item, "passport_key", f"passports/{item['item_id']}.html")

    # 10. Agent ⑦ — Prevention (reactive: listing correction + flag update)
    correct_listing(item, grading)
    write_listing_flag(item, grading)

    # 11. Set final status
    final_status = "listed" if disp["disposition"] in ("resell", "refurbish", "exchange") else disp["disposition"]
    update_item_field(item, "status", final_status)

    # 12. Seller notification (fire-and-forget stub; does not block response)
    if final_status == "listed" and item.get("seller_id"):
        top = item.get("matches", [{}])[0]
        notify_seller_stub(item["item_id"], item["seller_id"], "listed",
                           top.get("buyer_id"), top.get("re_return_risk"))

    return assemble_result(item)

def process_existing_item(item_id: str, trade_in: bool = False) -> dict:
    """
    Used only by seed.py after items.json has already been inserted and photos uploaded.
    Must not create a duplicate item. It loads the existing Items row, runs agents ①-⑦,
    updates the same item_id, and returns assemble_result(item).
    """
    item = get_item("Items", {"item_id": item_id})
    assert item and item["status"] == "pending"
    assert item.get("photo_keys")
    # Then run the same steps as process_return starting from Agent ①.
    pass
```

---

## Phase 6 — API Endpoints (main.py)

Backend base URL during hackathon: `http://localhost:8000`

Frontend must read it from:

```ts
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
```

Enable CORS for `http://localhost:3000` only in local demo.

### Endpoint summary

```python
GET    /health
GET    /config
POST   /returns
POST   /community-list
GET    /items/{item_id}
GET    /items/{item_id}/passport
GET    /listings/{listing_id}/warning
GET    /buyers
GET    /buyers/{buyer_id}
GET    /buyers/{buyer_id}/recommendations?limit=10
GET    /ops/items?status=&limit=50
POST   /notify-seller            # seller notification stub
POST   /credits/redeem           # green credits redemption
```

### Shared response rules

- All responses are JSON except presigned S3 URLs, which are returned as strings inside JSON.
- All money fields are integers in INR paise-free rupees, e.g. `1850`.
- All risk scores are floats from `0.0` to `1.0`.
- All timestamps are ISO8601 strings.
- Errors use:

```json
{
  "error": {
    "code": "NOT_FOUND|VALIDATION_ERROR|AWS_ERROR|BEDROCK_CACHE_MISS|INTERNAL_ERROR",
    "message": "human-readable message",
    "details": {}
  }
}
```

If `DEMO_MODE=true`, endpoints must not make uncached Bedrock calls during frontend browsing. Seed script is allowed to create cache entries.

### GET /health

Purpose: frontend/dev sanity check.

Response:

```json
{
  "ok": true,
  "service": "secondlife-backend",
  "env": "local",
  "aws_region": "ap-south-1"
}
```

### GET /config

Purpose: frontend can verify demo IDs.

Response:

```json
{
  "api_base_url": "http://localhost:8000",
  "demo_buyer_id": "BUY-001",
  "demo_item_id": "ITM-001",
  "demo_listing_id": "LST-NIKE-AIR-270-BLK-10"
}
```

### POST /returns

Purpose: returner upload flow. Runs grading → disposition → pricing/matching/credits/passport if publishable → prevention.

Content type: `multipart/form-data`

Fields:
- `payload`: JSON string matching required item fields, without `photo_keys`.
- `photos`: one or more image files.
- `trade_in`: optional boolean string, `"true"` or `"false"`.

Minimum payload:

```json
{
  "item_id": "ITM-UPLOAD-001",
  "listing_id": "LST-NIKE-AIR-270-BLK-10",
  "category": "shoes",
  "brand": "Nike",
  "name": "Nike Air Max 270",
  "listed_size": "US 10",
  "listed_color": "black",
  "original_price_inr": 9999,
  "return_reason_code": "fit_too_tight",
  "return_reason_text": "Felt too tight near the toe",
  "return_hub_city": "Bangalore",
  "owner_count": 1,
  "history_note": "1 owner, returned for fit only",
  "status": "pending"
}
```

Response:

```json
{
  "item_id": "ITM-UPLOAD-001",
  "status": "listed",
  "grade": "B",
  "disposition": "resell",
  "base_price_inr": 1850,
  "co2_saved_kg": 4.2,
  "credits": 42,
  "passport_url": "https://presigned-url",
  "top_matches": [
    {
      "buyer_id": "BUY-001",
      "name": "Riya Shah",
      "re_return_risk": 0.005,
      "why_this_fits": "You size up in Nike — this pair runs small."
    }
  ],
  "warning_written": true
}
```

### POST /community-list

Purpose: P2P resale listing. Same input as `/returns`, plus seller fields.

Content type: `multipart/form-data`

Extra payload fields:

```json
{
  "seller_id": "BUY-010",
  "seller_keeps_item": true,
  "listing_price_inr": 2200
}
```

Rules:
- If grade is `A`, `B`, or `C`, publish using `listing_price_inr`.
- If grade is `D` or `REVIEW`, return status `manual_review` or `recycle`; do not publish.

Response shape: same as `/returns`.

### GET /items/{item_id}

Purpose: full item detail for refurb page and ops page.

Response:

```json
{
  "item_id": "ITM-001",
  "listing_id": "LST-NIKE-AIR-270-BLK-10",
  "category": "shoes",
  "brand": "Nike",
  "name": "Nike Air Max 270",
  "status": "listed",
  "grade": "B",
  "disposition": "resell",
  "original_price_inr": 9999,
  "base_price_inr": 1850,
  "listed_size": "India 9",
  "listed_color": "black",
  "return_reason_code": "fit_too_tight",
  "return_reason_text": "Felt too tight, especially on the sides near the toe",
  "return_hub_city": "Bangalore",
  "photo_urls": ["https://presigned-url"],
  "passport_url": "https://presigned-url",
  "co2_saved_kg": 4.2,
  "credits": 42,
  "matches": []
}
```

### GET /items/{item_id}/passport

Purpose: Trust Passport component.

Response:

```json
{
  "item_id": "ITM-001",
  "passport_url": "https://presigned-url",
  "passport": {
    "summary": "Grade B · 1 previous owner · fit return, not a defect",
    "condition_statement": "Light heel scuff. Otherwise structurally sound.",
    "why_returned": "The previous buyer found the fit too tight.",
    "buyer_reassurance": "Choosing this item saves 4.2 kg CO2e versus buying new."
  }
}
```

### GET /listings/{listing_id}/warning

Purpose: original PDP prevention widget.

Response when warning exists:

```json
{
  "listing_id": "LST-NIKE-AIR-270-BLK-10",
  "has_warning": true,
  "flag_type": "size",
  "return_count_for_reason": 23,
  "recommendation": "Runs small — 23 buyers found this. Consider sizing up.",
  "evidence": "Multiple fit_too_tight returns; detected size normalizes to India 9.",
  "last_item_id": "ITM-001"
}
```

Response when no warning exists:

```json
{
  "listing_id": "LST-UNKNOWN",
  "has_warning": false
}
```

### GET /buyers

Purpose: ops/debug buyer picker.

Query params:
- `region`: optional exact city/region.
- `category`: optional interest category.
- `limit`: default `50`.

Response:

```json
{
  "buyers": [
    {
      "buyer_id": "BUY-001",
      "name": "Riya Shah",
      "region": "Surat",
      "primary_category": "shoes",
      "credit_score": 120,
      "return_rate": 0.04
    }
  ]
}
```

### GET /buyers/{buyer_id}

Purpose: frontend header/profile dropdown.

Response: full buyer record from DynamoDB.

### GET /buyers/{buyer_id}/recommendations

Purpose: homepage recommendation feed.

Query params:
- `limit`: default `10`, max `25`.

Response:

```json
{
  "buyer_id": "BUY-001",
  "items": [
    {
      "item_id": "ITM-001",
      "listing_id": "LST-NIKE-AIR-270-BLK-10",
      "brand": "Nike",
      "name": "Nike Air Max 270",
      "category": "shoes",
      "grade": "B",
      "original_price_inr": 9999,
      "price_inr": 1850,
      "photo_url": "https://presigned-url",
      "passport_url": "https://presigned-url",
      "return_hub_city": "Bangalore",
      "ship_eta_days": 1,
      "co2_saved_kg": 4.2,
      "credits": 42,
      "re_return_risk": 0.005,
      "why_this_fits": "You size up in Nike — this pair runs small, perfect for you."
    }
  ]
}
```

Frontend card must use only this response. Do not recompute price, credits, or risk in React.

### GET /ops/items

Purpose: ops dashboard.

Query params:
- `status`: optional, e.g. `pending`, `listed`, `manual_review`, `recycle`, `donate`.
- `limit`: default `50`.

Response:

```json
{
  "items": [
    {
      "item_id": "ITM-001",
      "name": "Nike Air Max 270",
      "status": "listed",
      "grade": "B",
      "disposition": "resell",
      "base_price_inr": 1850,
      "top_match_buyer_id": "BUY-001",
      "top_match_risk": 0.005,
      "size_mismatch": true,
      "color_mismatch": false
    }
  ]
}
```

### POST /notify-seller

Purpose: notify a seller that their item has been matched and is listed. Stub for MVP — logs to stdout. Extend to AWS SNS in production.

Request body:
```json
{
  "item_id": "ITM-001",
  "seller_id": "BUY-010",
  "event": "matched|listed|sold",
  "top_match_buyer_id": "BUY-001",
  "re_return_risk": 0.005,
  "base_price_inr": 1850
}
```

MVP implementation — log and return 200. Do not fail the orchestrator if this call errors.

```python
@app.post("/notify-seller")
async def notify_seller(body: dict):
    # MVP stub: log to stdout. In production, publish to SNS topic ARN from env.
    import logging
    logging.info(f"[notify-seller] item={body.get('item_id')} event={body.get('event')} seller={body.get('seller_id')}")
    return {"notified": True, "channel": "log"}
```

Call `POST /notify-seller` from the orchestrator at the end of `process_return()` whenever `final_status == "listed"` and `item.get("seller_id")` is set.

---

### POST /credits/redeem

Purpose: apply green credits as a discount on a second-life purchase.

Request body:
```json
{
  "buyer_id": "BUY-001",
  "item_id": "ITM-001",
  "credits_to_use": 50
}
```

Rules:
- 1 credit = ₹1 discount.
- Max redemption per order: min(`credits_to_use`, `buyer.credit_score`, `item.base_price_inr * 0.20`). Cap at 20% of item price.
- On success, decrement `credit_score` in Buyers and write a `CreditsLedger` row with `action: "redemption"`.

Response:
```json
{
  "buyer_id": "BUY-001",
  "item_id": "ITM-001",
  "credits_used": 50,
  "discount_inr": 50,
  "final_price_inr": 1800,
  "remaining_credits": 70
}
```

---

### Frontend page-to-endpoint map

| Frontend page | Calls | Renders |
|---|---|---|
| `pages/index.tsx` | `GET /buyers/{NEXT_PUBLIC_DEMO_BUYER_ID}/recommendations?limit=10` | Recommendation cards, prices, credits, risks, `why_this_fits` |
| `pages/refurb/[id].tsx` | `GET /items/{item_id}`, `GET /items/{item_id}/passport`, `POST /credits/redeem` | Refurb listing, photos, Trust Passport, green impact, credits redemption toggle |
| `pages/product/[id].tsx` | `GET /listings/{listing_id}/warning`, `GET /items/ITM-001` for demo Second Life option | Original PDP warning + Second Life option |
| `pages/return.tsx` | `POST /returns` | Upload flow result: grade, route, credits, CO2; branches to exchange.tsx if trade_in=true |
| `pages/exchange.tsx` | Receives result from `POST /returns` with `trade_in=true` | Trade-in confirmation: store credit issued, nudge to spend on second-life listings |
| `pages/sell.tsx` | `POST /community-list` | P2P seller upload form: photos, price, category; shows grading result + Trust Passport |
| `pages/ops.tsx` | `GET /ops/items?limit=50`, optionally `GET /items/{item_id}`, `POST /notify-seller` | Ops dashboard, top matches, mismatch flags, notify-seller button |

For this MVP, `pages/product/[id].tsx` can hardcode the demo refurb item `ITM-001` after fetching the warning. Do not build catalog search.

### GET /buyers/{buyer_id}/recommendations — inverted matching

**Cache strategy — this is the hero screen endpoint, it must never make a live Bedrock call during demo.**

Cache key: `make_cache_key("recommendations", buyer_id.encode(), sorted_item_ids_str, "v1", MODEL_ID)` where `sorted_item_ids_str` is the sorted list of candidate `item_id`s that passed Stage 1 filter. Compute this before calling Bedrock; if the candidate set has not changed since last cache, return cached rankings instantly.

The seed script (Phase 8, step 7b) must call `get_recommendations(buyer_id)` for every buyer in the demo set and warm this cache. After seeding, `GET /buyers/BUY-001/recommendations` must return in < 100 ms with no Bedrock call.

```python
def get_recommendations(buyer_id: str, limit: int = 10):
    buyer = get_item("Buyers", {"buyer_id": buyer_id})
    # Stage 1: query Items.StatusCategoryIndex once per buyer category_interest
    candidates = query_items_for_buyer(buyer)  # status=listed + category overlap; no table scan
    sorted_item_ids_str = json.dumps(sorted([i["item_id"] for i in candidates]))
    cache_key = make_cache_key("recommendations", buyer_id.encode(), sorted_item_ids_str, "v1", MODEL_ID)
    cached = cache_get(cache_key)
    if cached:
        return cached
    # Stage 2: same Haiku rerank, but fixed buyer, varying items
    # Run same risk formula inverted
    # Sort ascending by risk, attach per-buyer price + credits
    result = ranked_items[:limit]
    cache_put(cache_key, "recommendations", result)
    return result
```

---

## Phase 7 — Frontend Screens

**Amazon UI/UX baseline for all screens:**
- Header: `AmazonHeader.tsx` — `#232F3E` navy background, amazon.in logo left, search bar center, cart icon + buyer name + credits badge top-right.
- CTA buttons: `#FF9900` orange (`Add to Cart`, `Buy Now`), `#146EB4` blue for secondary links.
- Body background: `#EAEDED` light grey with white card panels.
- Typography: `Amazon Ember` or fallback `Arial`, 14px body, 18px product title, bold prices in `#B12704` red.
- Breadcrumb: `Home > Second Life > [Category]` below header.
- Price: crossed-out original in grey, sale price in `#B12704` red, savings in green.
- Star ratings: ★★★★☆ style with review count in `#007185` teal.
- Badges: "Certified Refurb", "Second Life", "Prime Eligible" in Amazon yellow-orange pill style.
- No emojis in production UI — replace with SVG icons (leaf icon for green, shield icon for Trust Passport, location pin for city).

---

### Screen 1 — Buyer Recommendation Feed (HERO SCREEN) — `pages/index.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [amazon.in logo]  [Search second-life products...]  [Cart 0] │
│                                          Riya ▼  | 120 pts  │
├──────────────────────────────────────────────────────────────┤
│ Home > Second Life > Picks for Riya                          │
│                                                              │
│ Certified Second Life — Picked for you (10 items)           │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [photo]      Nike Air Max 270                            │ │
│ │              [CERTIFIED REFURB] [GRADE B]                │ │
│ │              ★★★★☆ (certified condition report)          │ │
│ │              ~~₹9,999~~  ₹1,850  Save 82%               │ │
│ │              [leaf] Saves 4.2 kg CO₂ · +50 credits      │ │
│ │              [pin] Ships from Bangalore · arrives in 1d  │ │
│ │              [shield] Why this fits you:                 │ │
│ │              "You size up in Nike — this pair runs       │ │
│ │               small, perfect for you."                   │ │
│ │              [View Trust Passport]  [Add to Cart]        │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [photo]      Rajasthani Laal Mirch Pickle 500g           │ │
│ │              [GRADE A] [SEALED & UNOPENED]               │ │
│ │              ~~₹299~~  ₹179  Save 40%                    │ │
│ │              [leaf] Saves 0.8 kg CO₂ · +3 credits        │ │
│ │              [pin] Ships from Bangalore · arrives in 1d  │ │
│ │              [shield] "You love spicy — returned for     │ │
│ │               being too hot for previous buyer."         │ │
│ │              [View Trust Passport]  [Add to Cart]        │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- Buyer name and credit balance come from `GET /buyers/{buyer_id}` on page load.
- Each card maps directly to one item in `GET /buyers/{buyer_id}/recommendations` response; do not recompute price, credits, or risk in React.
- "Add to Cart" links to `pages/refurb/[id].tsx` for the full purchase flow.

---

### Screen 2 — Original Product Page (PDP) Prevention Widget — `pages/product/[id].tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [Header]                                                     │
├──────────────────────────────────────────────────────────────┤
│ Home > Shoes > Nike Air Max 270                              │
│                                                              │
│ Nike Air Max 270                          [4 photos]        │
│ ★★★★☆ 2,341 ratings                                         │
│ ₹9,999   [Add to Cart]  [Buy Now]                            │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [!] FIT ALERT  23 buyers found this runs small.          │ │
│ │     Consider ordering one size up.                       │ │
│ │     (Based on verified return data — AI-analysed)        │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ [leaf] SECOND LIFE OPTION AVAILABLE                      │ │
│ │  Grade B certified · ₹1,850 · Trust Passport included    │ │
│ │  Save ₹8,149 vs new · ships from Bangalore               │ │
│ │                  [View Certified Second Life →]          │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Predictive prevention note:** the Fit Alert renders as soon as `GET /listings/{listing_id}/warning` returns `has_warning: true`, even if the current inventory unit is brand-new. It fires from the existing `ListingFlags` row written by prior returns of the same `listing_id`.

---

### Screen 3 — Refurb Listing Page — `pages/refurb/[id].tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [Header]                                                     │
├──────────────────────────────────────────────────────────────┤
│ Home > Second Life > Shoes > Nike Air Max 270                │
│                                                              │
│  [photo 1]  [photo 2]     Nike Air Max 270                  │
│                           Certified Second Life              │
│                           [GRADE B]  [1 PREVIOUS OWNER]     │
│                           ★★★★☆ AI-graded condition          │
│                                                              │
│                           ~~₹9,999~~  ₹1,850  (save 82%)    │
│                           [leaf] +50 green credits earned    │
│                                                              │
│                           USE YOUR CREDITS                   │
│                           ┌──────────────────────────────┐  │
│                           │ You have 120 credits (₹120)   │  │
│                           │ Apply 50 credits → ₹1,800     │  │
│                           │ [Toggle: Apply credits  ON]   │  │
│                           └──────────────────────────────┘  │
│                                                              │
│                           [Add to Cart]  [Buy Now]          │
│                                                              │
│  TRUST PASSPORT                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [shield] Grade B · 1 owner · returned for fit only   │   │
│  │ Condition: Light heel scuff. Otherwise excellent.     │   │
│  │ Why returned: Previous owner found fit too tight.     │   │
│  │ [leaf] Buying this saves 4.2 kg CO₂ vs buying new.   │   │
│  │ [View full passport →]                               │   │
│  └──────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘
```

**Credits redemption:** toggling "Apply credits" calls `POST /credits/redeem` with `credits_to_use = min(buyer.credit_score, 50)`. On success, replace displayed price with `final_price_inr` from response. Max 20% discount enforced by backend.

---

### Screen 4 — Returns Flow — `pages/return.tsx`

Two branches based on `trade_in_requested`:

**Branch A — Standard return (trade_in = false):**
```
┌──────────────────────────────────────────────────────────────┐
│ [Header]                                                     │
├──────────────────────────────────────────────────────────────┤
│ Home > Returns > Submit Return                               │
│                                                              │
│  Step 1: Upload item details & photos                        │
│  [Item name]  [Category ▼]  [Brand]  [Return reason ▼]      │
│  [Original price]  [Size]  [Color]                           │
│  [Upload photos — drag & drop or browse]                     │
│                                                              │
│  OR request trade-in credit: [ ] Trade-in for store credit  │
│                                                              │
│  [Submit Return →]                                          │
│  ───────────────────────────────────────────────────────     │
│  Step 2: Your Return Summary (shown after POST /returns)     │
│                                                              │
│  [leaf] Your item earns a second life                        │
│  Grade: B  |  Route: Certified Resell                        │
│  You earn: 42 green credits added to your account           │
│  CO₂ saved: 4.2 kg (approx. 21 km by car)                   │
│                                                              │
│  [Continue with Return →]                                   │
└──────────────────────────────────────────────────────────────┘
```

**Branch B — Trade-in (trade_in = true):** redirect to `pages/exchange.tsx` after `POST /returns` responds with `disposition: "exchange"`.

---

### Screen 5 — Exchange / Trade-in Confirmation — `pages/exchange.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [Header]                                                     │
├──────────────────────────────────────────────────────────────┤
│ Home > Returns > Trade-in Credit Confirmed                   │
│                                                              │
│  [checkmark] Trade-in complete!                              │
│                                                              │
│  Item: Nike Air Max 270 (Grade B)                            │
│  Trade-in value: ₹1,665 (90% of recovered value)            │
│  Added to your Second Life credit wallet                     │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [coin] ₹1,665 store credit                           │   │
│  │ Valid on Second Life certified listings only         │   │
│  │ [Browse Second Life listings →]                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [leaf] CO₂ saved: 4.2 kg · +42 green credits earned        │
│                                                              │
│  [Back to Home]                                              │
└──────────────────────────────────────────────────────────────┘
```

**Implementation note:** `exchange.tsx` receives item_id, grade, trade_in_credit_inr, co2_saved_kg, and credits from the `/returns` response (passed via router state or query param). "Browse Second Life listings →" navigates to `pages/index.tsx`.

---

### Screen 6 — P2P Seller Listing — `pages/sell.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [Header]                                                     │
├──────────────────────────────────────────────────────────────┤
│ Home > Sell > List Your Item                                 │
│                                                              │
│  Sell on Amazon Second Life                                  │
│  Your item gets AI-graded and listed with a Trust Passport.  │
│                                                              │
│  [Item name]  [Category ▼]  [Brand]  [Condition note]        │
│  [Your asking price ₹]  [Size]  [Color]                      │
│  [Upload photos — min 1, max 5]                              │
│                                                              │
│  [List My Item →]                                           │
│  ───────────────────────────────────────────────────────     │
│  After grading (shown after POST /community-list):           │
│                                                              │
│  Grade: B  |  Your listing price: ₹2,200 APPROVED           │
│  [shield] Trust Passport generated — buyers can see it       │
│  [leaf] Saves 14.0 kg CO₂ · +140 credits when sold          │
│                                                              │
│  [View Your Listing →]  [Edit Price]                        │
└──────────────────────────────────────────────────────────────┘
```

**Implementation note:** calls `POST /community-list` with `seller_keeps_item: true`, `seller_id: buyer_id`, `listing_price_inr`. If grade is `D` or `REVIEW`, shows "Item needs review — our team will contact you" instead of approval panel.

---

### Screen 7 — Ops Dashboard — `pages/ops.tsx`

```
┌──────────────────────────────────────────────────────────────┐
│ [Header — internal ops view]                                 │
├──────────────────────────────────────────────────────────────┤
│ Home > Ops > Item Intelligence Dashboard                     │
│                                                              │
│ Filter: [Status ▼ All]  [Limit ▼ 50]  [Refresh]             │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ITM-001 · Nike Air Max 270                               │ │
│ │ Status: listed  Grade: B  Route: resell                  │ │
│ │ Price: ₹1,850  Original: ₹9,999                          │ │
│ │ [!] Size mismatch: listed US10 → detected India 9        │ │
│ │ TOP MATCH: BUY-001 Riya Shah · risk 0.5%  ✓ low risk     │ │
│ │ vs BUY-002 Karan Mehta · risk 29%  ✗ serial returner     │ │
│ │ CO₂: 4.2 kg · Credits: 42                                │ │
│ │ [View Item]  [View Passport]  [Notify Seller]            │ │
│ └──────────────────────────────────────────────────────────┘ │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │ ITM-007 · FabIndia Cotton Kurta                          │ │
│ │ Status: manual_review  Grade: C  Route: refurbish        │ │
│ │ Reason: clasp defect — needs minor repair                │ │
│ │ [View Item]  [Mark Resolved]                             │ │
│ └──────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- Data from `GET /ops/items?limit=50`. Status filter sends `?status=<value>`.
- "Notify Seller" button calls `POST /notify-seller` with `item_id`, `event: "matched"`, `top_match_buyer_id`, `re_return_risk`.
- Risk colour coding: risk < 0.10 = green label, 0.10–0.25 = amber, > 0.25 = red.
- "Mark Resolved" for manual_review items calls `PATCH /items/{item_id}` (simple status update, implement as needed).
- This screen is the "intelligence reveal" in the demo — it shows the same item, two buyers, vastly different risk scores, and the mismatch flag that corrected the catalog.

---

### Screen 8 — Order Confirmation Green Impact — (add to existing order confirm)

```
┌──────────────────────────────────────────────────────────────┐
│ [Header]                                                     │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│  [checkmark] Order Confirmed — Thank you, Riya!              │
│  Order #402-7654321-1234567                                  │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ [leaf] Your green impact                             │   │
│  │ You saved 4.2 kg CO₂ by choosing certified          │   │
│  │ second-life instead of buying new.                   │   │
│  │ That's equivalent to 21 km driven by car.            │   │
│  │                                                      │   │
│  │ +50 green credits added.  Total: 170 credits         │   │
│  │ Redeem credits on your next Second Life purchase.    │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [Browse more Second Life items]  [View Order Details]      │
└──────────────────────────────────────────────────────────────┘
```

---

## Phase 8 — Seed Script

### seed/seed.py — run this ONCE before demo

```python
# 1. Create all 6 DynamoDB tables and GSIs (skip if already exist)
# 2. Load and validate reference JSON, buyers.json, and items.json
# 3. Put all buyers into Buyers table
# 4. Put one row per buyer interest into BuyerInterestIndex
# 5. Put all 15 items into Items table with status="pending"
# 6. Upload local photos from seed/photos/ to S3 (one folder per item_id)
# 7. Run orchestrator.process_existing_item(item_id) on each item
#    (pre-bakes grading, matching, passports, and prevention into GradeCache/DynamoDB)
# 7b. Call get_recommendations(buyer_id) for every buyer in buyers.json
#     (pre-bakes inverted-matching Haiku results into GradeCache so hero screen is instant)
# 8. Print final status, grade, disposition, top match, and passport key for each item
# 9. Verify: GET /buyers/BUY-001/recommendations must return in <100ms (cache hit)
```

For step 6: take 15 product photos with your phone. Name them `ITM-001/front.jpg`, etc. Place in `seed/photos/`. The seed script uploads them and sets `photo_keys` on each item.

For step 7: this pre-populates `GradeCache` with grades, matches, and passports. All demo reads come from cache — instant, $0, no live-call risk.

**Seed validation must fail fast if:**
- fewer than 10 buyers exist in demo mode, or fewer than 30 buyers exist in full-demo mode
- any category appears in seed data but is missing from `carbon_table`, `demand_table`, or `size_standard_map`
- any city appears in seed data but is missing from `city_coords`
- any `photo_keys` path has no corresponding local file
- any duplicate `item_id`, `listing_id`, or `buyer_id` exists
- any item has `status` other than `"pending"` before processing

---

## Phase 9 — Demo Script (record this exactly)

### Demo narrative (90 seconds)

**Part A — Buyer side (first 30 seconds):**
1. Open app as **Riya (BUY-001, Surat)**. Amazon-style navy header, "120 credits" badge.
2. Show the recommendation feed. Top card: Nike Air Max 270, Grade B, ₹1,850, "because you size up in Nike."
3. Tap it. Refurb page opens — Trust Passport shows "1 owner, returned for fit — not a defect. Saves 4.2 kg CO₂."
4. Toggle "Apply 50 credits" — price drops to ₹1,800. Add to Cart. Order confirmation shows green impact + credits balance.

**Part B — Intelligence reveal (next 20 seconds):**
5. Flip to Ops dashboard for ITM-001. Show: Grade B, size mismatch flag (listed US10 → really India 9), disposition resell, top match Riya 0.5% risk (green) vs Karan 29% risk (red). Click "Notify Seller" — logged instantly.
6. Briefly: "Same item, Riya sizes up in Nike = 0.5% vs serial returner Karan = 29%."

**Part C — Prevention loop (next 15 seconds):**
7. Open the ORIGINAL Nike Air Max 270 product page. Show the Fit Alert badge: "23 buyers found this runs small — consider sizing up." The return taught the catalog — *before* the next buyer clicks Add to Cart.

**Part D — P2P + Exchange (final 25 seconds):**
8. Switch to `pages/sell.tsx`. Upload a photo of a second item, set price ₹2,200. "List My Item." Show grade result + Trust Passport generated.
9. Switch to `pages/return.tsx`, check "Trade-in for store credit." Submit. Redirect to `pages/exchange.tsx` — "₹1,665 store credit added, valid on Second Life listings." Show the credit wallet.

**One line for judges:** *"The same return found its next best owner, corrected the listing, earned the seller green credits, and unlocked store credit — all from a single photo upload."*

---

## Phase 10 — Build Order

| Phase | Hours | What |
|---|---|---|
| 0 | 0–1h | Create AWS Budget, enable Bedrock model access, create local IAM credentials/profile, fill `backend/.env` and `frontend/.env.local`. |
| 1 | 1–3h | Implement `create_tables.py`, `db/dynamo.py`, `db/s3.py`; create DynamoDB tables/GSIs and S3 buckets. |
| 2 | 3–5h | Commit reference JSON, 30 buyers, 15 items, and seed photos. Run seed validation only. |
| 3 | 5–10h | Implement Agent ① grading with Bedrock env model ID, schema validation, deterministic cache. |
| 4 | 10–14h | Implement Agents ④⑤⑥: disposition, pricing, green credits. Add `predict_listing_flag()` stub in prevention.py. |
| 5 | 14–20h | Implement Agent ② matching using `BuyerInterestIndex`, risk formula, buyer recommendations with inverted-match cache key. |
| 6 | 20–24h | Implement Agent ③ Trust Passport JSON + HTML render + S3 upload/presigned URL. |
| 7 | 24–26h | Implement Agent ⑦ prevention: predictive flag check + listing correction + `ListingFlags` PDP warning. |
| 8 | 26–30h | Implement orchestrator + all endpoints: `/returns`, `/community-list`, `/items`, `/passport`, `/warning`, `/recommendations`, `/ops/items`, `/notify-seller`, `/credits/redeem`. Test in FastAPI docs. |
| 9 | 30–32h | Run `seed.py`: pre-bake all 15 items + all buyer recommendation caches. Verify BUY-001 recs return in <100ms. Set `DEMO_MODE=true`. |
| 10 | 32–42h | Frontend: 8 screens (index, return+exchange branch, exchange, sell, ops, product/[id], refurb/[id] with credits toggle, order confirm). Amazon navy/orange design system. Use only endpoint response fields. |
| 11 | 42–44h | End-to-end localhost test: `localhost:3000` → `localhost:8000` → AWS Bedrock/DynamoDB/S3. Verify exchange flow, P2P sell flow, credits redemption, ops notify-seller. Fix bugs. |
| 12 | 44–46h | Record demo video from localhost using cached results. Cover all 3 demo parts + ops reveal + exchange path. |
| 13 | 46–47h | Draw architecture diagram: local frontend/backend + AWS Bedrock/DynamoDB/S3 only. Write PRD sections. |
| 14 | 47–48h | Buffer. |
