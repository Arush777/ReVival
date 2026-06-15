import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import AmazonHeader from "../components/AmazonHeader";
import RecommendationCard, { RecommendationCardProps } from "../components/RecommendationCard";
import CatalogCard from "../components/CatalogCard";
import catalogData from "../data/catalog.json";
import { CatalogProduct } from "../components/CatalogCard";
import { getCart } from "../lib/cart";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

const ALL_CATALOG: CatalogProduct[] = [
  ...(catalogData.heroes as CatalogProduct[]),
  ...(catalogData.filler as CatalogProduct[]),
];

interface RecsResponse {
  buyer_id: string;
  items: RecommendationCardProps[];
}

// ─── Banner carousel ─────────────────────────────────────────────────────────

const BANNERS = [
  {
    bg: "#232F3E",
    accent: "#FF9900",
    headline: "Second Life, First Choice.",
    sub: "Certified Refurbished with Amazon Trust Passport. Verified condition. Ships fast.",
    cta: "Shop Second Life",
    href: "#second-life-deals",
    badge: "UP TO 70% OFF",
  },
  {
    bg: "#1a3a2a",
    accent: "#52b788",
    headline: "Every purchase plants a tree.",
    sub: "Each Second Life order offsets carbon. Earn Green Credits redeemable against your next Amazon order.",
    cta: "See Green Corner",
    href: "#green-corner",
    badge: "ECO CERTIFIED",
  },
  {
    bg: "#1a1a4a",
    accent: "#FF9900",
    headline: "Trending Near You.",
    sub: "Local certified items ship in 1–2 days, saving CO₂ on every delivery.",
    cta: "Trending Nearby",
    href: "#trending-nearby",
    badge: "FAST DELIVERY",
  },
];

function BannerCarousel() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const t = window.setInterval(() => setActive((a) => (a + 1) % BANNERS.length), 4500);
    return () => clearInterval(t);
  }, []);

  const b = BANNERS[active];

  return (
    <div
      style={{
        backgroundColor: b.bg,
        color: "white",
        padding: "32px 24px",
        position: "relative",
        overflow: "hidden",
        transition: "background-color 0.6s",
        minHeight: "160px",
        display: "flex",
        alignItems: "center",
      }}
    >
      <div style={{ maxWidth: "1200px", margin: "0 auto", width: "100%", display: "flex", alignItems: "center", gap: "24px" }}>
        <div style={{ flex: 1 }}>
          <span
            style={{
              backgroundColor: b.accent,
              color: b.bg,
              fontSize: "11px",
              fontWeight: "bold",
              padding: "3px 10px",
              borderRadius: "3px",
              letterSpacing: "0.5px",
              marginBottom: "10px",
              display: "inline-block",
            }}
          >
            {b.badge}
          </span>
          <div style={{ fontSize: "26px", fontWeight: "bold", lineHeight: "1.2", marginBottom: "8px" }}>
            {b.headline}
          </div>
          <div style={{ fontSize: "14px", color: "#ccc", marginBottom: "16px", maxWidth: "560px" }}>
            {b.sub}
          </div>
          <a
            href={b.href}
            style={{
              backgroundColor: b.accent,
              color: b.bg === "#232F3E" ? "#000" : "#fff",
              padding: "8px 20px",
              borderRadius: "4px",
              fontSize: "13px",
              fontWeight: "bold",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            {b.cta} →
          </a>
        </div>

        {/* Dots */}
        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
          {BANNERS.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              style={{
                width: "8px",
                height: "8px",
                borderRadius: "50%",
                border: "none",
                backgroundColor: i === active ? b.accent : "#666",
                cursor: "pointer",
                padding: 0,
                transition: "background-color 0.3s",
              }}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Category strip ───────────────────────────────────────────────────────────

const CATEGORIES = [
  { label: "Electronics", icon: "📱", color: "#146EB4" },
  { label: "Apparel", icon: "👕", color: "#146EB4" },
  { label: "Footwear", icon: "👟", color: "#146EB4" },
  { label: "Household", icon: "🏠", color: "#146EB4" },
  { label: "Green Corner ♻", icon: "🌿", color: "#2d6a4f" },
];

function CategoryStrip() {
  return (
    <div style={{ backgroundColor: "white", borderBottom: "1px solid #e0e0e0", padding: "0 16px" }}>
      <div
        style={{
          maxWidth: "1200px",
          margin: "0 auto",
          display: "flex",
          gap: "0",
          overflowX: "auto",
        }}
      >
        {CATEGORIES.map((cat) => (
          <a
            key={cat.label}
            href="#second-life-deals"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "10px 20px",
              textDecoration: "none",
              color: cat.color,
              fontSize: "12px",
              fontWeight: "600",
              whiteSpace: "nowrap",
              borderBottom: "2px solid transparent",
              transition: "border-color 0.2s",
              gap: "4px",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderBottomColor = cat.color)}
            onMouseLeave={(e) => (e.currentTarget.style.borderBottomColor = "transparent")}
          >
            <span style={{ fontSize: "18px" }}>{cat.icon}</span>
            {cat.label}
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Green Corner savings widget ─────────────────────────────────────────────

function GreenCornerWidget({ items }: { items: RecommendationCardProps[] }) {
  const totalCo2 = items.reduce((sum, i) => sum + (i.co2_saved_kg ?? 0), 0);
  const totalCredits = items.reduce((sum, i) => sum + (i.credits ?? 0), 0);
  const topEco = [...items].sort((a, b) => (b.co2_saved_kg ?? 0) - (a.co2_saved_kg ?? 0)).slice(0, 3);

  return (
    <div
      id="green-corner"
      style={{
        backgroundColor: "#f0faf4",
        border: "1px solid #b7e4c7",
        borderRadius: "8px",
        padding: "20px 24px",
        marginBottom: "32px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <span style={{ fontSize: "22px" }}>🌿</span>
        <div>
          <div style={{ fontWeight: "bold", fontSize: "16px", color: "#1b4332" }}>Green Corner</div>
          <div style={{ fontSize: "13px", color: "#2d6a4f" }}>
            These {items.length} items collectively save{" "}
            <strong>{totalCo2.toFixed(1)} kg CO₂</strong> and earn{" "}
            <strong>{totalCredits} green credits</strong>
          </div>
        </div>
      </div>
      <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
        {topEco.map((item) => (
          <a
            key={item.item_id}
            href={`/refurb/${item.item_id}`}
            style={{
              backgroundColor: "white",
              border: "1px solid #b7e4c7",
              borderRadius: "6px",
              padding: "8px 12px",
              textDecoration: "none",
              color: "#1b4332",
              fontSize: "12px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
              minWidth: "140px",
            }}
          >
            <span style={{ fontWeight: "bold", color: "#0F1111", fontSize: "13px" }}>
              {item.brand} {item.name?.split(" ").slice(0, 3).join(" ")}
            </span>
            <span style={{ color: "#2d6a4f" }}>🍃 {item.co2_saved_kg} kg CO₂ saved</span>
            <span style={{ color: "#555" }}>+{item.credits} credits</span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Compact tile for Trending Nearby grid ────────────────────────────────────

function TrendingTile({ item }: { item: RecommendationCardProps }) {
  const savingsPct = item.original_price_inr
    ? Math.round(((item.original_price_inr - item.price_inr) / item.original_price_inr) * 100)
    : 0;

  return (
    <a
      href={`/refurb/${item.item_id}`}
      style={{
        backgroundColor: "white",
        border: "1px solid #ddd",
        borderRadius: "8px",
        overflow: "hidden",
        textDecoration: "none",
        color: "#0F1111",
        display: "flex",
        flexDirection: "column",
        transition: "box-shadow 0.2s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.12)")}
      onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "none")}
    >
      <div
        style={{
          width: "100%",
          aspectRatio: "1",
          backgroundColor: "#f5f5f5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
      >
        {item.photo_url ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={item.photo_url}
            alt={item.name}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ color: "#bbb", fontSize: "11px" }}>No photo</span>
        )}
      </div>
      <div style={{ padding: "10px" }}>
        <div style={{ fontSize: "12px", color: "#555", marginBottom: "2px" }}>{item.brand}</div>
        <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "4px", lineHeight: "1.3" }}>
          {item.name}
        </div>
        <div style={{ display: "flex", gap: "6px", alignItems: "baseline", marginBottom: "4px" }}>
          <span style={{ fontSize: "15px", fontWeight: "bold", color: "#B12704" }}>
            ₹{item.price_inr.toLocaleString("en-IN")}
          </span>
          {savingsPct > 0 && (
            <span style={{ fontSize: "11px", color: "#2d6a4f" }}>-{savingsPct}%</span>
          )}
        </div>
        <div style={{ fontSize: "11px", color: "#555" }}>
          📍 {item.return_hub_city} · {item.distance_km ?? "—"} km away
        </div>
        <div style={{ fontSize: "11px", color: "#2d6a4f", marginTop: "2px" }}>
          🍃 {item.co2_saved_kg} kg CO₂ saved
        </div>
      </div>
    </a>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  const router = useRouter();
  const modeParam = router.query.mode;
  const initialMode: "Second Life" | "All" = modeParam === "all" ? "All" : "Second Life";

  const [personalised, setPersonalised] = useState<RecommendationCardProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const cartIds = getCart()
      .map((c) => c.item_id)
      .join(",");
    const cartParam = cartIds ? `&cart=${encodeURIComponent(cartIds)}` : "";

    fetch(`${API_BASE}/buyers/${BUYER_ID}/recommendations?limit=12${cartParam}`)
      .then((r) => r.json())
      .then((data: RecsResponse) => {
        if (data.items) {
          setPersonalised(data.items);
        } else if ((data as any).error) {
          setError((data as any).error.message ?? "Could not load recommendations.");
        }
      })
      .catch(() => setError("Backend unavailable — make sure it is running on port 8000."))
      .finally(() => setLoading(false));
  }, []);

  // "Trending Nearby" = same items sorted ascending by distance
  const trendingNearby = [...personalised].sort(
    (a, b) => (a.distance_km ?? 9999) - (b.distance_km ?? 9999)
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED", fontFamily: "Arial, sans-serif" }}>
      <AmazonHeader initialMode={initialMode} />
      <BannerCarousel />
      <CategoryStrip />

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        {/* Error state */}
        {error && (
          <div
            style={{
              border: "1px solid #f5c6cb",
              backgroundColor: "#f8d7da",
              borderRadius: "6px",
              padding: "16px",
              color: "#721c24",
              fontSize: "14px",
              marginBottom: "24px",
            }}
          >
            {error}
          </div>
        )}

        {/* Green Corner widget (only when we have data) */}
        {!loading && personalised.length > 0 && <GreenCornerWidget items={personalised} />}

        {/* ── Section 1: Personalised Second Life Deals ── */}
        <section id="second-life-deals" style={{ marginBottom: "40px" }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "4px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#0F1111" }}>
              Second Life Deals For You
            </h2>
            <span style={{ fontSize: "13px", color: "#007185" }}>AI-personalised picks</span>
          </div>
          <p style={{ fontSize: "13px", color: "#555", margin: "0 0 16px 0" }}>
            Matched to your size, brand preferences, and return history. Verified condition.
          </p>

          {loading && (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
              Loading your personalised picks...
            </div>
          )}

          {!loading && !error && personalised.length === 0 && (
            <div style={{ color: "#555", fontSize: "14px" }}>No recommendations available.</div>
          )}

          {!loading && personalised.length > 0 && (
            <div>
              <div style={{ fontSize: "13px", color: "#555", marginBottom: "16px" }}>
                {personalised.length} items matched for you
              </div>
              {personalised.map((item) => (
                <RecommendationCard key={item.item_id} {...item} />
              ))}
            </div>
          )}
        </section>

        {/* ── Section 2: Trending Nearby ── */}
        {!loading && trendingNearby.length > 0 && (
          <section id="trending-nearby" style={{ marginBottom: "40px" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "4px" }}>
              <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#0F1111" }}>
                Trending Nearby
              </h2>
              <span style={{ fontSize: "13px", color: "#007185" }}>Low-carbon local shipping</span>
            </div>
            <p style={{ fontSize: "13px", color: "#555", margin: "0 0 16px 0" }}>
              Items closest to you — faster delivery, smaller footprint.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(175px, 1fr))",
                gap: "12px",
              }}
            >
              {trendingNearby.slice(0, 8).map((item) => (
                <TrendingTile key={item.item_id} item={item} />
              ))}
            </div>
          </section>
        )}

        {/* ── Section 3: Shop on Amazon (catalog grid) ── */}
        <section>
          <div style={{ display: "flex", alignItems: "baseline", gap: "12px", marginBottom: "4px" }}>
            <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: 0, color: "#0F1111" }}>
              Shop on Amazon
            </h2>
            <span style={{ fontSize: "13px", color: "#007185" }}>
              ♻ badge = Second Life option available
            </span>
          </div>
          <p style={{ fontSize: "13px", color: "#555", margin: "0 0 20px 0" }}>
            Products with a green ♻ badge have a Certified Second Life option available.
          </p>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
              gap: "12px",
            }}
          >
            {ALL_CATALOG.map((product) => (
              <CatalogCard key={product.catalog_id} product={product} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
