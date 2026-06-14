import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface OpsItem {
  item_id: string;
  name: string;
  status: string;
  grade: string;
  disposition: string;
  base_price_inr: number;
  top_match_buyer_id: string;
  top_match_risk: number;
  size_mismatch: boolean;
  color_mismatch: boolean;
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
  manual_review: "#856404",
  recycle: "#b71c1c",
  donate: "#0277BD",
  refurbish: "#6a1b9a",
};

function riskColor(risk: number): { color: string; bg: string; label: string } {
  if (risk < 0.1) return { color: "#2d6a4f", bg: "#d8f3dc", label: "low risk" };
  if (risk <= 0.25) return { color: "#856404", bg: "#fff8e1", label: "medium risk" };
  return { color: "#b71c1c", bg: "#fce4ec", label: "high risk" };
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "listed", label: "Listed" },
  { value: "manual_review", label: "Manual Review" },
  { value: "recycle", label: "Recycle" },
  { value: "donate", label: "Donate" },
  { value: "refurbish", label: "Refurbish" },
];

export default function OpsPage() {
  const [items, setItems] = useState<OpsItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [notifyStatus, setNotifyStatus] = useState<Record<string, string>>({});

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
          <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>
            Loading items...
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

        {!loading && items.map((item) => {
          const risk = item.top_match_risk ?? 0;
          const rc = riskColor(risk);

          return (
            <div
              key={item.item_id}
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "16px 20px",
                border: "1px solid #ddd",
                marginBottom: "12px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
              }}
            >
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
                  {item.status}
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
                  Route: <strong>{item.disposition ?? "—"}</strong>
                </span>
                <span>
                  Price:{" "}
                  <strong style={{ color: "#B12704" }}>
                    ₹{item.base_price_inr?.toLocaleString("en-IN") ?? "—"}
                  </strong>
                </span>
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
                  [!]{" "}
                  {item.size_mismatch && "Size mismatch detected"}
                  {item.size_mismatch && item.color_mismatch && " · "}
                  {item.color_mismatch && "Color mismatch detected"}
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
                    marginBottom: "12px",
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
