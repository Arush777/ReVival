import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";
import Spinner from "../components/Spinner";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

const CATEGORY_GROUPS = [
  {
    label: "Apparel",
    options: [
      { value: "shirt", label: "Shirts & Tops" },
      { value: "kurta", label: "Kurtas & Ethnic Wear" },
      { value: "saree", label: "Sarees & Dupattas" },
      { value: "jeans", label: "Jeans & Trousers" },
    ],
  },
  {
    label: "Footwear",
    options: [
      { value: "shoes", label: "Shoes & Sandals" },
    ],
  },
  {
    label: "Electronics",
    options: [
      { value: "phone", label: "Mobile Phones" },
      { value: "laptop", label: "Laptops & Tablets" },
      { value: "headphones", label: "Headphones & Earphones" },
      { value: "appliance", label: "Home Appliances" },
      { value: "kettle", label: "Kitchen Appliances" },
    ],
  },
  {
    label: "Accessories",
    options: [
      { value: "bag", label: "Bags & Backpacks" },
      { value: "sunglasses", label: "Sunglasses & Eyewear" },
    ],
  },
  {
    label: "Food & Grocery",
    options: [
      { value: "food", label: "Food & Grocery" },
    ],
  },
  {
    label: "Other",
    options: [
      { value: "other", label: "Something else" },
    ],
  },
];

const CONDITION_OPTIONS = [
  { value: "returned_open_box", label: "Returned / Open box", assumedGrade: "A" },
  { value: "lightly_used", label: "Lightly used", assumedGrade: "B" },
  { value: "good_condition", label: "Good condition", assumedGrade: "B" },
  { value: "well_used", label: "Well used", assumedGrade: "C" },
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
  const [otherCategory, setOtherCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [conditionNote, setConditionNote] = useState("returned_open_box");
  const [mrpPrice, setMrpPrice] = useState("");
  const [askingPrice, setAskingPrice] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [hubCity, setHubCity] = useState("Mumbai");
  const [photos, setPhotos] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  // AI grading state — set after media upload, drives price recommendation
  const [aiGrade, setAiGrade] = useState<string | null>(null);
  const [gradeLoading, setGradeLoading] = useState(false);

  // Price recommendation state
  const [priceRec, setPriceRec] = useState<{ recommended_price: number; grade_factor: number; demand_factor: number } | null>(null);
  const [priceRecLoading, setPriceRecLoading] = useState(false);

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SellResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Human review
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [photos]);

  // Call /grade-preview whenever media changes — stores real AI grade for price rec
  useEffect(() => {
    if (photos.length === 0 && !video) {
      setAiGrade(null);
      return;
    }
    if (!category) return;

    let cancelled = false;
    setGradeLoading(true);
    setAiGrade(null);
    setPriceRec(null);

    (async () => {
      try {
        const fd = new FormData();
        fd.append("category", category === "other" ? "appliance" : category);
        fd.append("condition", conditionNote);
        if (video) {
          fd.append("video", video);
        } else {
          for (const p of photos) fd.append("photos", p);
        }
        const res = await fetch(`${API_BASE}/grade-preview`, { method: "POST", body: fd });
        const data = await res.json();
        if (!cancelled) setAiGrade(data.grade ?? null);
      } catch {
        if (!cancelled) setAiGrade(null);
      } finally {
        if (!cancelled) setGradeLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [photos, video, category, conditionNote]);

  // Price recommendation fires once the real AI grade is available
  useEffect(() => {
    const mrp = parseInt(mrpPrice);
    if (!mrp || mrp <= 0 || !category || !aiGrade) {
      setPriceRec(null);
      return;
    }

    const backendCategory = category === "other" ? "appliance" : category;

    const timer = setTimeout(async () => {
      setPriceRecLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/listings/recommend-price?original_price=${mrp}&grade=${aiGrade}&category=${backendCategory}&region=${hubCity}`
        );
        const data = await res.json();
        setPriceRec(data);
      } catch {
        setPriceRec(null);
      } finally {
        setPriceRecLoading(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [mrpPrice, category, hubCity, aiGrade]);

  async function handleRequestReview() {
    if (!result?.item_id) return;
    setReviewLoading(true);
    try {
      await fetch(`${API_BASE}/items/${result.item_id}/request-review`, { method: "POST" });
      setReviewRequested(true);
    } catch {
      // silent for demo
    } finally {
      setReviewLoading(false);
    }
  }

  async function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("Video must be under 100 MB.");
      e.target.value = "";
      return;
    }
    const duration = await new Promise<number>((resolve) => {
      const url = URL.createObjectURL(file);
      const vid = document.createElement("video");
      vid.preload = "metadata";
      vid.onloadedmetadata = () => { URL.revokeObjectURL(url); resolve(vid.duration); };
      vid.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      vid.src = url;
    });
    if (duration > 60) {
      setError("Video must be 60 seconds or shorter.");
      e.target.value = "";
      return;
    }
    setError(null);
    setVideo(file);
    setVideoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (photos.length === 0 && !video) {
      setError("Please upload at least one photo (up to 5) or a video before submitting.");
      return;
    }
    if (!category || !askingPrice) {
      setError("Please fill in all required fields (category and asking price).");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const itemId = `ITM-P2P-${Date.now()}`;
      const listingPrice = parseInt(askingPrice);
      const originalPrice = parseInt(mrpPrice) || listingPrice;

      const backendCategory = category === "other" ? "appliance" : category;

      const payload = {
        item_id: itemId,
        listing_id: `LST-P2P-${Date.now()}`,
        category: backendCategory,
        brand: brand || "Unknown",
        name: itemName || `${brand} ${category}`.trim() || "Item",
        listed_size: size || "one-size",
        listed_color: color || "unknown",
        original_price_inr: originalPrice,
        return_reason_code: "no_longer_needed",
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
      if (video) formData.append("video", video);

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

  // Compute price warning
  const askingPriceNum = parseInt(askingPrice) || 0;
  let priceWarning: { text: string; color: string; bg: string; borderColor: string } | null = null;
  if (priceRec && askingPriceNum > 0) {
    const rec = priceRec.recommended_price;
    if (askingPriceNum > rec * 1.05) {
      priceWarning = {
        text: `Price too high. Less probability of stock clearance. Recommended: ₹${rec.toLocaleString("en-IN")}`,
        color: "#B12704",
        bg: "#fce4ec",
        borderColor: "#B12704",
      };
    } else if (askingPriceNum < rec * 0.95) {
      priceWarning = {
        text: `Price lower than market rate. You could earn more. Recommended: ₹${rec.toLocaleString("en-IN")}`,
        color: "#856404",
        bg: "#fff8e1",
        borderColor: "#FF9900",
      };
    } else {
      priceWarning = {
        text: "✓ Optimal price.",
        color: "#2e7d32",
        bg: "#d8f3dc",
        borderColor: "#2e7d32",
      };
    }
  }

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
                    {CATEGORY_GROUPS.map((group) => (
                      <optgroup key={group.label} label={group.label}>
                        {group.options.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                  {category === "other" && (
                    <input
                      type="text"
                      value={otherCategory}
                      onChange={(e) => setOtherCategory(e.target.value)}
                      placeholder="Describe the product type"
                      style={{ ...inputStyle, marginTop: "6px" }}
                    />
                  )}
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
                  <label style={labelStyle}>Original MRP (₹) — what you paid</label>
                  <input
                    type="number"
                    value={mrpPrice}
                    onChange={(e) => setMrpPrice(e.target.value)}
                    placeholder="e.g. 3999"
                    min="1"
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

              {/* Asking price — rough estimate; AI rec unlocks after media upload */}
              <div style={{ marginTop: "14px" }}>
                <label style={labelStyle}>Your asking price (₹) *</label>

                {/* Hint when no media yet */}
                {photos.length === 0 && !video && (
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px" }}>
                    Enter a rough estimate — upload photos or a video below to get an AI price recommendation.
                  </div>
                )}

                <div style={{ position: "relative" }}>
                  <input
                    type="number"
                    value={askingPrice}
                    onChange={(e) => setAskingPrice(e.target.value)}
                    placeholder={priceRec ? `e.g. ₹${priceRec.recommended_price.toLocaleString("en-IN")}` : "e.g. 2200"}
                    min="1"
                    required
                    style={{
                      ...inputStyle,
                      borderColor: priceWarning ? priceWarning.borderColor : "#ccc",
                      borderWidth: priceWarning ? "2px" : "1px",
                      paddingRight: priceRecLoading ? "36px" : undefined,
                    }}
                  />
                  {priceRecLoading && (
                    <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)" }}>
                      <Spinner size={14} color="#888" />
                    </span>
                  )}
                </div>

                {/* Grading + price rec status — only visible after media upload */}
                {(photos.length > 0 || !!video) && gradeLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888", marginTop: "6px" }}>
                    <Spinner size={12} color="#888" /> AI grading your media…
                  </div>
                )}

                {(photos.length > 0 || !!video) && !gradeLoading && aiGrade && priceRec && !priceRecLoading && (
                  <div style={{
                    marginTop: "8px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    backgroundColor: "#f0f4f8",
                    border: "1px solid #d0d9e8",
                    fontSize: "13px",
                  }}>
                    <span style={{ color: "#555" }}>AI grade:</span>
                    <span style={{ fontWeight: "bold", color: GRADE_COLORS[aiGrade] ?? "#555" }}>
                      {aiGrade}
                    </span>
                    <span style={{ color: "#555", marginLeft: "6px" }}>Recommended:</span>
                    <span style={{ fontWeight: "bold", color: "#1a1a1a", fontSize: "14px" }}>
                      ₹{priceRec.recommended_price.toLocaleString("en-IN")}
                    </span>
                    <span style={{ fontSize: "11px", color: "#888" }}>
                      (demand ×{priceRec.demand_factor})
                    </span>
                  </div>
                )}

                {(photos.length > 0 || !!video) && !gradeLoading && aiGrade && priceRecLoading && (
                  <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888", marginTop: "6px" }}>
                    <Spinner size={12} color="#888" /> Calculating recommended price…
                  </div>
                )}

                {(photos.length > 0 || !!video) && !gradeLoading && aiGrade && !priceRec && !priceRecLoading && !mrpPrice && (
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "6px" }}>
                    Enter Original MRP above to get a price recommendation.
                  </div>
                )}

                {/* Traffic light banner — only meaningful once rec is loaded */}
                {priceWarning && (photos.length > 0 || !!video) && (
                  <div
                    style={{
                      marginTop: "6px",
                      padding: "8px 12px",
                      borderRadius: "4px",
                      backgroundColor: priceWarning.bg,
                      color: priceWarning.color,
                      fontSize: "13px",
                      fontWeight: "bold",
                      border: `1px solid ${priceWarning.borderColor}40`,
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {priceWarning.text}
                  </div>
                )}
              </div>

              {/* Photos or Video — at least one required */}
              <div style={{ marginTop: "16px" }}>
                <label style={labelStyle}>
                  Photos or Video *
                  <span style={{ color: "#888", fontWeight: "normal", marginLeft: "6px", fontSize: "12px" }}>
                    — upload 1–5 photos OR a short video (max 60s / 100 MB)
                  </span>
                </label>

                {/* Photo dropzone */}
                <div
                  style={{
                    border: "2px dashed #ddd",
                    borderRadius: "6px",
                    padding: "18px",
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
                        const all = Array.from(e.target.files);
                        if (all.length > 5) {
                          setError("Maximum 5 photos allowed — only the first 5 will be kept.");
                        }
                        setPhotos(all.slice(0, 5));
                      }
                    }}
                  />
                  {photos.length === 0 ? (
                    <span style={{ color: "#888", fontSize: "14px" }}>Click to browse photos (up to 5)</span>
                  ) : (
                    <span style={{ color: "#2d6a4f", fontSize: "14px", fontWeight: "bold" }}>
                      {photos.length} photo{photos.length > 1 ? "s" : ""} selected — click to change
                    </span>
                  )}
                </div>

                {/* Photo previews */}
                {previewUrls.length > 0 && (
                  <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                    {previewUrls.map((url, i) => (
                      <div key={i} style={{ position: "relative" }}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={url}
                          alt={`Photo ${i + 1}`}
                          style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd", display: "block" }}
                        />
                        <button
                          type="button"
                          onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
                          style={{
                            position: "absolute", top: -6, right: -6,
                            width: 18, height: 18, borderRadius: "50%",
                            backgroundColor: "#B12704", color: "white", border: "none",
                            fontSize: 12, cursor: "pointer", display: "flex",
                            alignItems: "center", justifyContent: "center", padding: 0,
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Divider */}
                <div style={{ display: "flex", alignItems: "center", gap: "10px", margin: "12px 0" }}>
                  <hr style={{ flex: 1, border: "none", borderTop: "1px solid #eee" }} />
                  <span style={{ fontSize: "12px", color: "#aaa", fontStyle: "italic" }}>or</span>
                  <hr style={{ flex: 1, border: "none", borderTop: "1px solid #eee" }} />
                </div>

                {/* Video upload */}
                <div>
                  <div style={{ fontSize: "12px", color: "#555", marginBottom: "5px", fontWeight: "500" }}>
                    Video (max 60s / 100 MB):
                  </div>
                  <input
                    type="file"
                    accept="video/mp4,video/quicktime"
                    onChange={handleVideoChange}
                    style={{ display: "block", fontSize: "13px", color: "#555" }}
                  />
                  {videoPreview && (
                    <video
                      src={videoPreview}
                      controls
                      style={{ marginTop: "8px", height: "128px", borderRadius: "4px", border: "1px solid #ddd", display: "block" }}
                    />
                  )}
                  {video && (
                    <div style={{ fontSize: "12px", color: "#2d6a4f", marginTop: "4px" }}>
                      {video.name} selected
                    </div>
                  )}
                </div>

                {/* Required hint */}
                {photos.length === 0 && !video && (
                  <div style={{ fontSize: "12px", color: "#888", marginTop: "8px" }}>
                    At least one photo or a video is required before submitting.
                  </div>
                )}
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
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              {loading ? <><Spinner size={16} color="#000" /> Grading your item...</> : "List My Item →"}
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
                  marginBottom: "16px",
                }}
              >
                <strong>Item needs review</strong> — our team will contact you within 24 hours to discuss the next steps.
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
                  {priceRec && aiGrade && (
                    <div style={{ fontSize: "12px", color: "#555", marginTop: "4px" }}>
                      AI recommended: ₹{priceRec.recommended_price.toLocaleString("en-IN")} (Grade {aiGrade} × demand {priceRec.demand_factor})
                    </div>
                  )}
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
              </>
            )}

            {/* Action buttons (shown for all outcomes) */}
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
              {!isManualReview && (
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
              )}

              <button
                onClick={() => {
                  setResult(null);
                  setAskingPrice("");
                  setReviewRequested(false);
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

              {/* Human Review button */}
              {!reviewRequested ? (
                <button
                  onClick={handleRequestReview}
                  disabled={reviewLoading}
                  style={{
                    backgroundColor: "white",
                    color: "#555",
                    border: "1px solid #ccc",
                    borderRadius: "4px",
                    padding: "10px 18px",
                    fontSize: "13px",
                    cursor: reviewLoading ? "not-allowed" : "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  {reviewLoading ? <Spinner size={14} color="#555" /> : "🧑‍💼"} Request Human Review
                </button>
              ) : (
                <span
                  style={{
                    backgroundColor: "#e8f4fd",
                    border: "1px solid #90caf9",
                    borderRadius: "4px",
                    padding: "10px 18px",
                    fontSize: "13px",
                    color: "#0d47a1",
                  }}
                >
                  ✓ Human review requested
                </span>
              )}
            </div>

            {!reviewRequested && (
              <div style={{ fontSize: "11px", color: "#888", marginTop: "10px" }}>
                Not happy with the AI Grade? A circular commerce expert will manually verify your item.
              </div>
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
  boxSizing: "border-box",
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
