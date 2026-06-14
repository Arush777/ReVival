import { useEffect, useState } from "react";
import AmazonHeader from "../components/AmazonHeader";
import RecommendationCard, { RecommendationCardProps } from "../components/RecommendationCard";
import CatalogCard from "../components/CatalogCard";
import catalogData from "../data/catalog.json";
import { CatalogProduct } from "../components/CatalogCard";

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

export default function HomePage() {
  const [items, setItems] = useState<RecommendationCardProps[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE}/buyers/${BUYER_ID}/recommendations?limit=10`)
      .then((r) => r.json())
      .then((data: RecsResponse) => {
        if (data.items) {
          setItems(data.items);
        } else if ((data as any).error) {
          setError((data as any).error.message ?? "Could not load recommendations.");
        }
      })
      .catch(() => setError("Backend unavailable — make sure it is running on port 8000."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      {/* Sub-nav */}
      <div
        style={{
          backgroundColor: "#37475A",
          padding: "6px 16px",
          fontSize: "13px",
          color: "white",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <span style={{ color: "#ccc" }}>Home</span>
          {" > "}
          <span style={{ color: "#ccc" }}>Second Life</span>
          {" > "}
          <span>Picks for you</span>
        </div>
      </div>

      {/* Main */}
      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 4px 0", color: "#0F1111" }}>
          Certified Second Life — Picked for You
        </h1>
        <p style={{ fontSize: "13px", color: "#555", margin: "0 0 20px 0" }}>
          AI-matched returns with Trust Passports. Verified condition. Ships fast.
        </p>

        {loading && (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
            Loading your personalised picks...
          </div>
        )}

        {error && (
          <div
            style={{
              border: "1px solid #f5c6cb",
              backgroundColor: "#f8d7da",
              borderRadius: "6px",
              padding: "16px",
              color: "#721c24",
              fontSize: "14px",
            }}
          >
            {error}
          </div>
        )}

        {!loading && !error && items.length === 0 && (
          <div style={{ color: "#555", fontSize: "14px" }}>No recommendations available.</div>
        )}

        {!loading && items.length > 0 && (
          <div>
            <div style={{ fontSize: "13px", color: "#555", marginBottom: "16px" }}>
              {items.length} items matched for you
            </div>
            {items.map((item) => (
              <RecommendationCard key={item.item_id} {...item} />
            ))}
          </div>
        )}

        {/* Catalog grid */}
        <div style={{ marginTop: "40px" }}>
          <h2 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 4px 0", color: "#0F1111" }}>
            Shop on Amazon
          </h2>
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
        </div>
      </div>
    </div>
  );
}
