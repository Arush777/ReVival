# Second Life Commerce — Full Context & Reasoning
> This is the "why" document. Read this to understand every decision. The action_plan.md is the "what to build." This explains the thinking behind it.

---

## What We're Building

An **AI-powered circular commerce ecosystem** for Amazon. When a product is returned, instead of sitting in a warehouse or going to landfill, it automatically:
1. Gets graded by AI vision
2. Gets matched to the one buyer who will never return it again
3. Gets priced cheaper for buyers near the return hub (faster clearance, less shipping)
4. Gets a verified condition report (Trust Passport) that makes buyers trust second-hand
5. Corrects the listing error that caused the return — so the next buyer never has to return it

The PS phrase that defines the entire system: **"find its next best owner."** This is a matching problem, not a storage problem. Most teams build a refurb catalog. We build a re-homing engine.

---

## Why This Problem Statement

We chose Second Life Commerce over the other three themes (Smart Home, Amazon Now, CampusFlow) for four reasons:

**1. Global disruption with real numbers.** Returns cost Amazon billions annually. Every return has three victims: the customer (hassle), the seller (lost revenue), and the planet (waste + reverse logistics CO₂). A solution here has measurable impact that can be quantified in the demo.

**2. Demo-ability in 48 hours.** AI quality-grading from a photo is visually compelling — a judge watching a video instantly understands what just happened. There's no better demo moment in any of the four themes.

**3. Uniquely Amazon.** Only Amazon has the buyer purchase history, fulfillment network, and brand trust to build this. A startup can't copy it. Back Market has the catalog. eBay has the marketplace. Only Amazon has all three. This "moat" argument scores well under business relevance.

**4. The PS explicitly asks for all our features.** Exchange, P2P resale, quality grading, green credits, prevention, personalized recommendations — each bullet in the PS maps to a specific agent we've built. Judges cross-reference against the PS.

---

## The Three Pillars + What We Added Back

### Original scope (3 pillars)
1. **Triage** — grade the item, route it (resell/refurb/donate/recycle)
2. **Prevent** — catch the listing error, warn future buyers
3. **Liquidate locally** — geo-aware pricing for faster clearance

### What we reinstated and why

**Exchange → "Trade-In Credit"**
The PS explicitly lists "exchange" as a route. We originally dropped it for encouraging churn. The fix is framing: instead of cash refund → the system issues store credit that can only be redeemed on second-life items. Money stays in the ecosystem. Item gets re-routed through the same grading pipeline. This is ~20 extra lines in the disposition engine.

**P2P Resale → "Community Listing"**
The PS explicitly asks for "easy peer-to-peer resale inside Amazon's trusted ecosystem." The insight: we don't build a new marketplace. We give P2P sellers access to the **same grading pipeline and Trust Passport**. The grading agent IS the trust mechanism. A community-listed item gets graded, gets a Trust Passport, and appears in the recommendation feed. Seller keeps the item and ships directly. Zero new infra.

**Prevention — Split into Two Mechanisms**
Original was vague. Now it's two distinct, well-scoped things:
- **Supply-side:** when an item is re-listed after grading, its listing attributes are auto-corrected (listed_size becomes detected_size). The wrong information can never re-enter the system.
- **Demand-side:** a PDP widget on the *original* product page reads from `ListingFlags` and shows "23 buyers found this runs small." This is the "predictive return prevention before a purchase is even made" bullet in the PS. It's pure code — no AI — just a count query.

---

## The Agentic Architecture — Why This Structure

We designed a **fleet of specialized agents** rather than one monolithic AI call because:

1. **Each agent has a clear, narrow job** — this maps to the "agent" metaphor cleanly and judges respond well to it architecturally.
2. **Most agents are pure code** — of 7 agents, only 3 call an LLM. The other 4 are deterministic rules. This means "7 agents" doesn't mean 7× cost.
3. **LLM does what code can't** — the LLM's job is interpreting product-specific evidence from images and messy natural language ("too tight," "colors off") into structured signals. Code owns normalization, validation, routing, pricing, caching, and auditability. This separation is the key to consistency.

### Why Sonnet for grading, Haiku for text

Grading involves **image analysis** — the quality of vision interpretation directly affects the demo's money-shot (the grade + mismatch detection). Sonnet 4.6 has meaningfully better vision than Haiku. The cost difference is ~$0.01 per grading call — irrelevant at demo scale.

Matching and passport generation are **text reasoning tasks** — Haiku 4.5 handles these well at $0.002 per call.

Never use Opus for any of these. It's 5× more expensive than Sonnet and does not accept `temperature: 0` (returns API error), which breaks our consistency strategy.

### How grading stays product-general but stable

The first version of grading should not hardcode "wear level <= 4 means Grade B." That looks deterministic, but it is arbitrary because a scuff on a shoe, an opened food packet, a missing phone charger, and a stained saree do not mean the same thing. The LLM should assign the condition grade using a universal resale rubric: A new-like, B light wear, C usable but visibly worn/minor repair, D not resellable, and REVIEW when evidence is weak.

The deterministic layer wraps around the LLM:
- Canonicalize images before grading: stable order, EXIF orientation, RGB JPEG, fixed size, fixed quality.
- Send stable metadata only: category, brand, product name/title, listed attributes, return reason, and history note.
- Force enum JSON output: no floating scores, no prose-only answers, no invented fields.
- Let code apply only objective blockers: non-functional, safety/hygiene issue, low confidence, or missing evidence goes to D or REVIEW.
- Cache by content hash: same canonical photos + same metadata + same rubric + same prompt + same model = same stored result.

That means grading is not "hardcoded for Nike shoes." It works for any product category the demo throws at it, while the filmed demo remains stable because all seed items are pre-graded in `GradeCache`.

---

## The Matching Algorithm — Deeper Explanation

### Why re-return risk, not "item similarity"

A conventional recommendation engine matches on item attributes: "you bought Nike, here's more Nike." That's not good enough here. We want the buyer least likely to return the item again — which requires reasoning about *why the last person returned it* and whether this buyer has the opposite trait.

This is why the return reason code is a **first-class signal**, not metadata. "Runs small" returned by person A is a perfect match for person B who sizes up — the very reason it was returned is the reason someone else will love it.

### Why two stages

Stage 1 is a cheap DynamoDB query that filters 30 million buyers → ~50 candidates using hard attributes (region, category, size compatibility). Stage 2 is the expensive LLM call that soft-ranks those 50. This pattern (retrieve-then-rerank) is standard in production recommendation systems and is exactly the right answer when a judge asks "how does this scale to millions of users?"

### Why discretized signals (not 0–1 floats from the LLM)

If you ask an LLM "rate this from 0 to 1," you might get 0.73 one time and 0.69 another for identical input. A different response each time = different ranking = inconsistent demo. If you ask for "none / partial / strong," the model collapses its uncertainty into 3 buckets. A tiny wobble in the model's internal confidence stays in the same bucket, maps to the same float (0.0 / 0.5 / 1.0), and produces the same score. Consistent output from controlled input.

### The eco-loyalty boost (Tier 1 green credits)

Buyers with high `credit_score` (accumulated from eco-friendly behavior) get a tiny risk reduction (max 0.05). This means if two buyers have similar risk scores, the eco-loyal buyer gets offered the item first. This creates a behavioral loop: buying second-life → earn credits → get priority access → more likely to buy second-life again. Cost to Amazon: $0. This is the "Tier 1 Priority Access" green credit feature.

---

## Green Credits — Why This Design

Most hackathon teams will implement a points system with arbitrary numbers: "buy refurb, get 50 points." Judges will ask "why 50?" and there's no answer.

Our credits are grounded in **actual CO₂e avoided**, computed from a carbon lifecycle table. The formula:
- Manufacturing CO₂e saved (buying refurb instead of new) — the big number
- Shipping CO₂e saved (local sale vs national average shipping)

The specific numbers come from public lifecycle analysis data (shoes: ~14 kg CO₂e to manufacture, ~0.8 kg weight, 0.1g CO₂ per km per kg for shipping). You can cite these if asked.

### The three redemption tiers and why each exists

**Tier 1 — Priority Access (affects matching algorithm):** Zero cost to Amazon. Creates the behavioral loop described above. The key insight is that credits become a product *signal*, not just a user score.

**Tier 2 — Second-life discount:** A direct financial incentive to stay in the circular economy. The discount only applies to refurbished items — not new. This is enforced in the frontend at redemption time.

**Tier 3 — NGO donation:** The emotionally resonant moment. "Your 200 credits funded a tree planting." This is what users screenshot and share. The shareable moment on the order confirmation screen maps to this tier.

**Green provenance as a ranking signal:** Between two similar second-life items, the one routed locally (shorter shipping, less CO₂) ranks higher in the recommendation feed. Credits become a quality dimension of the product, not just a user reward.

---

## Prevention — The Closed Loop

This is the system's most elegant feature and should be narrated clearly in the demo:

> A return comes in → AI detects the listing error (wrong size, wrong color) → fixes the listing going forward → writes a count to ListingFlags → future buyers see the warning on the PDP → fewer returns.

The loop: **returns fund prevention.** Every return that goes through the system makes the catalog more accurate. At Amazon's scale (hundreds of millions of listings), even a 1% improvement in listing accuracy is enormous — this is the Future Vision slide's opening line.

The two mechanisms are deliberately separate:
- **Supply-side:** ensures the returned item itself can't be re-listed wrong.
- **Demand-side:** ensures the original listing gets a warning. These are different items (one is the physical return, one is the new inventory on the shelf).

---

## The Buyer-Side Recommendation Feed — The Key UX Shift

We changed from item-centric (assign an item to its best owner) to buyer-centric (show a buyer their best second-life options). Both use the exact same matching engine — it's just the direction of the query that changes.

**Why buyer-centric is better for the demo:**
- Judges immediately recognize the "Amazon recommended for you" experience
- The "Why this fits you" card line surfaces the matching intelligence visually — most rec engines are opaque, ours explains itself
- The Trust Passport is reached from a recommendation card — much more natural than from an ops dashboard

**The item-centric direction isn't dropped** — it's retained as a background job for high-value or perishable items that need to be moved quickly. The system proactively notifies the single best-matched buyer. This is the "right person for a ₹40,000 phone" use case.

---

## Data Layer Design Decisions

### Why DynamoDB (not Postgres, not MongoDB)

DynamoDB is the natural choice for this AWS-native demo. More importantly, it's **NoSQL/document-style** — our buyer profiles have nested arrays (return_history, preferences) and maps (size_profile) that would require 3+ joined tables in SQL. In DynamoDB it's a single record.

The scalable matching path is a materialized `BuyerInterestIndex`: one row per buyer interest category, keyed by `category` and `region#buyer_id`. DynamoDB cannot query array elements inside `category_interests`, so this index is what lets Stage 1 retrieve category-compatible buyers without scanning the Buyers table. The Items table also has a `StatusCategoryIndex` so buyer recommendation feeds query listed items by category instead of scanning inventory.

### Why seed JSON in repo (not a real RAG vector store)

The reference data (size maps, carbon tables, demand tables) is:
- Read-only (it never changes during the demo)
- Tiny (30-50 rows each)
- Looked up by exact key (no fuzzy search needed)

A real RAG/vector store is the production path (Bedrock Knowledge Base + OpenSearch). For the demo, loading a JSON file at startup is functionally identical and eliminates a complex dependency. The architecture diagram shows the production version — we present the full Bedrock Agent + KB setup there.

### Why content-hash caching is mandatory

An LLM is not bit-for-bit deterministic even at temperature 0. Running the same grading call twice can produce slightly different output. On camera, this is catastrophic — the grade might change. The content-hash cache (`GradeCache` table) provides the only **hard guarantee**: same canonical images + same metadata + same rubric + same prompt version + same model = same result, always, because we never call the model for the same input twice.

The cache also pre-bakes the demo: running the seed script once populates all 15 items' grades, matches, and passports into the cache. The filmed demo reads cached results — instant, $0, zero on-camera risk.

---

## India-Specific Context

This is a hackathon for Indian students judged by Amazon India. The solution should feel rooted in the Indian market:

**Sizing:** Indian sizing is different from US/UK/EU. A US10 shoe is India 9. A shirt labeled "L" by an international brand may fit like "M" by Indian standards. Our size_standard_map.json explicitly handles this. The hero demo item (Nike Air Max 270) returns because of exactly this mismatch — this is a very real pain point for Indian shoppers.

**Cities:** All hub cities, buyer cities, and demand tables use Indian metros (Bangalore, Mumbai, Delhi, Surat, Ahmedabad, Chennai, Pune, Hyderabad). The geo-pricing story (item returned in Bangalore → priced cheaper for Surat buyer 440 km away vs Delhi buyer 2100 km away) is concrete and believable.

**Categories:** Include kurta, saree, regional food products (Rajasthani pickle, MTR chilli powder) alongside global brands. This makes the dataset feel real.

**Return behavior:** Indian e-commerce has a high return rate for apparel (size/color mismatch is the #1 reason) and electronics (changed mind is common due to EMI purchase behavior). The 15 hero items reflect this.

---

## Six-Month Vision

**0–3 months:** Current MVP — grading, matching, Trust Passport, geo-pricing, prevention widget, green credits. India launch, top 10 categories.

**3–6 months:**
- **Seller Central prevention loop:** Return cost breakdown per listing with an AI-generated "accuracy improvement prompt" — "Your Nike Air Max listing has 7.3% returns for size mismatch. Updating to show Indian sizing would reduce returns by ~40%." This is the B2B version of prevention.
- **Expanded Trust Passport:** video inspection option (seller-uploaded unboxing video for high-value items).
- **Green credits marketplace:** third-party redemption (Zepto grocery discount, IRCTC carbon offset, Zomato eco-friendly delivery).

**6–12 months:**
- **Learning loop:** matching outcomes (did the matched buyer keep the item?) feed back as labels to improve the re-return risk formula over time. The system gets smarter with every matched item.
- **Cross-category routing:** a returned camera that can't be resold in India gets routed to an NGO that trains rural photographers. The disposition engine connects to a real NGO needs feed.
- **Multi-segment expansion:** the same grading + matching pipeline works for grocery (near-expiry routing), fashion (seasonal demand routing), and B2B (seller liquidation). Amazon's fulfillment data is the differentiator in every segment.

**The one-line vision for the slide:**
> *"Every return becomes a signal that makes the next purchase smarter — until returns are rare, refurb is trusted, and every product finds its highest-value next life, automatically."*

---

## Judging Criteria Map

| Criterion | How we score it |
|---|---|
| **Innovativeness** | Return-reason-as-matching-signal is novel. No existing re-commerce platform does this. |
| **Degree of disruption** | Affects millions of returns globally. Quantifiable ROI for Amazon (reduced return cost + recovered resale value + reduced returns via prevention). |
| **Quality of presentation** | One item, full end-to-end in 60 seconds. Every screen maps to a PS bullet. |
| **Quality of implementation** | Working prototype, real Bedrock calls, real DynamoDB/S3, pre-baked for flawless demo. |
| **Scalability** | Two-stage matching (retrieve-then-rerank), DynamoDB GSI, event-driven SQS backbone in production diagram, stateless Lambda. |
| **Futuristic vision** | Learning loop, Seller Central prevention, cross-category expansion, multi-segment. 6-month roadmap is specific and quantified. |

---

## The Pitch Line

> *"One AI engine that gives every returned item its best second life — grading it honestly, matching it to the one buyer who will never return it, pricing it to clear fast and green, and closing the loop so the same mistake never causes a return again."*

---

## What Not to Build (Scope Discipline)

These belong in the Future Vision section only — never in the demo:
- Real-time inventory tracking across fulfillment centers
- Training a custom computer vision model (use Bedrock/Sonnet vision — it's better and instant)
- A full P2P marketplace with payments, disputes, ratings
- Live maps API integration (use haversine formula + city coords JSON)
- Real NGO API integration
- Actual review mining from Amazon's real review corpus

The demo should show one item going through the full pipeline beautifully. Everything else is a roadmap story.
