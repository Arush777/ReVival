# SecondLife Commerce — Action Plan
> Direct implementation guide. Every schema, formula, prompt, and screen is exact. No ambiguity.

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
│   │   ├── index.tsx            # buyer recommendation feed
│   │   ├── return.tsx           # returner upload flow
│   │   ├── ops.tsx              # ops/seller dashboard
│   │   ├── product/[id].tsx     # original PDP + prevention widget
│   │   └── refurb/[id].tsx      # refurb listing + passport
│   └── components/
│       ├── RecommendationCard.tsx
│       ├── TrustPassport.tsx
│       ├── GreenImpact.tsx
│       └── PreventionBadge.tsx
└── README.md
```

---

## Tech Stack

| Layer | Use exactly this |
|---|---|
| Backend | Python 3.11, FastAPI, uvicorn |
| AI | boto3, `bedrock-runtime` client, Converse API |
| Vision model | `anthropic.claude-sonnet-4-6` |
| Text model | `anthropic.claude-haiku-4-5-20251001` |
| Database | AWS DynamoDB (5 tables) |
| File storage | AWS S3 (2 buckets) |
| Frontend | Next.js 14, React, shadcn/ui |
| AWS region | `ap-south-1` (Mumbai — India-first) |

---

## Phase 0 — Environment Setup

### requirements.txt
```
fastapi==0.111.0
uvicorn==0.29.0
boto3==1.34.0
python-multipart==0.0.9
pillow==10.3.0
```

### AWS credentials
Set these env vars before running anything:
```
AWS_ACCESS_KEY_ID=<your key>
AWS_SECRET_ACCESS_KEY=<your secret>
AWS_DEFAULT_REGION=ap-south-1
```

### S3 buckets to create (run once)
```
secondlife-photos-<your-account-id>
secondlife-passports-<your-account-id>
```
Store the bucket names as env vars: `S3_PHOTOS_BUCKET`, `S3_PASSPORTS_BUCKET`.

---

## Phase 1 — DynamoDB Tables

Create all 5 tables. PK/SK and GSIs listed below.

### Table: `Items`
- PK: `item_id` (String)
- No SK

### Table: `Buyers`
- PK: `buyer_id` (String)
- GSI name: `RegionCategoryIndex`
  - GSI PK: `region` (String)
  - GSI SK: `primary_category` (String)

### Table: `GradeCache`
- PK: `cache_key` (String)
- No SK
- TTL attribute: `expires_at` (optional, set 7 days)

### Table: `ListingFlags`
- PK: `listing_id` (String)
- No SK

### Table: `CreditsLedger`
- PK: `buyer_id` (String)
- SK: `timestamp` (String, ISO8601)

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
  "shirt": { "XS": "XS", "S": "S", "M": "M", "L": "L", "XL": "XL", "XXL": "XXL" }
}
```

### carbon_table.json
```json
{
  "shoes":     { "manufacturing_kg_co2": 14.0, "weight_kg": 0.8 },
  "shirt":     { "manufacturing_kg_co2": 7.0,  "weight_kg": 0.3 },
  "kurta":     { "manufacturing_kg_co2": 6.0,  "weight_kg": 0.4 },
  "saree":     { "manufacturing_kg_co2": 8.0,  "weight_kg": 0.6 },
  "phone":     { "manufacturing_kg_co2": 70.0, "weight_kg": 0.2 },
  "laptop":    { "manufacturing_kg_co2": 300.0,"weight_kg": 2.0 },
  "appliance": { "manufacturing_kg_co2": 150.0,"weight_kg": 5.0 },
  "bag":       { "manufacturing_kg_co2": 10.0, "weight_kg": 0.5 },
  "food":      { "manufacturing_kg_co2": 2.0,  "weight_kg": 0.5 },
  "headphones":{ "manufacturing_kg_co2": 25.0, "weight_kg": 0.3 },
  "kettle":    { "manufacturing_kg_co2": 20.0, "weight_kg": 1.2 }
}
```

### demand_table.json
```json
{
  "Mumbai":    { "shoes": 0.9, "shirt": 0.8, "phone": 0.9, "bag": 0.8 },
  "Delhi":     { "shoes": 0.8, "shirt": 0.7, "phone": 0.9, "kurta": 0.8 },
  "Bangalore": { "shoes": 0.7, "phone": 0.95,"laptop": 0.9,"shirt": 0.6 },
  "Surat":     { "shoes": 0.8, "saree": 0.9, "shirt": 0.7, "kurta": 0.8 },
  "Ahmedabad": { "shoes": 0.7, "kurta": 0.9, "saree": 0.8, "bag": 0.6 },
  "Chennai":   { "shoes": 0.7, "phone": 0.8, "saree": 0.9, "shirt": 0.6 },
  "Pune":      { "shoes": 0.8, "phone": 0.8, "shirt": 0.7, "laptop": 0.7 },
  "Hyderabad": { "shoes": 0.7, "phone": 0.85,"shirt": 0.7, "saree": 0.7 }
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

> Add 20 more buyers by prompting Claude offline: "Generate 20 diverse Indian e-commerce buyer profiles in this exact JSON format with realistic Indian names, cities, categories, size profiles, preferences, return histories, and eco preferences."

### items.json — 15 hero records

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
    "category": "shirt", "brand": "Levi's",
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
    "category": "bag", "brand": "Fastrack",
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

**Bedrock model:** `anthropic.claude-sonnet-4-6`
**temperature:** 0
**Cache:** yes — key = `make_cache_key("grading", image_bytes_concat, listed_attrs_string, "v1", MODEL_ID)`

**System prompt (exact text to use):**
```
You are a product-condition inspector for a returns processing system.
You receive one or more photos of a returned item plus what the seller's listing claimed.
Your job is to extract OBJECTIVE observations only — no grades, no decisions.
Respond ONLY with valid JSON matching the exact schema below.
Use integer scales, not prose. Do not add any fields not in the schema.
```

**User message to send (build this in code):**
```
Listed attributes:
Category: {category}
Brand: {brand}
Listed size: {listed_size}
Listed color: {listed_color}

Inspect the photos and return:
{
  "wear_level": <integer 0-10: 0=pristine, 10=heavily destroyed>,
  "defects": [{"type": "<brief name>", "severity": <1|2|3>}],
  "functional": <true|false>,
  "detected_category": "<string>",
  "detected_color": "<string>",
  "detected_size": "<string or 'unknown'>",
  "size_mismatch": <true|false>,
  "color_mismatch": <true|false>,
  "mismatch_notes": "<empty string if no mismatch>"
}
```

**After getting observations from Bedrock, compute grade in code (do NOT ask the model):**
```python
def compute_grade(obs: dict) -> str:
    if not obs["functional"]:
        return "D"
    max_sev = max((d["severity"] for d in obs["defects"]), default=0)
    w = obs["wear_level"]
    if w <= 1 and max_sev <= 1:   return "A"
    if w <= 4 and max_sev <= 2:   return "B"
    if w <= 7:                     return "C"
    return "D"
```

**Full function signature:**
```python
def grade_item(item: dict, photo_paths: list[str]) -> dict:
    # 1. Load photos from S3, base64-encode
    # 2. Compute cache key
    # 3. Return cached result if exists
    # 4. Call Bedrock Converse with image blocks + text prompt
    # 5. Parse JSON response
    # 6. Compute grade via compute_grade()
    # 7. Normalize size mismatch using size_standard_map
    # 8. Cache result
    # 9. Return full grading dict
    pass
```

**Return shape:**
```json
{
  "grade": "B",
  "wear_level": 3,
  "defects": [{"type": "heel scuff", "severity": 1}],
  "functional": true,
  "detected_category": "shoes",
  "detected_color": "black",
  "detected_size": "India 9",
  "size_mismatch": true,
  "color_mismatch": false,
  "mismatch_notes": "listed US10 normalized to India9, detected India9 — match. But listing says US10 which could confuse buyers.",
  "grade_confidence": 0.82
}
```

---

### Agent ④ — disposition.py (pure code)

```python
GRADE_FACTOR = {"A": 0.70, "B": 0.55, "C": 0.35, "D": 0.05}
HIGH_VALUE = {"phone", "laptop", "appliance", "kettle"}

def compute_disposition(item: dict, grade: str, trade_in_requested: bool = False) -> dict:
    recovered = round(item["original_price_inr"] * GRADE_FACTOR[grade])

    if trade_in_requested:
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

**Bedrock model:** `anthropic.claude-haiku-4-5-20251001`
**temperature:** 0
**Cache:** yes — key = `make_cache_key("matching", return_reason.encode(), sorted_buyer_ids_str, "v1", MODEL_ID)`

**Stage 1 — Code filter (DynamoDB GSI query):**
Query `Buyers` table using `RegionCategoryIndex` GSI. Filter: buyers in same state/region OR with `category_interests` overlapping item's category. Also filter: `size_profile.shoes` must be within 1 size of `detected_size` for footwear. Cap at 50 candidates.

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

**Bedrock model:** `anthropic.claude-haiku-4-5-20251001`
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

**Two mechanisms. Both run here.**

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

Pipeline is identical: grading → disposition (forced to `"resell"`) → pricing (use seller price, not recovered value) → Trust Passport → prevention check. The only difference is the seller retains the item and ships directly when sold. The grading + Trust Passport is what makes P2P trusted within Amazon's ecosystem.

No separate marketplace infra needed. The grading agent IS the trust layer.

---

## Phase 5 — Orchestrator

### orchestrator.py

```python
def process_return(payload: dict, photo_paths: list[str], trade_in: bool = False) -> dict:
    # 1. Create item in DynamoDB (status=pending)
    item = create_item_record(payload)

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
        append_credits_ledger(item.get("seller_id"), credits_data, item["item_id"])

        # 9. Agent ③ — Trust Passport
        passport = generate_passport(item, grading, credits_data)
        upload_passport_html(item["item_id"], passport)
        update_item_field(item, "passport_key", f"passports/{item['item_id']}.html")

    # 10. Agent ⑦ — Prevention (both mechanisms)
    correct_listing(item, grading)
    write_listing_flag(item, grading)

    # 11. Set status = listed
    update_item_field(item, "status", "listed")

    return assemble_result(item)
```

---

## Phase 6 — API Endpoints (main.py)

```python
POST   /returns                          # run full pipeline
POST   /community-list                   # P2P listing (same pipeline, seller keeps item)
GET    /items/{item_id}                  # full Item record
GET    /items/{item_id}/passport         # passport JSON + S3 URL
GET    /listings/{listing_id}/warning    # ListingFlags row (or empty {})
GET    /buyers/{buyer_id}/recommendations?limit=10  # personalized second-life feed
GET    /buyers                           # ?region=&category= (for ops/debug)
```

### GET /buyers/{buyer_id}/recommendations — inverted matching

```python
def get_recommendations(buyer_id: str, limit: int = 10):
    buyer = get_item("Buyers", {"buyer_id": buyer_id})
    # Stage 1: query listed items matching buyer's category_interests
    candidates = query_items_for_buyer(buyer)  # filter status=listed + category overlap
    # Stage 2: same Haiku rerank, but fixed buyer, varying items
    # Run same risk formula inverted
    # Sort ascending by risk, attach per-buyer price + credits
    # Return top `limit`
    return ranked_items[:limit]
```

---

## Phase 7 — Frontend Screens

### Screen 1 — Buyer Recommendation Feed (HERO SCREEN) — `pages/index.tsx`

```
┌─────────────────────────────────────────────┐
│  🌿 Second Life                    [Riya ▼] │
│  Your picks — certified & planet-friendly    │
├─────────────────────────────────────────────┤
│ ┌──────────────────────────────────────────┐│
│ │ [photo]  Nike Air Max 270 — Grade B+      ││
│ │          ✅ Why this fits you:             ││
│ │          "You size up in Nike — this pair  ││
│ │           runs small, perfect for you."    ││
│ │  ₹4,999 new → ₹1,850  🌱 +50 credits      ││
│ │  📍 Surat · ships in 1 day · saves 4.2 kg  ││
│ │  [View Trust Passport]  [Add to Cart]      ││
│ └──────────────────────────────────────────┘│
│ ┌──────────────────────────────────────────┐│
│ │ [photo]  Rajasthani Pickle — Sealed       ││
│ │          ✅ "You love spicy — this was     ││
│ │           returned for being too hot."     ││
│ │  ₹299 new → ₹179  🌱 +3 credits           ││
│ │  📍 Chennai · ships in 1 day · saves 0.8kg ││
│ │  [View Passport]  [Add to Cart]            ││
│ └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### Screen 2 — Original Product Page (PDP) Prevention Widget — `pages/product/[id].tsx`

```
┌─────────────────────────────────────────────┐
│  Nike Air Max 270                            │
│  ₹9,999  [Add to Cart]                       │
│                                              │
│ ┌──────────────────────────────────────────┐│
│ │ ⚠️  Fit note: 23 buyers found this runs   ││
│ │    small. Consider sizing up.             ││
│ └──────────────────────────────────────────┘│
│                                              │
│ ┌──────────────────────────────────────────┐│
│ │ 🌿 Second Life option available           ││
│ │    Grade B+ · ₹1,850 · Trust Passport ✓   ││
│ │    [View Certified Refurb →]              ││
│ └──────────────────────────────────────────┘│
└─────────────────────────────────────────────┘
```

### Screen 3 — Refurb Listing Page — `pages/refurb/[id].tsx`

```
┌─────────────────────────────────────────────┐
│  Nike Air Max 270 — Certified Second Life    │
│  ⭐ Grade B+                                  │
│  ₹1,850  (₹9,999 new — save 82%)             │
│  🌱 +50 green credits on purchase            │
│                                              │
│  TRUST PASSPORT                              │
│  ┌──────────────────────────────────────────┐│
│  │ Summary: Grade B · 1 owner · returned    ││
│  │   for fit, not a fault                   ││
│  │ Condition: Light heel scuff. Otherwise   ││
│  │   excellent.                             ││
│  │ Why returned: Ran small for prev. owner  ││
│  │ Buying this saved: 4.2 kg CO₂            ││
│  │ [photo 1] [photo 2]                      ││
│  └──────────────────────────────────────────┘│
│  [Add to Cart]                               │
└─────────────────────────────────────────────┘
```

### Screen 4 — Returns Flow Interstitial — `pages/return.tsx`

```
┌─────────────────────────────────────────────┐
│  Step 2 of 3: Your Return Summary            │
│                                              │
│  🌿 Your item earns a second life            │
│                                              │
│  Grade: B+                                   │
│  Route: Resell to next best owner            │
│  You earn: 42 green credits                  │
│  CO₂ saved: 4.2 kg (≈ 21 km by car)         │
│                                              │
│  [Continue with Return →]                    │
└─────────────────────────────────────────────┘
```

### Screen 5 — Order Confirmation Green Impact — (add to existing order confirm)

```
┌─────────────────────────────────────────────┐
│  ✅ Order Confirmed!                          │
│                                              │
│  🌿 Your green impact                        │
│  You saved 4.2 kg CO₂ by choosing            │
│  certified second-life.                      │
│  +50 green credits added to your account.   │
│  Total balance: 170 credits                  │
└─────────────────────────────────────────────┘
```

---

## Phase 8 — Seed Script

### seed/seed.py — run this ONCE before demo

```python
# 1. Create all 5 DynamoDB tables (skip if already exist)
# 2. Load buyers.json → put all 30 buyers into Buyers table
# 3. Load items.json → put all 15 items into Items table
# 4. Upload local photos from seed/photos/ to S3 (one folder per item_id)
# 5. Run orchestrator.process_return() on each item (pre-bakes all AI calls into GradeCache)
# 6. Print final status for each item
```

For step 4: take 15 product photos with your phone. Name them `ITM-001/front.jpg`, etc. Place in `seed/photos/`. The seed script uploads them and sets `photo_keys` on each item.

For step 5: this pre-populates `GradeCache` with grades, matches, and passports. All demo reads come from cache — instant, $0, no live-call risk.

---

## Phase 9 — Demo Script (record this exactly)

### Demo narrative (60 seconds)

**Part A — Buyer side (first 30 seconds):**
1. Open app as **Riya (BUY-001, Surat)**.
2. Show the recommendation feed. Top card: Nike Air Max 270, Grade B+, ₹1,850, "because you size up in Nike."
3. Tap it. Trust Passport opens. Show: "1 owner, returned for fit — not a defect. Saves 4.2 kg CO₂."
4. Add to cart. Order confirmation shows green impact + 50 credits.

**Part B — Intelligence reveal (next 20 seconds):**
5. Flip to Ops dashboard for ITM-001. Show: Grade B+, mismatch flag (listed US10 → really India 9), disposition resell, matches: Riya 0.5% risk vs Karan 29% risk.
6. Briefly show the risk formula: "same item, Riya sizes up in Nike = 0.5% vs serial returner Karan = 29%."

**Part C — Prevention loop (final 10 seconds):**
7. Open the ORIGINAL Nike Air Max 270 product page. Show the ⚠️ badge: "23 buyers found this runs small — consider sizing up." The return taught the catalog.

**One line for judges:** *"The same return that found its next best owner also corrected the listing so the next buyer never has to return it."*

---

## Phase 10 — Build Order

| Phase | Hours | What |
|---|---|---|
| 0 | 0–1h | env setup, AWS credentials, S3 buckets |
| 1 | 1–3h | DynamoDB tables created, reference JSON files in place |
| 2 | 3–5h | Seed data: write buyers.json + items.json, collect 15 photos |
| 3 | 5–11h | Agent ①: grading + compute_grade. Test until JSON is reliable. |
| 4 | 11–15h | Agents ④⑤⑥: disposition + pricing + green credits (pure code) |
| 5 | 15–21h | Agent ②: matching + risk formula + buyer recommendations |
| 6 | 21–25h | Agent ③: Trust Passport + HTML render + S3 upload |
| 7 | 25–27h | Agent ⑦: prevention (both mechanisms — listing correction + PDP flag) |
| 8 | 27–29h | Orchestrator: wire all agents in order. Test golden path. |
| 9 | 29–31h | Seed script: run full pipeline on all 15 items. Pre-bake cache. |
| 10 | 31–41h | Frontend: 5 screens. Use shadcn/ui, wire to endpoints. |
| 11 | 41–44h | End-to-end golden path test. Fix bugs. |
| 12 | 44–46h | Record demo video (follow demo script above exactly). |
| 13 | 46–47h | Draw architecture diagram. Write PRD sections. |
| 14 | 47–48h | Buffer. |
