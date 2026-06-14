import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";
import Spinner from "../components/Spinner";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface OpsItem {
  item_id: string;
  name: string;
  brand: string;
  category: string;
  status: string;
  grade: string;
  disposition: string;
  base_price_inr: number;
  original_price_inr: number;
  top_match_buyer_id: string;
  top_match_risk: number;
  top_match_why: string;
  size_mismatch: boolean;
  color_mismatch: boolean;
  defects: { type: string; severity: string; evidence?: string }[];
  grading_notes: string;
  listing_type: string;
  listing_notes: string;
  replacement_queued: boolean;
  co2_saved_kg: number;
  credits: number;
  evidence: string[];
  confidence_bucket: string;
  wear_level: string;
  rubric_version: string;
  grader_input_hash: string;
}

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  REVIEW: "#6a1b9a",
};

const STATUS_COLORS: Record<string, string> = {
  listed: "#2e7d32",
  pending: "#e65100",
  manual_review: "#b71c1c",
  recycle: "#b71c1c",
  donate: "#0277BD",
  refurbish: "#6a1b9a",
};

const STATUS_LABELS: Record<string, string> = {
  listed: "Listed",
  pending: "Pending",
  manual_review: "Manual Review",
  recycle: "Recycle",
  donate: "Donate",
  refurbish: "Refurbish",
};

const DISPOSITION_LABELS: Record<string, string> = {
  resell: "Certified Resell",
  refurbish: "Refurbish",
  donate: "Donate",
  recycle: "Recycle",
  exchange: "Trade-in Credit",
  manual_review: "Manual Review",
};

const GRADE_FACTORS: Record<string, number> = { A: 0.70, B: 0.55, C: 0.40, D: 0.20 };

function riskColor(risk: number): { color: string; bg: string; label: string } {
  if (risk < 0.1) return { color: "#2d6a4f", bg: "#d8f3dc", label: "low risk" };
  if (risk <= 0.25) return { color: "#856404", bg: "#fff8e1", label: "medium risk" };
  return { color: "#b71c1c", bg: "#fce4ec", label: "high risk" };
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "listed", label: "Listed" },
  { value: "manual_review", label: "Human Review" },
  { value: "recycle", label: "Recycle" },
  { value: "donate", label: "Donate" },
  { value: "refurbish", label: "Refurbish" },
];

export default function OpsPage() {
  const [items, setItems] = useState<OpsItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [notifyStatus, setNotifyStatus] = useState<Record<string, string>>({});
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  const fetchItems = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: "50" });
    if (statusFilter) params.append("status", statusFilter);

    fetch(`${API_BASE}/ops/items?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.items) setItems(data.items);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  async function handleNotify(item: OpsItem) {
    setNotifyStatus((prev) => ({ ...prev, [item.item_id]: "sending..." }));
    try {
      const res = await fetch(`${API_BASE}/notify-seller`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: item.item_id,
          event: "matched",
          top_match_buyer_id: item.top_match_buyer_id,
          re_return_risk: item.top_match_risk,
          base_price_inr: item.base_price_inr,
        }),
      });
      const data = await res.json();
      setNotifyStatus((prev) => ({
        ...prev,
        [item.item_id]: data.notified ? "Notified" : "Failed",
      }));
    } catch {
      setNotifyStatus((prev) => ({ ...prev, [item.item_id]: "Error" }));
    }
  }

  function toggleExpand(itemId: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  }

  const isHumanReview = (item: OpsItem) => item.status === "manual_review";

  // Sort: human review items first
  const sortedItems = [...items].sort((a, b) => {
    if (isHumanReview(a) && !isHumanReview(b)) return -1;
    if (!isHumanReview(a) && isHumanReview(b)) return 1;
    return 0;
  });

  const humanReviewCount = items.filter(isHumanReview).length;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      {/* Sub-nav */}
      <div style={{ backgroundColor: "#37475A", padding: "6px 16px", fontSize: "13px", color: "white" }}>
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span style={{ color: "#ccc" }}>Ops</span>
          {" > "}
          <span>Item Intelligence Dashboard</span>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 16px 0" }}>
          Item Intelligence Dashboard
        </h1>

        {/* Human review alert banner */}
        {humanReviewCount > 0 && (
          <div
            style={{
              backgroundColor: "#fce4ec",
              border: "2px solid #e53935",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "16px",
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#b71c1c",
              fontWeight: "bold",
              fontSize: "14px",
            }}
          >
            🚨 {humanReviewCount} item{humanReviewCount !== 1 ? "s" : ""} require human review
            <button
              onClick={() => setStatusFilter("manual_review")}
              style={{
                marginLeft: "auto",
                backgroundColor: "#e53935",
                color: "white",
                border: "none",
                borderRadius: "4px",
                padding: "4px 12px",
                fontSize: "12px",
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              View All
            </button>
          </div>
        )}

        {/* Filters */}
        <div
          style={{
            backgroundColor: "white",
            borderRadius: "8px",
            padding: "14px 16px",
            border: "1px solid #ddd",
            marginBottom: "20px",
            display: "flex",
            gap: "16px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <label style={{ fontSize: "13px", fontWeight: "bold", marginRight: "8px" }}>
              Filter:
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                padding: "6px 10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "13px",
                backgroundColor: "white",
                cursor: "pointer",
              }}
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>

          <button
            onClick={fetchItems}
            style={{
              backgroundColor: "#FF9900",
              color: "#000",
              border: "none",
              borderRadius: "4px",
              padding: "7px 16px",
              fontSize: "13px",
              fontWeight: "bold",
              cursor: "pointer",
            }}
          >
            Refresh
          </button>

          <span style={{ fontSize: "13px", color: "#555", marginLeft: "auto" }}>
            {items.length} item{items.length !== 1 ? "s" : ""}
          </span>
        </div>

        {loading && (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Spinner size={36} />
          </div>
        )}

        {!loading && items.length === 0 && (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "40px",
              textAlign: "center",
              color: "#555",
              border: "1px solid #ddd",
            }}
          >
            No items found{statusFilter ? ` with status "${statusFilter}"` : ""}.
          </div>
        )}

        {!loading && sortedItems.map((item) => {
          const risk = item.top_match_risk ?? 0;
          const rc = riskColor(risk);
          const isReview = isHumanReview(item);
          const isExpanded = expandedItems.has(item.item_id);
          const hasDefects = item.defects && item.defects.length > 0;
          const hasEvidence = item.evidence && item.evidence.length > 0;

          return (
            <div
              key={item.item_id}
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "16px 20px",
                border: isReview ? "2px solid #e53935" : "1px solid #ddd",
                marginBottom: "12px",
                boxShadow: isReview ? "0 2px 8px rgba(229,57,53,0.15)" : "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
              {/* HUMAN REVIEW REQUESTED banner */}
              {isReview && (
                <div
                  style={{
                    backgroundColor: "#b71c1c",
                    color: "white",
                    borderRadius: "4px",
                    padding: "6px 12px",
                    fontSize: "12px",
                    fontWeight: "bold",
                    marginBottom: "12px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  🚨 HUMAN REVIEW REQUESTED — Awaiting manual verification
                </div>
              )}

              {/* Header row */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  marginBottom: "10px",
                  flexWrap: "wrap",
                }}
              >
                <span style={{ fontWeight: "bold", fontSize: "15px", color: "#0F1111" }}>
                  {item.item_id} · {item.name}
                </span>

                <span
                  style={{
                    backgroundColor: STATUS_COLORS[item.status] ?? "#555",
                    color: "white",
                    borderRadius: "4px",
                    padding: "2px 8px",
                    fontSize: "11px",
                    fontWeight: "bold",
                  }}
                >
                  {STATUS_LABELS[item.status] ?? item.status}
                </span>

                {item.grade && (
                  <span
                    style={{
                      backgroundColor: GRADE_COLORS[item.grade] ?? "#555",
                      color: "white",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    Grade {item.grade}
                  </span>
                )}

                {item.listing_type === "defective_deal" && (
                  <span
                    style={{
                      backgroundColor: "#e65100",
                      color: "white",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    Defective Deal
                  </span>
                )}

                {item.replacement_queued && (
                  <span
                    style={{
                      backgroundColor: "#0277BD",
                      color: "white",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "11px",
                      fontWeight: "bold",
                    }}
                  >
                    Replacement Queued
                  </span>
                )}
              </div>

              {/* Details row */}
              <div
                style={{
                  display: "flex",
                  gap: "24px",
                  flexWrap: "wrap",
                  fontSize: "13px",
                  color: "#333",
                  marginBottom: "10px",
                }}
              >
                <span>
                  Route: <strong>{DISPOSITION_LABELS[item.disposition] ?? item.disposition ?? "—"}</strong>
                </span>
                <span>
                  Price:{" "}
                  <strong style={{ color: "#B12704" }}>
                    ₹{item.base_price_inr?.toLocaleString("en-IN") ?? "—"}
                  </strong>
                  {item.original_price_inr > 0 && item.grade && GRADE_FACTORS[item.grade] && (
                    <span style={{ color: "#888", fontSize: "11px", marginLeft: "4px" }}>
                      ({Math.round(GRADE_FACTORS[item.grade] * 100)}% of ₹{item.original_price_inr.toLocaleString("en-IN")} MRP)
                    </span>
                  )}
                </span>
                {item.co2_saved_kg > 0 && (
                  <span style={{ color: "#2d6a4f" }}>
                    🌿 {item.co2_saved_kg} kg CO₂ saved
                  </span>
                )}
              </div>

              {/* Mismatch flags */}
              {(item.size_mismatch || item.color_mismatch) && (
                <div
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#fff8e1",
                    border: "1px solid #ffc107",
                    borderRadius: "4px",
                    padding: "4px 10px",
                    fontSize: "12px",
                    color: "#856404",
                    marginBottom: "10px",
                  }}
                >
                  ⚠{" "}
                  {item.size_mismatch && "Size mismatch detected"}
                  {item.size_mismatch && item.color_mismatch && " · "}
                  {item.color_mismatch && "Color mismatch detected"}
                </div>
              )}

              {/* Listing notes (defective deal) */}
              {item.listing_notes && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#e65100",
                    backgroundColor: "#fff3e0",
                    border: "1px solid #ffcc80",
                    borderRadius: "4px",
                    padding: "6px 10px",
                    marginBottom: "10px",
                  }}
                >
                  📋 {item.listing_notes}
                </div>
              )}

              {/* Top match + risk */}
              {item.top_match_buyer_id && (
                <div
                  style={{
                    display: "flex",
                    gap: "16px",
                    flexWrap: "wrap",
                    fontSize: "13px",
                    marginBottom: "10px",
                    alignItems: "center",
                  }}
                >
                  <span>
                    <strong>TOP MATCH:</strong> {item.top_match_buyer_id}
                  </span>
                  <span
                    style={{
                      backgroundColor: rc.bg,
                      color: rc.color,
                      borderRadius: "4px",
                      padding: "2px 10px",
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    risk {(risk * 100).toFixed(1)}% — {rc.label}
                  </span>
                </div>
              )}

              {/* AI match explanation */}
              {item.top_match_why && (
                <div
                  style={{
                    fontSize: "12px",
                    color: "#333",
                    backgroundColor: "#f1f8e9",
                    border: "1px solid #c8e6c9",
                    borderRadius: "4px",
                    padding: "6px 10px",
                    marginBottom: "10px",
                    fontStyle: "italic",
                  }}
                >
                  🤖 Match rationale: "{item.top_match_why}"
                </div>
              )}

              {/* Expandable AI grading breakdown */}
              {(hasDefects || hasEvidence || item.grading_notes) && (
                <div style={{ marginBottom: "10px" }}>
                  <button
                    onClick={() => toggleExpand(item.item_id)}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#146EB4",
                      fontSize: "12px",
                      cursor: "pointer",
                      padding: "0",
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    {isExpanded ? "▼" : "▶"} AI Grading Breakdown
                    {item.confidence_bucket && (
                      <span style={{ marginLeft: "8px", fontSize: "11px", color: "#888" }}>
                        · {item.confidence_bucket} confidence
                      </span>
                    )}
                  </button>

                  {isExpanded && (
                    <div
                      style={{
                        marginTop: "8px",
                        padding: "12px 14px",
                        backgroundColor: "#f0f7ff",
                        border: "1px solid #bbd6f5",
                        borderRadius: "6px",
                        fontSize: "12px",
                      }}
                    >
                      {/* AI observations */}
                      {hasEvidence && (
                        <div style={{ marginBottom: "10px" }}>
                          <strong style={{ color: "#1a3a5c" }}>AI Visual Observations:</strong>
                          <ul style={{ margin: "4px 0 0 16px", padding: 0, color: "#333" }}>
                            {item.evidence.map((obs, i) => (
                              <li key={i} style={{ marginBottom: "3px" }}>{obs}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Defects */}
                      {hasDefects && (
                        <div style={{ marginBottom: "8px" }}>
                          <strong style={{ color: "#1a3a5c" }}>Defects detected:</strong>
                          <ul style={{ margin: "4px 0 0 16px", padding: 0 }}>
                            {item.defects.map((d, i) => (
                              <li key={i} style={{ marginBottom: "2px", color: "#555" }}>
                                {d.type} — <em>{d.severity}</em>
                                {d.evidence && <span style={{ color: "#888" }}> · {d.evidence}</span>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {!hasDefects && !hasEvidence && (
                        <div style={{ color: "#2d6a4f", marginBottom: "8px" }}>
                          ✓ No defects detected
                        </div>
                      )}
                      {item.grading_notes && (
                        <div style={{ marginBottom: "6px" }}>
                          <strong>Notes:</strong>{" "}
                          <span style={{ color: "#555" }}>{item.grading_notes}</span>
                        </div>
                      )}
                      {item.grade && (
                        <div style={{ marginTop: "6px", color: "#555" }}>
                          Grade {item.grade} → {Math.round((GRADE_FACTORS[item.grade] ?? 0.4) * 100)}% recovery factor
                          {item.original_price_inr > 0 && ` → ₹${Math.round(item.original_price_inr * (GRADE_FACTORS[item.grade] ?? 0.4)).toLocaleString("en-IN")} recovered`}
                        </div>
                      )}
                      {/* Audit trail */}
                      {(item.rubric_version || item.grader_input_hash) && (
                        <div style={{ borderTop: "1px solid #dce8f5", marginTop: "8px", paddingTop: "6px", color: "#999", display: "flex", gap: "12px", flexWrap: "wrap" }}>
                          {item.rubric_version && <span>Rubric: {item.rubric_version}</span>}
                          {item.grader_input_hash && <span>Hash: {item.grader_input_hash.slice(0, 12)}…</span>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Action buttons */}
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <Link
                  href={`/refurb/${item.item_id}`}
                  style={{
                    color: "#146EB4",
                    fontSize: "13px",
                    border: "1px solid #146EB4",
                    borderRadius: "4px",
                    padding: "5px 12px",
                    textDecoration: "none",
                  }}
                >
                  View Item
                </Link>

                {item.top_match_buyer_id && (
                  <button
                    onClick={() => handleNotify(item)}
                    disabled={!!notifyStatus[item.item_id]}
                    style={{
                      backgroundColor: notifyStatus[item.item_id] ? "#f0f0f0" : "#FF9900",
                      color: notifyStatus[item.item_id] ? "#555" : "#000",
                      border: "none",
                      borderRadius: "4px",
                      padding: "5px 12px",
                      fontSize: "13px",
                      fontWeight: "bold",
                      cursor: notifyStatus[item.item_id] ? "not-allowed" : "pointer",
                    }}
                  >
                    {notifyStatus[item.item_id] ?? "Notify Seller"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
