import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import AmazonHeader from "../../components/AmazonHeader";
import PreventionBadge from "../../components/PreventionBadge";
import { addToCart } from "../../lib/cart";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const NIKE_NEW_PRICE = 9999;

interface WarningData {
  listing_id: string;
  has_warning: boolean;
  flag_type?: "size" | "color";
  return_count_for_reason?: number;
  recommendation?: string;
  evidence?: string;
  last_item_id?: string;
}

interface SecondLifeItem {
  item_id: string;
  brand: string;
  name: string;
  grade: string;
  base_price_inr: number;
  return_hub_city: string;
  original_price_inr: number;
  co2_saved_kg: number;
  credits: number;
}

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const [warning, setWarning] = useState<WarningData | null>(null);
  const [secondLife, setSecondLife] = useState<SecondLifeItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [addedNew, setAddedNew] = useState(false);

  function handleAddNew() {
    addToCart({
      item_id: "NIKE-NEW-270",
      name: "Nike Air Max 270 (New)",
      brand: "Nike",
      grade: "NEW",
      price_inr: NIKE_NEW_PRICE,
      photo_url: "",
      co2_saved_kg: 0,
      credits: 0,
    });
    setAddedNew(true);
    window.setTimeout(() => setAddedNew(false), 1800);
  }

  function handleBuyNew() {
    const params = new URLSearchParams({
      total: String(NIKE_NEW_PRICE),
      co2: "0",
      credits: "0",
      items: "1",
    });
    router.push(`/order-confirm?${params.toString()}`);
  }

  useEffect(() => {
    if (!id) return;

    Promise.all([
      fetch(`${API_BASE}/listings/${id}/warning`).then((r) => r.json()),
      fetch(`${API_BASE}/items/ITM-001`).then((r) => r.json()),
    ])
      .then(([warningData, itemData]) => {
        setWarning(warningData);
        if (!itemData.error) setSecondLife(itemData);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

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
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span style={{ color: "#ccc" }}>Shoes</span>
          {" > "}
          <span>Nike Air Max 270</span>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
          {/* Product images placeholder */}
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                width: "340px",
                height: "340px",
                backgroundColor: "#f0f0f0",
                borderRadius: "8px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#999",
                fontSize: "14px",
              }}
            >
              [Product Photos — 4 images]
            </div>
          </div>

          {/* Product details */}
          <div style={{ flex: 1, minWidth: "280px" }}>
            <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 6px 0", color: "#0F1111" }}>
              Nike Air Max 270
            </h1>
            <div style={{ fontSize: "13px", color: "#007185", marginBottom: "6px" }}>
              ★★★★☆ 2,341 ratings
            </div>
            <div style={{ fontSize: "26px", fontWeight: "bold", color: "#0F1111", marginBottom: "16px" }}>
              ₹9,999
            </div>

            <div style={{ display: "flex", gap: "12px", marginBottom: "24px" }}>
              <button
                onClick={handleAddNew}
                style={{
                  backgroundColor: addedNew ? "#2d6a4f" : "#FF9900",
                  color: addedNew ? "white" : "#000",
                  border: "none",
                  borderRadius: "4px",
                  padding: "10px 24px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
              >
                {addedNew ? "✓ Added to Cart" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNew}
                style={{
                  backgroundColor: "#FFA41C",
                  color: "#000",
                  border: "none",
                  borderRadius: "4px",
                  padding: "10px 24px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Buy Now
              </button>
            </div>

            {/* Prevention badge */}
            {!loading && warning?.has_warning && (
              <div style={{ marginBottom: "16px" }}>
                <PreventionBadge
                  flag_type={warning.flag_type!}
                  return_count_for_reason={warning.return_count_for_reason!}
                  recommendation={warning.recommendation!}
                />
              </div>
            )}

            {/* Second Life option */}
            {!loading && secondLife && (
              <div
                style={{
                  border: "1px solid #b2d8b2",
                  borderRadius: "8px",
                  padding: "14px 16px",
                  backgroundColor: "#f1f8e9",
                  marginBottom: "16px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    marginBottom: "6px",
                  }}
                >
                  <LeafIcon />
                  <span
                    style={{
                      fontWeight: "bold",
                      fontSize: "14px",
                      color: "#1b4332",
                    }}
                  >
                    SECOND LIFE OPTION AVAILABLE
                  </span>
                </div>
                <p style={{ margin: "0 0 6px 0", fontSize: "13px", color: "#333" }}>
                  Grade {secondLife.grade} certified · ₹{secondLife.base_price_inr.toLocaleString("en-IN")} · Trust Passport included
                </p>
                <p style={{ margin: "0 0 10px 0", fontSize: "13px", color: "#2d6a4f" }}>
                  Save ₹{(secondLife.original_price_inr - secondLife.base_price_inr).toLocaleString("en-IN")} vs new · ships from {secondLife.return_hub_city}
                </p>
                <Link
                  href="/refurb/ITM-001"
                  style={{
                    color: "#146EB4",
                    fontSize: "13px",
                    fontWeight: "bold",
                    textDecoration: "underline",
                  }}
                >
                  View Certified Second Life →
                </Link>
              </div>
            )}

            {loading && (
              <div style={{ fontSize: "13px", color: "#888" }}>Loading alerts...</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
