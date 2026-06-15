import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/router";
import AmazonHeader from "../components/AmazonHeader";
import Spinner from "../components/Spinner";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

interface OrderItem {
  order_id: string;
  order_date: string;
  item_id: string;
  listing_id: string;
  name: string;
  brand: string;
  category: string;
  listed_size: string;
  listed_color: string;
  original_price_inr: number;
  seller_description?: string;
}

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

// Amazon India standard return reasons
const RETURN_REASONS = [
  { value: "performance_quality_inadequate", label: "Performance or quality not adequate", group: "Defective" },
  { value: "product_damaged_box_ok", label: "Product damaged, but shipping box OK", group: "Defective" },
  { value: "missing_parts_accessories", label: "Missing parts or accessories", group: "Defective" },
  { value: "defective_not_working", label: "Defective / Does not work properly", group: "Defective" },
  { value: "different_from_ordered", label: "Different from what was ordered", group: "Catalog Mismatch" },
  { value: "wrong_size", label: "Wrong size", group: "Catalog Mismatch" },
  { value: "wrong_color", label: "Colour different from listing", group: "Catalog Mismatch" },
  { value: "bought_by_mistake", label: "Bought by mistake", group: "Change of Mind" },
  { value: "no_longer_needed", label: "No longer needed", group: "Change of Mind" },
  { value: "better_price_available", label: "Better price available", group: "Change of Mind" },
];

const RETURN_REASON_GROUPS = ["Defective", "Catalog Mismatch", "Change of Mind"];

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  REVIEW: "#6a1b9a",
};

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
  portfolio_recovered_value_inr?: number;
  portfolio_recovery_basis_inr?: number;
  co2_saved_kg: number;
  credits: number;
  trade_in_credit_inr?: number;
  passport_url?: string;
  top_matches?: { buyer_id: string; name: string; re_return_risk: number; why_this_fits: string }[];
  warning_written: boolean;
  seller_description?: string;
  return_reason_text?: string;
  returner_report?: string;
  claim_color_mismatch?: boolean;
  claim_size_mismatch?: boolean;
  claim_condition_mismatch?: boolean;
  claim_discrepancy_notes?: string;
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

  // Manual entry fields (only used when no order is selected)
  const [itemName, setItemName] = useState("");
  const [category, setCategory] = useState("");
  const [otherCategory, setOtherCategory] = useState("");
  const [brand, setBrand] = useState("");
  const [originalPrice, setOriginalPrice] = useState("");
  const [size, setSize] = useState("");
  const [color, setColor] = useState("");
  const [hubCity, setHubCity] = useState("Bangalore");

  // Return inputs
  const [returnReason, setReturnReason] = useState("");
  const [detailedComments, setDetailedComments] = useState("");
  const [tradeIn, setTradeIn] = useState(false);
  const [photos, setPhotos] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [video, setVideo] = useState<File | null>(null);
  const [videoPreview, setVideoPreview] = useState<string | null>(null);

  // Replacement flow
  const [replacementOption, setReplacementOption] = useState<"refund" | "direct_replacement" | "replace_with_resale">("refund");
  const [listingPrice, setListingPrice] = useState("");

  // AI grading + price recommendation for replace_with_resale — identical to the
  // Sell page: the real vision model inspects the uploaded media (no hardcoded
  // grade), and only then a price is recommended.
  const [aiGrade, setAiGrade] = useState<string | null>(null);
  const [gradeLoading, setGradeLoading] = useState(false);
  const [priceRec, setPriceRec] = useState<{ recommended_price: number; grade_factor: number; demand_factor: number } | null>(null);
  const [priceRecLoading, setPriceRecLoading] = useState(false);

  // Orders
  const [orders, setOrders] = useState<OrderItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderItem | null>(null);
  const [ordersLoading, setOrdersLoading] = useState(true);

  // Submission
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ReturnResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Human review
  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewRequested, setReviewRequested] = useState(false);

  useEffect(() => {
    const urls = photos.map((f) => URL.createObjectURL(f));
    setPreviewUrls(urls);
    return () => { urls.forEach((u) => URL.revokeObjectURL(u)); };
  }, [photos]);

  useEffect(() => {
    fetch(`${API_BASE}/buyers/${BUYER_ID}/orders`)
      .then((r) => r.json())
      .then((data) => setOrders(data.orders ?? []))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, []);

  // Replace-with-resale: run the REAL vision model on the uploaded media (same
  // as the Sell page) to get the actual AI grade. Only fires once media is
  // present — nothing is graded or recommended before the image is inspected.
  useEffect(() => {
    if (replacementOption !== "replace_with_resale") { setAiGrade(null); return; }
    if (photos.length === 0 && !video) { setAiGrade(null); setPriceRec(null); return; }
    const finalCategory = selectedOrder?.category ?? (category === "other" ? "appliance" : category);
    if (!finalCategory) return;

    let cancelled = false;
    setGradeLoading(true);
    setAiGrade(null);
    setPriceRec(null);
    (async () => {
      try {
        const fd = new FormData();
        fd.append("category", finalCategory);
        fd.append("condition", "returned_open_box");
        if (video) {
          fd.append("video", video);
        } else {
          for (const p of photos) fd.append("photos", p);
        }
        const res = await fetch(`${API_BASE}/grade-preview`, { method: "POST", body: fd });
        const data = await res.json();
        if (!cancelled) setAiGrade(res.ok ? (data.grade ?? null) : null);
      } catch {
        if (!cancelled) setAiGrade(null);
      } finally {
        if (!cancelled) setGradeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [photos, video, replacementOption, selectedOrder, category]);

  // Price recommendation fires once the real AI grade is available.
  useEffect(() => {
    if (replacementOption !== "replace_with_resale" || !aiGrade || !selectedOrder) {
      setPriceRec(null);
      return;
    }
    const backendCategory = selectedOrder.category;
    const orig = selectedOrder.original_price_inr;
    const timer = setTimeout(async () => {
      setPriceRecLoading(true);
      try {
        const res = await fetch(
          `${API_BASE}/listings/recommend-price?original_price=${orig}&grade=${aiGrade}&category=${backendCategory}&region=${hubCity}`
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
  }, [aiGrade, replacementOption, selectedOrder, hubCity]);

  function handleOrderSelect(order: OrderItem) {
    setSelectedOrder(order);
    setItemName(order.name);
    setCategory(order.category);
    setBrand(order.brand);
    setSize(order.listed_size);
    setColor(order.listed_color);
    setOriginalPrice(String(order.original_price_inr));
    setReplacementOption("refund");
    setListingPrice("");
  }

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

  function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 100 * 1024 * 1024) {
      setError("Video must be under 100 MB.");
      return;
    }
    setVideo(file);
    setVideoPreview(URL.createObjectURL(file));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (photos.length === 0 && !video) {
      setError("Please upload at least one photo or a video.");
      return;
    }
    const finalCategory = selectedOrder?.category ?? (category === "other" ? "appliance" : category);
    if (!finalCategory || !returnReason) {
      setError("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      // For an order from history, reuse its item_id so a live return creates
      // exactly the item the catalog product page references (its
      // second_life_item_id). Manual entries get a fresh upload id.
      const itemId = selectedOrder?.item_id ?? `ITM-UPLOAD-${Date.now()}`;

      const payload: Record<string, unknown> = {
        item_id: itemId,
        listing_id: selectedOrder?.listing_id ?? `LST-UPLOAD-${Date.now()}`,
        category: finalCategory,
        brand: selectedOrder?.brand ?? (brand || "Unknown"),
        name: selectedOrder?.name ?? (itemName || `${brand} ${category}`.trim() || "Item"),
        listed_size: selectedOrder?.listed_size ?? (size || "one-size"),
        listed_color: selectedOrder?.listed_color ?? (color || "unknown"),
        original_price_inr: selectedOrder?.original_price_inr ?? (parseInt(originalPrice) || 999),
        return_reason_code: returnReason,
        return_reason_text: RETURN_REASONS.find((r) => r.value === returnReason)?.label ?? returnReason,
        return_hub_city: hubCity,
        owner_count: 1,
        history_note: detailedComments || "Submitted via return flow",
        status: "pending",
      };

      // The seller's original listing claim flows into the return so the AI can
      // compare it against the returner's account (claim-discrepancy detection).
      if (selectedOrder?.seller_description) {
        payload.seller_description = selectedOrder.seller_description;
      }

      if (replacementOption === "replace_with_resale" && listingPrice) {
        payload.listing_price_inr = parseInt(listingPrice);
      }

      const formData = new FormData();
      formData.append("payload", JSON.stringify(payload));
      formData.append("trade_in", tradeIn ? "true" : "false");
      if (replacementOption === "direct_replacement") {
        formData.append("replacement_option", "direct_replacement");
      } else if (replacementOption === "replace_with_resale") {
        formData.append("replacement_option", "replace_with_resale");
      }
      for (const photo of photos) {
        formData.append("photos", photo);
      }
      if (video) formData.append("video", video);

      const res = await fetch(`${API_BASE}/returns`, {
        method: "POST",
        body: formData,
      });
      const data: ReturnResult = await res.json();

      if ((data as any).error) {
        setError((data as any).error.message ?? "Return failed.");
        return;
      }

      if (tradeIn && data.disposition === "exchange") {
        const params = new URLSearchParams({
          item_id: data.item_id,
          name: String(payload.name),
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

  // Price warning for the listing-price field — driven by the REAL AI grade.
  const listingPriceNum = parseInt(listingPrice) || 0;
  let priceWarning: { text: string; color: string; bg: string } | null = null;
  if (priceRec && listingPriceNum > 0) {
    const rec = priceRec.recommended_price;
    if (listingPriceNum > rec * 1.05) {
      priceWarning = {
        text: `Price too high. Less probability of stock clearance. Recommended: ₹${rec.toLocaleString("en-IN")}`,
        color: "#B12704",
        bg: "#fce4ec",
      };
    } else if (listingPriceNum < rec * 0.95) {
      priceWarning = {
        text: `Price lower than market rate. You could earn more. Recommended: ₹${rec.toLocaleString("en-IN")}`,
        color: "#856404",
        bg: "#fff8e1",
      };
    } else {
      priceWarning = { text: "✓ Optimal price.", color: "#2e7d32", bg: "#d8f3dc" };
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
          <span style={{ color: "#ccc" }}>Returns</span>
          {" > "}
          <span>Submit Return</span>
        </div>
      </div>

      <div style={{ maxWidth: "900px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 20px 0", color: "#0F1111" }}>
          Submit a Return
        </h1>

        {/* Order history picker — only shown before result */}
        {!result && !selectedOrder && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "20px 24px",
              border: "1px solid #ddd",
              marginBottom: "16px",
            }}
          >
            <h2 style={{ fontSize: "15px", fontWeight: "bold", margin: "0 0 12px 0" }}>
              Select item to return
            </h2>
            {ordersLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "#888", fontSize: "13px" }}>
                <Spinner size={18} color="#888" /> Loading your orders…
              </div>
            ) : orders.length === 0 ? (
              <div style={{ color: "#888", fontSize: "13px" }}>No recent orders found. Fill in the details below manually.</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {orders.map((order) => (
                  <button
                    key={order.order_id}
                    type="button"
                    onClick={() => handleOrderSelect(order)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      padding: "10px 14px",
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      backgroundColor: "#fafafa",
                      cursor: "pointer",
                      textAlign: "left",
                      width: "100%",
                    }}
                  >
                    <div>
                      <div style={{ fontSize: "14px", fontWeight: "bold", color: "#0F1111" }}>
                        {order.name}
                      </div>
                      <div style={{ fontSize: "12px", color: "#888", marginTop: "2px" }}>
                        Order #{order.order_id} · {new Date(order.order_date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </div>
                    </div>
                    <div style={{ fontSize: "14px", fontWeight: "bold", color: "#B12704", flexShrink: 0, marginLeft: "16px" }}>
                      ₹{order.original_price_inr.toLocaleString("en-IN")}
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Locked Product Summary Card — shown when an order is selected */}
        {!result && selectedOrder && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "16px 20px",
              border: "2px solid #FF9900",
              marginBottom: "16px",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "12px" }}>
              <div style={{ display: "flex", alignItems: "flex-start", gap: "14px" }}>
                {/* Product icon placeholder */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: "6px",
                    backgroundColor: "#EAEDED",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "22px",
                    flexShrink: 0,
                  }}
                >
                  {selectedOrder.category === "shoes" ? "👟"
                    : selectedOrder.category === "phone" ? "📱"
                    : selectedOrder.category === "headphones" ? "🎧"
                    : selectedOrder.category === "bag" ? "🎒"
                    : selectedOrder.category === "jeans" || selectedOrder.category === "shirt" ? "👕"
                    : "📦"}
                </div>
                <div>
                  <div style={{ fontSize: "15px", fontWeight: "bold", color: "#0F1111", marginBottom: "4px" }}>
                    {selectedOrder.name}
                  </div>
                  <div style={{ fontSize: "12px", color: "#555", marginBottom: "2px" }}>
                    <strong>Brand:</strong> {selectedOrder.brand} &nbsp;|&nbsp;
                    <strong>Size:</strong> {selectedOrder.listed_size} &nbsp;|&nbsp;
                    <strong>Color:</strong> {selectedOrder.listed_color}
                  </div>
                  <div style={{ fontSize: "12px", color: "#888" }}>
                    Order #{selectedOrder.order_id} · ₹{selectedOrder.original_price_inr.toLocaleString("en-IN")}
                  </div>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "4px", flexShrink: 0 }}>
                <span
                  style={{
                    fontSize: "11px",
                    color: "#2d6a4f",
                    backgroundColor: "#d8f3dc",
                    border: "1px solid #95d5b2",
                    borderRadius: "4px",
                    padding: "2px 8px",
                    fontWeight: "bold",
                  }}
                >
                  🔒 Fields locked
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedOrder(null);
                    setReturnReason("");
                    setDetailedComments("");
                    setReplacementOption("refund");
                    setListingPrice("");
                  }}
                  style={{
                    background: "none",
                    border: "none",
                    color: "#146EB4",
                    fontSize: "12px",
                    cursor: "pointer",
                    padding: "0",
                    textDecoration: "underline",
                  }}
                >
                  Change item
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Form — hide after result */}
        {!result && (
          <form onSubmit={handleSubmit}>
            {/* Return details (always shown) */}
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "24px",
                border: "1px solid #ddd",
                marginBottom: "16px",
              }}
            >
              {selectedOrder ? (
                <>
                  <h2 style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 16px 0" }}>
                    Return details
                  </h2>

                  {/* Return Reason */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Reason for return *</label>
                    <select
                      value={returnReason}
                      onChange={(e) => setReturnReason(e.target.value)}
                      required
                      style={selectStyle}
                    >
                      <option value="">Select a reason</option>
                      {RETURN_REASON_GROUPS.map((group) => (
                        <optgroup key={group} label={group}>
                          {RETURN_REASONS.filter((r) => r.group === group).map((r) => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>

                  {/* Detailed comments */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Comments (tell us more about the issue)</label>
                    <textarea
                      value={detailedComments}
                      onChange={(e) => setDetailedComments(e.target.value)}
                      placeholder="Describe the issue in detail — helps our team process your return faster"
                      rows={3}
                      style={{
                        ...inputStyle,
                        resize: "vertical",
                        fontFamily: "inherit",
                      }}
                    />
                  </div>

                  {/* Return hub city */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Return hub city</label>
                    <select value={hubCity} onChange={(e) => setHubCity(e.target.value)} style={selectStyle}>
                      {CITIES.map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  {/* Photo upload */}
                  <div style={{ marginBottom: "14px" }}>
                    <label style={labelStyle}>Photos / Camera proof (min 1) *</label>
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
                          Click to browse (required for AI grading)
                        </span>
                      ) : (
                        <span style={{ color: "#2d6a4f", fontSize: "14px", fontWeight: "bold" }}>
                          {photos.length} photo{photos.length > 1 ? "s" : ""} selected — click to change
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Photo previews */}
                  {previewUrls.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "14px" }}>
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

                  {/* Video inspection (optional) */}
                  <div style={{ marginTop: "4px", marginBottom: "14px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "4px", color: "#333" }}>
                      Inspection Video{" "}
                      <span style={{ color: "#888", fontWeight: "normal" }}>(optional, max 60s / 100 MB — overrides photo grading)</span>
                    </label>
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime"
                      onChange={handleVideoChange}
                      style={{ display: "block", fontSize: "13px", color: "#555" }}
                    />
                    {videoPreview && (
                      <video src={videoPreview} controls style={{ marginTop: "8px", height: "128px", borderRadius: "4px", border: "1px solid #ddd", display: "block" }} />
                    )}
                    {video && (
                      <div style={{ fontSize: "12px", color: "#2d6a4f", marginTop: "4px" }}>{video.name} selected</div>
                    )}
                  </div>

                  {/* Replacement Flow Selector */}
                  <div
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: "6px",
                      padding: "16px",
                      backgroundColor: "#fafafa",
                      marginBottom: "14px",
                    }}
                  >
                    <div style={{ fontSize: "14px", fontWeight: "bold", marginBottom: "12px", color: "#0F1111" }}>
                      What would you like to do?
                    </div>

                    {(["refund", "direct_replacement", "replace_with_resale"] as const).map((opt) => {
                      const labels = {
                        refund: { title: "Refund to Wallet", desc: "Receive a full refund to your Amazon Pay balance." },
                        direct_replacement: { title: "Direct Replacement (₹0)", desc: "Amazon ships a brand-new replacement at no extra cost. Your item is sustainably processed." },
                        replace_with_resale: { title: "Get Replacement & List Faulty Item for Sale", desc: "Get a new product AND list your faulty item on Second Life Marketplace at a discount." },
                      };
                      const { title, desc } = labels[opt];
                      return (
                        <label
                          key={opt}
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            gap: "10px",
                            padding: "10px 12px",
                            borderRadius: "6px",
                            border: replacementOption === opt ? "2px solid #FF9900" : "2px solid transparent",
                            backgroundColor: replacementOption === opt ? "#fff8ee" : "transparent",
                            cursor: "pointer",
                            marginBottom: "6px",
                          }}
                        >
                          <input
                            type="radio"
                            name="replacement_option"
                            value={opt}
                            checked={replacementOption === opt}
                            onChange={() => {
                              setReplacementOption(opt);
                              setListingPrice("");
                            }}
                            style={{ marginTop: "2px", cursor: "pointer" }}
                          />
                          <div>
                            <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0F1111" }}>{title}</div>
                            <div style={{ fontSize: "12px", color: "#555", marginTop: "2px" }}>{desc}</div>
                          </div>
                        </label>
                      );
                    })}

                    {/* Listing price input for replace_with_resale */}
                    {replacementOption === "replace_with_resale" && (
                      <div style={{ marginTop: "12px", paddingLeft: "4px" }}>
                        <label style={labelStyle}>Your listing price for the faulty item (₹)</label>

                        {/* Hint when no media yet — recommendation needs the image first */}
                        {photos.length === 0 && !video && (
                          <div style={{ fontSize: "12px", color: "#888", marginBottom: "6px" }}>
                            Upload a photo or video above — the AI inspects it and recommends a price.
                          </div>
                        )}

                        <div style={{ position: "relative" }}>
                          <input
                            type="number"
                            value={listingPrice}
                            onChange={(e) => setListingPrice(e.target.value)}
                            placeholder={priceRec ? `e.g. ₹${priceRec.recommended_price.toLocaleString("en-IN")}` : `e.g. ${Math.round((selectedOrder?.original_price_inr ?? 1000) * 0.4)}`}
                            min="1"
                            style={{
                              ...inputStyle,
                              borderColor: priceWarning
                                ? priceWarning.color === "#2e7d32" ? "#2e7d32"
                                : priceWarning.color === "#B12704" ? "#B12704"
                                : "#856404"
                                : "#ccc",
                            }}
                          />
                        </div>

                        {/* Grading status — only after media upload */}
                        {(photos.length > 0 || !!video) && gradeLoading && (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888", marginTop: "6px" }}>
                            <Spinner size={12} color="#888" /> AI grading your media…
                          </div>
                        )}

                        {/* Real AI grade + recommended price (from inspecting the media) */}
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
                            flexWrap: "wrap",
                          }}>
                            <span style={{ color: "#555" }}>AI grade:</span>
                            <span style={{ fontWeight: "bold", color: GRADE_COLORS[aiGrade] ?? "#555" }}>{aiGrade}</span>
                            <span style={{ color: "#555", marginLeft: "6px" }}>Recommended:</span>
                            <span style={{ fontWeight: "bold", color: "#1a1a1a", fontSize: "14px" }}>
                              ₹{priceRec.recommended_price.toLocaleString("en-IN")}
                            </span>
                            <span style={{ fontSize: "11px", color: "#888" }}>(demand ×{priceRec.demand_factor})</span>
                          </div>
                        )}

                        {(photos.length > 0 || !!video) && !gradeLoading && aiGrade && priceRecLoading && (
                          <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "12px", color: "#888", marginTop: "6px" }}>
                            <Spinner size={12} color="#888" /> Calculating recommended price…
                          </div>
                        )}

                        {/* Traffic-light price warning */}
                        {priceWarning && (photos.length > 0 || !!video) && (
                          <div
                            style={{
                              marginTop: "6px",
                              padding: "8px 12px",
                              borderRadius: "4px",
                              backgroundColor: priceWarning.bg,
                              color: priceWarning.color,
                              fontSize: "12px",
                              fontWeight: "bold",
                              border: `1px solid ${priceWarning.color}30`,
                            }}
                          >
                            {priceWarning.text}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Trade-in toggle */}
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <input
                      type="checkbox"
                      id="trade-in"
                      checked={tradeIn}
                      onChange={(e) => setTradeIn(e.target.checked)}
                      style={{ width: "16px", height: "16px", cursor: "pointer" }}
                    />
                    <label htmlFor="trade-in" style={{ fontSize: "14px", cursor: "pointer" }}>
                      Trade-in for store credit instead
                    </label>
                  </div>
                </>
              ) : (
                <>
                  {/* Manual entry mode (no order selected) */}
                  <h2 style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 4px 0" }}>
                    Item details &amp; photos
                  </h2>
                  <div style={{ fontSize: "12px", color: "#888", marginBottom: "14px" }}>
                    Select an order above to auto-fill and lock fields, or enter details manually below.
                  </div>

                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
                    <div>
                      <label style={labelStyle}>Item name</label>
                      <input type="text" value={itemName} onChange={(e) => setItemName(e.target.value)} placeholder="e.g. Nike Air Max 270" style={inputStyle} />
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
                        <input type="text" value={otherCategory} onChange={(e) => setOtherCategory(e.target.value)} placeholder="Describe the product type" style={{ ...inputStyle, marginTop: "6px" }} />
                      )}
                    </div>

                    <div>
                      <label style={labelStyle}>Brand</label>
                      <input type="text" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="e.g. Nike" style={inputStyle} />
                    </div>

                    <div>
                      <label style={labelStyle}>Reason for return *</label>
                      <select value={returnReason} onChange={(e) => setReturnReason(e.target.value)} required style={selectStyle}>
                        <option value="">Select a reason</option>
                        {RETURN_REASON_GROUPS.map((group) => (
                          <optgroup key={group} label={group}>
                            {RETURN_REASONS.filter((r) => r.group === group).map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label style={labelStyle}>Original price (₹)</label>
                      <input type="number" value={originalPrice} onChange={(e) => setOriginalPrice(e.target.value)} placeholder="e.g. 9999" min="1" style={inputStyle} />
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
                      <input type="text" value={size} onChange={(e) => setSize(e.target.value)} placeholder="e.g. M, US 10, 32x30" style={inputStyle} />
                    </div>

                    <div>
                      <label style={labelStyle}>Colour</label>
                      <input type="text" value={color} onChange={(e) => setColor(e.target.value)} placeholder="e.g. black" style={inputStyle} />
                    </div>
                  </div>

                  {/* Comments */}
                  <div style={{ marginTop: "14px" }}>
                    <label style={labelStyle}>Comments</label>
                    <textarea
                      value={detailedComments}
                      onChange={(e) => setDetailedComments(e.target.value)}
                      placeholder="Describe the issue"
                      rows={2}
                      style={{ ...inputStyle, resize: "vertical", fontFamily: "inherit" }}
                    />
                  </div>

                  {/* Photo upload */}
                  <div style={{ marginTop: "16px" }}>
                    <label style={labelStyle}>Photos (min 1) *</label>
                    <div
                      style={{ border: "2px dashed #ddd", borderRadius: "6px", padding: "20px", textAlign: "center", cursor: "pointer", backgroundColor: "#fafafa" }}
                      onClick={() => fileRef.current?.click()}
                    >
                      <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={(e) => { if (e.target.files) setPhotos(Array.from(e.target.files)); }} />
                      {photos.length === 0 ? (
                        <span style={{ color: "#888", fontSize: "14px" }}>Click to browse (required for AI grading)</span>
                      ) : (
                        <span style={{ color: "#2d6a4f", fontSize: "14px", fontWeight: "bold" }}>{photos.length} photo{photos.length > 1 ? "s" : ""} selected — click to change</span>
                      )}
                    </div>
                  </div>

                  {/* Photo previews */}
                  {previewUrls.length > 0 && (
                    <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "10px" }}>
                      {previewUrls.map((url, i) => (
                        <div key={i} style={{ position: "relative" }}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={url} alt={`Photo ${i + 1}`} style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 4, border: "1px solid #ddd", display: "block" }} />
                          <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))} style={{ position: "absolute", top: -6, right: -6, width: 18, height: 18, borderRadius: "50%", backgroundColor: "#B12704", color: "white", border: "none", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}>×</button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Video inspection (optional) */}
                  <div style={{ marginTop: "16px" }}>
                    <label style={{ display: "block", fontSize: "13px", fontWeight: "bold", marginBottom: "4px", color: "#333" }}>
                      Inspection Video{" "}
                      <span style={{ color: "#888", fontWeight: "normal" }}>(optional, max 60s / 100 MB — overrides photo grading)</span>
                    </label>
                    <input
                      type="file"
                      accept="video/mp4,video/quicktime"
                      onChange={handleVideoChange}
                      style={{ display: "block", fontSize: "13px", color: "#555" }}
                    />
                    {videoPreview && (
                      <video src={videoPreview} controls style={{ marginTop: "8px", height: "128px", borderRadius: "4px", border: "1px solid #ddd", display: "block" }} />
                    )}
                    {video && (
                      <div style={{ fontSize: "12px", color: "#2d6a4f", marginTop: "4px" }}>{video.name} selected</div>
                    )}
                  </div>

                  {/* Trade-in toggle */}
                  <div style={{ marginTop: "16px", display: "flex", alignItems: "center", gap: "10px" }}>
                    <input type="checkbox" id="trade-in" checked={tradeIn} onChange={(e) => setTradeIn(e.target.checked)} style={{ width: "16px", height: "16px", cursor: "pointer" }} />
                    <label htmlFor="trade-in" style={{ fontSize: "14px", cursor: "pointer" }}>
                      Trade-in for store credit (receive credit instead of return approval)
                    </label>
                  </div>
                </>
              )}
            </div>

            {error && (
              <div style={{ border: "1px solid #f5c6cb", backgroundColor: "#f8d7da", borderRadius: "6px", padding: "12px 16px", color: "#721c24", fontSize: "14px", marginBottom: "16px" }}>
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
              {loading ? (
                <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                  <Spinner size={16} color="#000" /> Processing...
                </span>
              ) : "Submit Return →"}
            </button>
          </form>
        )}

        {/* Result screen */}
        {result && (
          <div style={{ backgroundColor: "white", borderRadius: "8px", padding: "24px", border: "1px solid #ddd" }}>
            <h2 style={{ fontSize: "16px", fontWeight: "bold", margin: "0 0 16px 0" }}>
              Return Summary
            </h2>

            {isManualReview ? (
              <div style={{ border: "1px solid #ffc107", backgroundColor: "#fff8e1", borderRadius: "6px", padding: "16px", color: "#856404" }}>
                <strong>Item flagged for manual review.</strong> Our team will assess your item and contact you within 24 hours.
              </div>
            ) : (
              <>
                {/* Green banner */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", backgroundColor: "#d8f3dc", borderRadius: "6px", padding: "12px 16px", marginBottom: "16px", color: "#1b4332", fontWeight: "bold" }}>
                  <LeafIcon />
                  Your item earns a second life
                </div>

                {/* Replacement confirmation */}
                {replacementOption !== "refund" && (
                  <div
                    style={{
                      backgroundColor: "#e8f4fd",
                      border: "1px solid #90caf9",
                      borderRadius: "6px",
                      padding: "12px 16px",
                      marginBottom: "16px",
                      fontSize: "13px",
                      color: "#0d47a1",
                    }}
                  >
                    {replacementOption === "direct_replacement"
                      ? "✓ Direct Replacement scheduled — Amazon will ship a new item within 3-5 business days."
                      : "✓ Replacement scheduled + your faulty item has been listed on Second Life Marketplace."}
                  </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "16px" }}>
                  <InfoRow label="Grade" value={result.grade} />
                  <InfoRow label="Route" value={ROUTE_LABELS[result.disposition] ?? result.disposition} />
                  {result.portfolio_recovered_value_inr ? (
                    <InfoRow
                      label="Recovery metric"
                      value={`₹${result.portfolio_recovered_value_inr.toLocaleString("en-IN")} on ₹${(result.portfolio_recovery_basis_inr ?? 1000).toLocaleString("en-IN")} AOV`}
                    />
                  ) : null}
                  <InfoRow label="You earn" value={`${result.credits} green credits`} />
                  <InfoRow label="CO₂ saved" value={`${result.co2_saved_kg} kg ≈ ${Math.round((result.co2_saved_kg ?? 0) * 5)} km by car`} />
                </div>

                {/* AI Listing-Accuracy Check — seller's claim vs your report */}
                {(() => {
                  const sellerClaim = result.seller_description || selectedOrder?.seller_description;
                  if (!sellerClaim) return null;
                  const yourReport =
                    result.returner_report ||
                    detailedComments ||
                    result.return_reason_text ||
                    "";
                  const mismatch =
                    result.claim_color_mismatch
                      ? "colour"
                      : result.claim_size_mismatch
                      ? "size"
                      : result.claim_condition_mismatch
                      ? "condition"
                      : null;
                  return (
                    <div
                      style={{
                        border: `1px solid ${mismatch ? "#ffc107" : "#95d5b2"}`,
                        backgroundColor: mismatch ? "#fff8e1" : "#f0faf4",
                        borderRadius: "6px",
                        padding: "14px 16px",
                        marginBottom: "16px",
                      }}
                    >
                      <div style={{ fontSize: "13px", fontWeight: "bold", color: "#0F1111", marginBottom: "8px" }}>
                        🔍 AI Listing-Accuracy Check
                      </div>
                      <div style={{ fontSize: "12px", color: "#555", marginBottom: "2px" }}>
                        <strong>Seller's listing claimed:</strong>
                      </div>
                      <div style={{ fontSize: "13px", color: "#333", marginBottom: "8px", fontStyle: "italic" }}>
                        "{sellerClaim}"
                      </div>
                      <div style={{ fontSize: "12px", color: "#555", marginBottom: "2px" }}>
                        <strong>You reported:</strong>
                      </div>
                      <div style={{ fontSize: "13px", color: "#333", marginBottom: "10px", fontStyle: "italic" }}>
                        "{yourReport}"{result.return_reason_text ? ` (reason: ${result.return_reason_text})` : ""}
                      </div>
                      {mismatch ? (
                        <div style={{ fontSize: "13px", color: "#856404" }}>
                          ⚠ <strong>Discrepancy detected ({mismatch}).</strong>{" "}
                          {result.claim_discrepancy_notes}
                          <div style={{ fontSize: "12px", color: "#856404", marginTop: "6px" }}>
                            A {mismatch} alert will now appear on this product's page to protect future buyers.
                          </div>
                        </div>
                      ) : (
                        <div style={{ fontSize: "13px", color: "#2d6a4f" }}>
                          ✓ No discrepancy found — your report is consistent with the seller's description.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {result.top_matches && result.top_matches.length > 0 && (
                  <div style={{ marginBottom: "16px" }}>
                    <div style={{ fontSize: "13px", fontWeight: "bold", marginBottom: "4px" }}>Top buyer match</div>
                    <div style={{ fontSize: "13px", color: "#333" }}>
                      {result.top_matches[0].name} · re-return risk {(result.top_matches[0].re_return_risk * 100).toFixed(1)}%
                    </div>
                    {result.top_matches[0].why_this_fits && (
                      <div style={{ fontSize: "12px", color: "#555", marginTop: "4px", fontStyle: "italic" }}>
                        "{result.top_matches[0].why_this_fits}"
                      </div>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <button
                    style={{ backgroundColor: "#FF9900", color: "#000", border: "none", borderRadius: "4px", padding: "10px 24px", fontSize: "14px", fontWeight: "bold", cursor: "pointer" }}
                    onClick={() => router.push("/")}
                  >
                    Continue →
                  </button>

                  {/* Human review button */}
                  {!reviewRequested ? (
                    <button
                      onClick={handleRequestReview}
                      disabled={reviewLoading}
                      style={{
                        backgroundColor: "white",
                        color: "#146EB4",
                        border: "1px solid #146EB4",
                        borderRadius: "4px",
                        padding: "10px 18px",
                        fontSize: "13px",
                        cursor: reviewLoading ? "not-allowed" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      {reviewLoading ? <Spinner size={14} color="#146EB4" /> : "🧑‍💼"} Request Human Review
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

                <div style={{ fontSize: "11px", color: "#888", marginTop: "10px" }}>
                  Not happy with the AI Grade? A circular commerce expert will manually verify your item.
                </div>
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
    <div style={{ backgroundColor: "#f9f9f9", borderRadius: "4px", padding: "10px 14px", border: "1px solid #eee" }}>
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
