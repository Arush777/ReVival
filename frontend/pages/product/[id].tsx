import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import AmazonHeader from "../../components/AmazonHeader";
import PreventionBadge from "../../components/PreventionBadge";
import { addToCart } from "../../lib/cart";
import catalogData from "../../data/catalog.json";
import { CatalogProduct } from "../../components/CatalogCard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const ALL_PRODUCTS: CatalogProduct[] = [
  ...(catalogData.heroes as CatalogProduct[]),
  ...(catalogData.filler as CatalogProduct[]),
];

interface WarningData {
  has_warning: boolean;
  flag_type?: "size" | "color" | "condition";
  return_count_for_reason?: number;
  recommendation?: string;
  flag_source?: "visual" | "claim" | "both";
  evidence?: string;
}

interface SecondLifeItem {
  item_id: string;
  status: string;
  grade: string;
  base_price_inr: number;
  return_hub_city: string;
  original_price_inr: number;
  photo_urls?: string[];
  co2_saved_kg: number;
}

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span style={{ color: "#FFA41C", fontSize: "14px", letterSpacing: "1px" }}>
      {"★".repeat(full)}<span style={{ color: "#ccc" }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}

export default function ProductPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const product = ALL_PRODUCTS.find((p) => p.catalog_id === id);

  const [warning, setWarning] = useState<WarningData | null>(null);
  const [secondLife, setSecondLife] = useState<SecondLifeItem | null>(null);
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [slImgError, setSlImgError] = useState(false);

  useEffect(() => {
    if (!product) return;
    setWarning(null);
    setSecondLife(null);

    const calls: Promise<void>[] = [];
    if (product.listing_id) {
      calls.push(
        fetch(`${API_BASE}/listings/${product.listing_id}/warning`)
          .then((r) => r.json())
          .then((d) => setWarning(d))
          .catch(() => {})
      );
    }
    if (product.second_life_item_id) {
      calls.push(
        fetch(`${API_BASE}/items/${product.second_life_item_id}`)
          .then((r) => r.json())
          // Only show the panel for a genuinely listed counterpart. An item
          // that graded D/REVIEW on a live return still exists but is not
          // listed — don't surface a "Buy it" panel for it.
          .then((d) => {
            if (!d.error && d.status === "listed") setSecondLife(d);
          })
          .catch(() => {})
      );
    }
    void Promise.all(calls);
  }, [product?.catalog_id]);

  function handleAddNew() {
    if (!product) return;
    addToCart({
      item_id: product.catalog_id,
      name: `${product.title} (New)`,
      brand: product.brand,
      grade: "NEW",
      price_inr: product.price_inr,
      photo_url: product.image,
      co2_saved_kg: 0,
      credits: 0,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  function handleBuyNew() {
    if (!product) return;
    const params = new URLSearchParams({
      total: String(product.price_inr),
      co2: "0",
      credits: "0",
      items: "1",
    });
    router.push(`/order-confirm?${params.toString()}`);
  }

  if (!product) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
        <AmazonHeader />
        <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px" }}>
          <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "32px", textAlign: "center", color: "#555" }}>
            {id ? "Product not found." : "Loading..."}{" "}
            <Link href="/" style={{ color: "#146EB4" }}>Back to home</Link>
          </div>
        </div>
      </div>
    );
  }

  const savings = secondLife ? product.price_inr - secondLife.base_price_inr : 0;
  const slPhoto = secondLife?.photo_urls?.[0];

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      <div style={{ backgroundColor: "#37475A", padding: "6px 16px", fontSize: "13px", color: "white" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span style={{ color: "#ccc", textTransform: "capitalize" }}>{product.category}</span>
          {" > "}
          <span>{product.title}</span>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap" }}>
          {/* Product image */}
          <div style={{ flexShrink: 0 }}>
            <div
              style={{
                width: "360px",
                height: "360px",
                backgroundColor: "white",
                borderRadius: "8px",
                border: "1px solid #ddd",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                overflow: "hidden",
              }}
            >
              {!imgError ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={product.image}
                  alt={product.title}
                  onError={() => setImgError(true)}
                  style={{ maxWidth: "92%", maxHeight: "92%", objectFit: "contain" }}
                />
              ) : (
                <span style={{ color: "#999" }}>No image</span>
              )}
            </div>
          </div>

          {/* Product details */}
          <div style={{ flex: 1, minWidth: "300px" }}>
            <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: "0 0 6px 0", color: "#0F1111" }}>
              {product.title}
            </h1>
            <div style={{ fontSize: "13px", color: "#146EB4", marginBottom: "4px" }}>
              Brand: {product.brand}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "12px" }}>
              <Stars rating={product.rating} />
              <span style={{ fontSize: "13px", color: "#007185" }}>
                {product.ratings_count.toLocaleString("en-IN")} ratings
              </span>
            </div>

            <div style={{ borderTop: "1px solid #eee", paddingTop: "12px", marginBottom: "16px" }}>
              <span style={{ fontSize: "13px", color: "#565959" }}>New: </span>
              <span style={{ fontSize: "28px", fontWeight: "bold", color: "#0F1111" }}>
                ₹{product.price_inr.toLocaleString("en-IN")}
              </span>
            </div>

            {/* Seller's listing description */}
            {product.seller_description && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0F1111", marginBottom: "4px" }}>
                  About this item
                </div>
                <p style={{ fontSize: "13px", color: "#333", lineHeight: 1.5, margin: 0 }}>
                  {product.seller_description}
                </p>
              </div>
            )}

            <div style={{ display: "flex", gap: "12px", marginBottom: "20px", flexWrap: "wrap" }}>
              <button
                onClick={handleAddNew}
                style={{
                  backgroundColor: added ? "#2d6a4f" : "#FF9900",
                  color: added ? "white" : "#000",
                  border: "none",
                  borderRadius: "20px",
                  padding: "10px 28px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  transition: "background-color 0.2s",
                }}
              >
                {added ? "✓ Added to Cart" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNew}
                style={{
                  backgroundColor: "#FFA41C",
                  color: "#000",
                  border: "none",
                  borderRadius: "20px",
                  padding: "10px 28px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                Buy Now
              </button>
            </div>

            {/* Prevention badge */}
            {warning?.has_warning && (
              <div style={{ marginBottom: "16px" }}>
                <PreventionBadge
                  flag_type={warning.flag_type!}
                  return_count_for_reason={warning.return_count_for_reason!}
                  recommendation={warning.recommendation!}
                  flag_source={warning.flag_source}
                  evidence={warning.evidence}
                />
              </div>
            )}

            {/* Second Life counterpart panel — the contrast */}
            {secondLife && (
              <div
                style={{
                  border: "2px solid #2d6a4f",
                  borderRadius: "8px",
                  padding: "16px",
                  backgroundColor: "#f1f8e9",
                  display: "flex",
                  gap: "16px",
                  alignItems: "center",
                  flexWrap: "wrap",
                }}
              >
                {/* Used photo */}
                <div
                  style={{
                    flexShrink: 0,
                    width: "96px",
                    height: "96px",
                    borderRadius: "6px",
                    overflow: "hidden",
                    backgroundColor: "white",
                    border: "1px solid #cde0cd",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {slPhoto && !slImgError ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={slPhoto}
                      alt="Second Life unit"
                      onError={() => setSlImgError(true)}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ color: "#999", fontSize: "10px" }}>No photo</span>
                  )}
                </div>

                <div style={{ flex: 1, minWidth: "200px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                    <LeafIcon />
                    <span style={{ fontWeight: "bold", fontSize: "14px", color: "#1b4332" }}>
                      Buy it Certified Second Life
                    </span>
                  </div>
                  <div style={{ fontSize: "13px", color: "#333", marginBottom: "2px" }}>
                    Grade {secondLife.grade} · Trust Passport included · ships from{" "}
                    {secondLife.return_hub_city}
                  </div>
                  <div style={{ marginBottom: "8px" }}>
                    <span style={{ fontSize: "22px", fontWeight: "bold", color: "#B12704" }}>
                      ₹{secondLife.base_price_inr.toLocaleString("en-IN")}
                    </span>
                    {savings > 0 && (
                      <span style={{ fontSize: "13px", color: "#2d6a4f", marginLeft: "8px", fontWeight: "bold" }}>
                        Save ₹{savings.toLocaleString("en-IN")} · {secondLife.co2_saved_kg} kg CO₂
                      </span>
                    )}
                  </div>
                  <Link
                    href={`/refurb/${secondLife.item_id}`}
                    style={{
                      backgroundColor: "#2d6a4f",
                      color: "white",
                      borderRadius: "4px",
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: "bold",
                      textDecoration: "none",
                      display: "inline-block",
                    }}
                  >
                    View Certified Second Life →
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
