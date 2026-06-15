import Link from "next/link";
import { useEffect, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export interface CatalogProduct {
  catalog_id: string;
  title: string;
  brand: string;
  category: string;
  color?: string;
  price_inr: number;
  rating: number;
  ratings_count: number;
  image: string;
  listing_id?: string;
  second_life_item_id?: string;
  seller_description?: string;
}

function Stars({ rating }: { rating: number }) {
  const full = Math.round(rating);
  return (
    <span style={{ color: "#FFA41C", fontSize: "12px", letterSpacing: "1px" }}>
      {"★".repeat(full)}
      <span style={{ color: "#ccc" }}>{"★".repeat(5 - full)}</span>
    </span>
  );
}

export default function CatalogCard({ product }: { product: CatalogProduct }) {
  const [imgError, setImgError] = useState(false);
  // Backend-driven badge: a Second Life option exists only when the referenced
  // item has actually been graded and listed. Items that list LIVE on return
  // (Adidas, Levi's) start with no listed counterpart, so the badge stays
  // hidden until a return creates one — then it flips on automatically.
  const [hasSecondLife, setHasSecondLife] = useState(false);

  useEffect(() => {
    if (!product.second_life_item_id) {
      setHasSecondLife(false);
      return;
    }
    let cancelled = false;
    fetch(`${API_BASE}/items/${product.second_life_item_id}`)
      .then((r) => r.json())
      .then((d) => {
        if (!cancelled) setHasSecondLife(!d.error && d.status === "listed");
      })
      .catch(() => {
        if (!cancelled) setHasSecondLife(false);
      });
    return () => {
      cancelled = true;
    };
  }, [product.second_life_item_id]);

  const href = hasSecondLife && product.second_life_item_id
    ? `/refurb/${product.second_life_item_id}`
    : `/search?q=${encodeURIComponent(product.title)}&mode=all`;

  return (
    <Link
      href={href}
      style={{
        backgroundColor: "white",
        borderRadius: "8px",
        border: "1px solid #ddd",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        textDecoration: "none",
        color: "#0F1111",
        height: "100%",
        position: "relative",
      }}
    >
      {hasSecondLife && (
        <span
          style={{
            position: "absolute",
            top: "8px",
            left: "8px",
            backgroundColor: "#2d6a4f",
            color: "white",
            fontSize: "10px",
            fontWeight: "bold",
            borderRadius: "4px",
            padding: "2px 7px",
            zIndex: 1,
          }}
        >
          ♻ SECOND LIFE
        </span>
      )}

      <div
        style={{
          width: "100%",
          height: "170px",
          backgroundColor: "#fff",
          borderRadius: "4px",
          overflow: "hidden",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: "10px",
        }}
      >
        {!imgError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={product.image}
            alt={product.title}
            onError={() => setImgError(true)}
            style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }}
          />
        ) : (
          <span style={{ color: "#999", fontSize: "12px" }}>No image</span>
        )}
      </div>

      <div style={{ fontSize: "13px", fontWeight: "bold", lineHeight: 1.3, marginBottom: "4px" }}>
        {product.title}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "5px", marginBottom: "6px" }}>
        <Stars rating={product.rating} />
        <span style={{ fontSize: "11px", color: "#007185" }}>
          {product.ratings_count.toLocaleString("en-IN")}
        </span>
      </div>

      <div style={{ marginTop: "auto" }}>
        <span style={{ fontSize: "18px", fontWeight: "bold", color: "#0F1111" }}>
          ₹{product.price_inr.toLocaleString("en-IN")}
        </span>
        {hasSecondLife && (
          <div style={{ fontSize: "12px", color: "#2d6a4f", fontWeight: "bold", marginTop: "2px" }}>
            Second Life option available →
          </div>
        )}
      </div>
    </Link>
  );
}
