import Link from "next/link";
import { useState } from "react";
import { addToCart, isInCart } from "../lib/cart";

export interface RecommendationCardProps {
  item_id: string;
  brand: string;
  name: string;
  category: string;
  grade: string;
  original_price_inr: number;
  price_inr: number;
  photo_url: string;
  passport_url: string;
  return_hub_city: string;
  ship_eta_days: number;
  co2_saved_kg: number;
  credits: number;
  re_return_risk: number;
  why_this_fits: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  REVIEW: "#6a1b9a",
};

function LeafIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#555" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#146EB4" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  );
}

export default function RecommendationCard(props: RecommendationCardProps) {
  const [imgError, setImgError] = useState(false);
  const [added, setAdded] = useState(false);

  const savingsPct = props.original_price_inr
    ? Math.round(((props.original_price_inr - props.price_inr) / props.original_price_inr) * 100)
    : 0;

  function handleAdd() {
    addToCart({
      item_id: props.item_id,
      name: props.name,
      brand: props.brand,
      grade: props.grade,
      price_inr: props.price_inr,
      photo_url: props.photo_url,
      co2_saved_kg: props.co2_saved_kg,
      credits: props.credits,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  return (
    <div
      style={{
        backgroundColor: "white",
        borderRadius: "8px",
        padding: "16px",
        display: "flex",
        gap: "16px",
        boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
        marginBottom: "16px",
        border: "1px solid #ddd",
      }}
    >
      {/* Photo */}
      <Link
        href={`/refurb/${props.item_id}`}
        style={{
          flexShrink: 0,
          width: "130px",
          height: "130px",
          overflow: "hidden",
          borderRadius: "4px",
          backgroundColor: "#f0f0f0",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {props.photo_url && !imgError ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={props.photo_url}
            alt={props.name}
            onError={() => setImgError(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{ color: "#999", fontSize: "12px" }}>No photo</span>
        )}
      </Link>

      {/* Details */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Badges */}
        <div style={{ display: "flex", gap: "6px", marginBottom: "6px", flexWrap: "wrap" }}>
          <span
            style={{
              backgroundColor: "#FF9900",
              color: "#000",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "11px",
              fontWeight: "bold",
            }}
          >
            CERTIFIED REFURB
          </span>
          <span
            style={{
              backgroundColor: GRADE_COLORS[props.grade] ?? "#555",
              color: "white",
              borderRadius: "4px",
              padding: "2px 8px",
              fontSize: "11px",
              fontWeight: "bold",
            }}
          >
            GRADE {props.grade}
          </span>
        </div>

        {/* Name */}
        <Link
          href={`/refurb/${props.item_id}`}
          style={{
            fontSize: "17px",
            fontWeight: "bold",
            marginBottom: "2px",
            color: "#0F1111",
            display: "block",
            textDecoration: "none",
          }}
        >
          {props.name}
        </Link>

        {/* Rating */}
        <div style={{ fontSize: "12px", color: "#007185", marginBottom: "8px" }}>
          ★★★★☆ AI-graded condition report
        </div>

        {/* Price */}
        <div style={{ marginBottom: "6px" }}>
          <span
            style={{
              textDecoration: "line-through",
              color: "#888",
              fontSize: "13px",
              marginRight: "8px",
            }}
          >
            ₹{props.original_price_inr.toLocaleString("en-IN")}
          </span>
          <span style={{ fontSize: "20px", fontWeight: "bold", color: "#B12704" }}>
            ₹{props.price_inr.toLocaleString("en-IN")}
          </span>
          <span style={{ fontSize: "13px", color: "#2d6a4f", marginLeft: "8px" }}>
            Save {savingsPct}%
          </span>
        </div>

        {/* Green impact */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "13px",
            color: "#2d6a4f",
            marginBottom: "4px",
          }}
        >
          <LeafIcon />
          Saves {props.co2_saved_kg} kg CO₂ · +{props.credits} credits
        </div>

        {/* Location */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "5px",
            fontSize: "13px",
            color: "#555",
            marginBottom: "6px",
          }}
        >
          <PinIcon />
          Ships from {props.return_hub_city} · arrives in {props.ship_eta_days}d
        </div>

        {/* Why this fits */}
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "5px",
            fontSize: "13px",
            color: "#333",
            marginBottom: "12px",
          }}
        >
          <ShieldIcon />
          <span>
            <em>&ldquo;{props.why_this_fits}&rdquo;</em>
          </span>
        </div>

        {/* CTAs */}
        <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
          <a href={`/refurb/${props.item_id}#passport`} style={{ color: "#146EB4", fontSize: "13px" }}>
            View Trust Passport
          </a>
          <button
            onClick={handleAdd}
            style={{
              backgroundColor: added ? "#2d6a4f" : "#FF9900",
              color: added ? "white" : "#000",
              border: "none",
              borderRadius: "4px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: "bold",
              cursor: "pointer",
              transition: "background-color 0.2s",
            }}
          >
            {added ? "✓ Added to Cart" : isInCart(props.item_id) ? "Add again" : "Add to Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}
