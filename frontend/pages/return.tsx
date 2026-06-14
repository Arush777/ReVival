import { useState, useRef } from "react";
import { useRouter } from "next/router";
import AmazonHeader from "../components/AmazonHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const CATEGORIES = [
  "shoes", "shirt", "jeans", "kurta", "saree", "phone",
  "laptop", "appliance", "bag", "sunglasses", "food", "headphones", "kettle",
];

const RETURN_REASONS = [
  { value: "fit_too_tight", label: "Fit too tight" },
  { value: "fit_too_loose", label: "Fit too loose" },
  { value: "color_mismatch", label: "Color looks different in photos" },
  { value: "too_loud", label: "Too loud" },
  { value: "too_spicy", label: "Too spicy" },
  { value: "defective", label: "Defective / not working" },
  { value: "changed_mind", label: "Changed mind" },
  { value: "other", label: "Other" },
];

const CITIES = [
  "Mumbai", "Delhi", "Bangalore", "Surat", "Ahmedabad",
  "Chennai", "Pune", "Hyderabad", "Kolkata", "Jaipur",
];

interface ReturnResult {
  item_id: string;
  status: string;
  grade: string;
  disposition: string;
  base_price_inr: number;
  co2_saved_kg: number;
  credits: number;
  trade_in_credit_inr?: number;
  passport_url?: string;
  top_matches?: { buyer_id: string; name: string; re_return_risk: number; why_this_fits: string }[];
  warning_written: boolean;
}

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

const ROUTE_LABELS: Record<string, string> = {
  resell: "Certified Resell",
  refurbish: "Refurbish",
  donate: "Donate",
  recycle: "Recycle",
  exchange: "Trade-in Credit",
  manual_review: "Manual Review",
};

export default function ReturnPage() {
  const router = useRouter();

  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [hubCity, setHubCity] = useState("Bangalore");
  const [tradeIn, setTradeIn] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReturnResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (photos.length === 0) {
      setError("Please upload at least one photo.");
      return;
    }
    if (!category || !returnReason) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const itemId = `ITM-UPLOAD-${Date.now()}`;
      const payload = {
        item_id: itemId,
        listing_id: `LST-UPLOAD-${Date.now()}`,
        category,
        brand: brand || "Unknown",
        name: itemName || `${brand} ${category}`.trim() || "Item",
        listed_size: size || "one-size",
        listed_color: color || "unknown",
        original_price_inr: parseInt(originalPrice) || 999,
        return_reason_code: returnReason,
        return_reason_text: RETURN_REASONS.find((r) => r.value === returnReason)?.label ?? returnReason,
        return_hub_city: hubCity,
        owner_count: 1,
        history_note: "Submitted via return flow",
        status: "pending",
      };

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      formData.append("trade_in", tradeIn ? "true" : "false");
      for (const photo of photos) {
        formData.append("photos", photo);
      }

      const res = await fetch(`${API_BASE}/returns`, {
        method: "POST",
        body: formData,
      });
      const data: ReturnResult = await res.json();

      if ((data as any).error) {
        setError((data as any).error.message ?? "Return failed.");
        return;
      }

      // Trade-in exchange redirect
      if (tradeIn && data.disposition === "exchange") {
        const params = new URLSearchParams({
          item_id: data.item_id,
          name: payload.name,
          grade: data.grade,
          credit: String(data.trade_in_credit_inr ?? 0),
          co2: String(data.co2_saved_kg ?? 0),
          credits: String(data.credits ?? 0),
        });
        router.push(`/exchange?${params.toString()}`);
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
    result?.grade === "D" || result?.grade === "REVIEW" || result?.disposition === "manual_review";

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      {/* Sub-nav */}
      <div style={{ backgroundColor: "#37475A", padding: "6px 16px", fontSize: "13px", color: "white" }}>
        <div style={{ maxWidth: "900px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span style={{ color: "#ccc" }}>Returns</span>
          {" > "}
          <span>Submit Return</span>
        </div>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 20px 0", color: "#0F1111" }}>
          Submit a Return
        </h1>

        {/* Step 1 form — hide after result */}
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
              <h2 style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 16px 0" }}>
                Step 1: Item details &amp; photos
              </h2>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                <div>
                  <label style={labelStyle}>Item name</label>
                  <input
                    type="text"
                    value={itemName}
                    onChange={(e) => setItemName(e.target.value)}
                    placeholder="e.g. Nike Air Max 270"
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
                    placeholder="e.g. Nike"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Return reason *</label>
                  <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} required style={selectStyle}>
                    <option value="">Select reason</option>
                    {RETURN_REASONS.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Original price (₹)</label>
                  <input
                    type="number"
                    value={originalPrice}
                    onChange={(e) => setOriginalPrice(e.target.value)}
                    placeholder="e.g. 9999"
                    min="1"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Return hub city</label>
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
                    placeholder="e.g. M, US 10, 32x30"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Colour</label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. black"
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Photo upload */}
              <div style={{ marginTop: "16px" }}>
                <label style={labelStyle}>Photos (min 1) *</label>
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
                      if (e.target.files) setPhotos(Array.from(e.target.files));
                    }}
                  />
                  {photos.length === 0 ? (
                    <span style={{ color: "#888", fontSize: "14px" }}>
                      Drag &amp; drop or click to browse
                    </span>
                  ) : (
                    <span style={{ color: "#2d6a4f", fontSize: "14px" }}>
                      {photos.length} photo{photos.length > 1 ? "s" : ""} selected:{" "}
                      {photos.map((p) => p.name).join(", ")}
                    </span>
                  )}
                </div>
              </div>

              {/* Trade-in toggle */}
              <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                <input
                  type="checkbox"
                  id="trade-in"
                  checked={tradeIn}
                  onChange={(e) => setTradeIn(e.target.checked)}
                  style={{ width: "16px", height: "16px", cursor: "pointer" }}
                />
                <label htmlFor="trade-in" style={{ fontSize: "14px", cursor: "pointer" }}>
                  Trade-in for store credit (receive credit instead of return approval)
                </label>
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
              {loading ? "Processing..." : "Submit Return →"}
            </button>
          </form>
        )}

        {/* Step 2 — result */}
        {result && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              border: "1px solid #ddd",
            }}
          >
            <h2 style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 16px 0" }}>
              Step 2: Your Return Summary
            </h2>

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
                <strong>Item flagged for manual review.</strong> Our team will assess your item and
                contact you within 24 hours.
              </div>
            ) : (
              <>
                {/* Green banner */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    backgroundColor: "#d8f3dc",
                    borderRadius: "6px",
                    padding: "12px 16px",
                    marginBottom: "16px",
                    color: "#1b4332",
                    fontWeight: "bold",
                  }}
                >
                  <LeafIcon />
                  Your item earns a second life
                </div>

                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <InfoRow label="Grade" value={result.grade} />
                  <InfoRow label="Route" value={ROUTE_LABELS[result.disposition] ?? result.disposition} />
                  <InfoRow label="You earn" value={`${result.credits} green credits`} />
                  <InfoRow label="CO₂ saved" value={`${result.co2_saved_kg} kg (approx. ${Math.round((result.co2_saved_kg ?? 0) * 5)} km by car)`} />
                </div>

                {result.top_matches && result.top_matches.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "6px" }}>
                      Top match
                    </div>
                    <div style={{ fontSize: "13px", color: "#333" }}>
                      {result.top_matches[0].name} · risk {(result.top_matches[0].re_return_risk * 100).toFixed(1)}%
                    </div>
                  </div>
                )}

                <button
                  style={{
                    backgroundColor: "#FF9900",
                    color: "#000",
                    border: "none",
                    borderRadius: "4px",
                    padding: "10px 24px",
                    fontSize: "14px",
                    fontWeight: "bold",
                    cursor: "pointer",
                  }}
                  onClick={() => router.push("/")}
                >
                  Continue with Return →
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        backgroundColor: "#f9f9f9",
        borderRadius: "4px",
        padding: "10px 14px",
        border: "1px solid #eee",
      }}
    >
      <div style={{ fontSize: "11px", color: "#888", marginBottom: "2px" }}>{label}</div>
      <div style={{ fontSize: "14px", fontWeight: "bold" }}>{value}</div>
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
