import { useState, useRef } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

const CATEGORIES = [
  "shoes", "shirt", "jeans", "kurta", "saree", "phone",
  "laptop", "appliance", "bag", "sunglasses", "food", "headphones", "kettle",
];

const CONDITION_OPTIONS = [
  { value: "returned_open_box", label: "Returned / Open box" },
  { value: "lightly_used", label: "Lightly used" },
  { value: "good_condition", label: "Good condition" },
  { value: "well_used", label: "Well used" },
];

const CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Surat", "Ahmedabad",
  "Chennai", "Pune", "Hyderabad", "Kolkata", "Jaipur",
];

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  REVIEW: "#6a1b9a",
};

interface SellResult {
  item_id: string;
  status: string;
  grade: string;
  disposition: string;
  base_price_inr: number;
  co2_saved_kg: number;
  credits: number;
  passport_url?: string;
  warning_written: boolean;
}

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#146EB4" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  );
}

export default function SellPage() {
  const router = useRouter();

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [conditionNote, setConditionNote] = useState("returned_open_box");
  const [askingPrice, setAskingPrice] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [hubCity, setHubCity] = useState("Mumbai");
  const [photos, setPhotos] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SellResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (photos.length === 0) {
      setError("Please upload at least one photo.");
      return;
    }
    if (!category || !askingPrice) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const itemId = `ITM-P2P-${Date.now()}`;
      const listingPrice = parseInt(askingPrice);

      const payload = {
        item_id: itemId,
        listing_id: `LST-P2P-${Date.now()}`,
        category,
        brand: brand || "Unknown",
        name: itemName || `${brand} ${category}`.trim() || "Item",
        listed_size: size || "one-size",
        listed_color: color || "unknown",
        original_price_inr: listingPrice,
        return_reason_code: "changed_mind",
        return_reason_text: "Seller listing item for resale",
        return_hub_city: hubCity,
        owner_count: 1,
        history_note: `Seller condition: ${conditionNote}`,
        status: "pending",
        seller_id: BUYER_ID,
        seller_keeps_item: true,
        listing_price_inr: listingPrice,
      };

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      for (const photo of photos) {
        formData.append("photos", photo);
      }

      const res = await fetch(`${API_BASE}/community-list`, {
        method: "POST",
        body: formData,
      });
      const data: SellResult = await res.json();

      if ((data as any).error) {
        setError((data as any).error.message ?? "Listing failed.");
        return;
      }

      setResult(data);
    } catch {
      setError("Network error. Is the backend running?");
    } finally {
      setLoading(false);
    }
  }

  const isManualReview =
    result?.grade === "D" || result?.grade === "REVIEW" || result?.disposition === "manual_review" || result?.status === "manual_review" || result?.status === "recycle";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      {/* Sub-nav */}
      <div style={{ backgroundColor: "#37475A", padding: "6px 16px", fontSize: "13px", color: "white" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span style={{ color: "#ccc" }}>Sell</span>
          {" > "}
          <span>List Your Item</span>
        </div>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 4px 0" }}>
          Sell on Amazon Second Life
        </h1>
        <p style={{ fontSize: "14px", color: "#555", margin: "0 0 20px 0" }}>
          Your item gets AI-graded and listed with a Trust Passport. Buyers trust it. You keep the item and ship when sold.
        </p>

        {/* Form — hide after result */}
        {!result && (
          <form onSubmit={handleSubmit}>
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "24px",
                border: "1px solid #ddd",
                marginBottom: "16px",
              }}
            >
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Item name</label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Levi's 512 Jeans"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Category *</label>
                  <select value={category} onChange={(e) => setCategory(e.target.value)} required style={selectStyle}>
                    <option value="">Select category</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Brand</label>
                  <input
                    type="text"
                    value={brand}
                    onChange={(e) => setBrand(e.target.value)}
                    placeholder="e.g. Levi's"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Condition</label>
                  <select value={conditionNote} onChange={(e) => setConditionNote(e.target.value)} style={selectStyle}>
                    {CONDITION_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Your asking price (₹) *</label>
                  <input
                    type="number"
                    value={askingPrice}
                    onChange={(e) => setAskingPrice(e.target.value)}
                    placeholder="e.g. 2200"
                    min="1"
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Your city (ship from)</label>
                  <select value={hubCity} onChange={(e) => setHubCity(e.target.value)} style={selectStyle}>
                    {CITIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Size</label>
                  <input
                    type="text"
                    value={size}
                    onChange={(e) => setSize(e.target.value)}
                    placeholder="e.g. M, US 10"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Colour</label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. blue"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Photo upload */}
              <div style={{ marginTop: "16px" }}>
                <label style={labelStyle}>Photos (min 1, max 5) *</label>
                <div
                  style={{
                    border: "2px dashed #ddd",
                    borderRadius: "6px",
                    padding: "20px",
                    textAlign: "center",
                    cursor: "pointer",
                    backgroundColor: "#fafafa",
                  }}
                  onClick={() => fileRef.current?.click()}
                >
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                      if (e.target.files) {
                        setPhotos(Array.from(e.target.files).slice(0, 5));
                      }
                    }}
                  />
                  {photos.length === 0 ? (
                    <span style={{ color: "#888", fontSize: "14px" }}>
                      Drag &amp; drop or click to browse (up to 5 photos)
                    </span>
                  ) : (
                    <span style={{ color: "#2d6a4f", fontSize: "14px" }}>
                      {photos.length} photo{photos.length > 1 ? "s" : ""} selected
                    </span>
                  )}
                </div>
              </div>
            </div>

            {error && (
              <div
                style={{
                  border: "1px solid #f5c6cb",
                  backgroundColor: "#f8d7da",
                  borderRadius: "6px",
                  padding: "12px 16px",
                  color: "#721c24",
                  fontSize: "14px",
                  marginBottom: "16px",
                }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              style={{
                backgroundColor: loading ? "#aaa" : "#FF9900",
                color: "#000",
                border: "none",
                borderRadius: "4px",
                padding: "12px 28px",
                fontSize: "16px",
                fontWeight: "bold",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Grading your item..." : "List My Item →"}
            </button>
          </form>
        )}

        {/* Result panel */}
        {result && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              border: "1px solid #ddd",
            }}
          >
            {isManualReview ? (
              <div
                style={{
                  border: "1px solid #ffc107",
                  backgroundColor: "#fff8e1",
                  borderRadius: "6px",
                  padding: "16px",
                  color: "#856404",
                }}
              >
                <strong>Item needs review</strong> — our team will contact you within 24 hours to
                discuss the next steps.
              </div>
            ) : (
              <>
                {/* Approval header */}
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                    <span
                      style={{
                        backgroundColor: GRADE_COLORS[result.grade] ?? "#555",
                        color: "white",
                        borderRadius: "4px",
                        padding: "3px 10px",
                        fontSize: "13px",
                        fontWeight: "bold",
                      }}
                    >
                      Grade {result.grade}
                    </span>
                    <span
                      style={{
                        backgroundColor: "#2d6a4f",
                        color: "white",
                        borderRadius: "4px",
                        padding: "3px 10px",
                        fontSize: "13px",
                        fontWeight: "bold",
                      }}
                    >
                      APPROVED
                    </span>
                  </div>
                  <div style={{ fontSize: "15px", fontWeight: "bold" }}>
                    Your listing price: ₹{parseInt(askingPrice).toLocaleString("en-IN")}
                  </div>
                </div>

                {/* Trust Passport */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "#f1f8e9",
                    borderRadius: "6px",
                    padding: "10px 14px",
                    marginBottom: "10px",
                    fontSize: "13px",
                    color: "#1b4332",
                  }}
                >
                  <ShieldIcon />
                  Trust Passport generated — buyers can see it
                </div>

                {/* Green impact */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "#d8f3dc",
                    borderRadius: "6px",
                    padding: "10px 14px",
                    marginBottom: "16px",
                    fontSize: "13px",
                    color: "#1b4332",
                  }}
                >
                  <LeafIcon />
                  Saves {result.co2_saved_kg} kg CO₂ · +{result.credits} credits when sold
                </div>

                <div style={{ display: "flex", gap: "12px" }}>
                  <Link
                    href={`/refurb/${result.item_id}`}
                    style={{
                      backgroundColor: "#FF9900",
                      color: "#000",
                      borderRadius: "4px",
                      padding: "10px 20px",
                      fontSize: "14px",
                      fontWeight: "bold",
                      textDecoration: "none",
                      display: "inline-block",
                    }}
                  >
                    View Your Listing →
                  </Link>
                  <button
                    onClick={() => {
                      setResult(null);
                      setAskingPrice("");
                    }}
                    style={{
                      backgroundColor: "white",
                      color: "#146EB4",
                      border: "1px solid #146EB4",
                      borderRadius: "4px",
                      padding: "10px 20px",
                      fontSize: "14px",
                      cursor: "pointer",
                    }}
                  >
                    Edit Price
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: "13px",
  fontWeight: "bold",
  marginBottom: "4px",
  color: "#333",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: "4px",
  fontSize: "13px",
  outline: "none",
};

const selectStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: "4px",
  fontSize: "13px",
  backgroundColor: "white",
  outline: "none",
  cursor: "pointer",
};
