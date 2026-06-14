import { useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

interface CreditsRedemptionProps {
  buyer_id: string;
  item_id: string;
  buyer_credit_score: number;
  base_price_inr: number;
  onApplied: (final_price: number, credits_used: number) => void;
}

export default function CreditsRedemption({
  buyer_id,
  item_id,
  buyer_credit_score,
  base_price_inr,
  onApplied,
}: CreditsRedemptionProps) {
  const [applied, setApplied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [appliedResult, setAppliedResult] = useState<{ credits_used: number; final_price_inr: number } | null>(null);

  const credits_to_use = Math.min(buyer_credit_score, 50);
  const previewPrice = base_price_inr - credits_to_use;

  async function handleApply() {
    if (applied || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/credits/redeem`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ buyer_id, item_id, credits_to_use }),
      });
      const data = await res.json();
      if (data.final_price_inr !== undefined) {
        setApplied(true);
        setAppliedResult({ credits_used: data.credits_used, final_price_inr: data.final_price_inr });
        onApplied(data.final_price_inr, data.credits_used);
      } else {
        setError(data?.error?.message ?? "Failed to apply credits.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        border: "1px solid #c3e6cb",
        borderRadius: "6px",
        padding: "14px 16px",
        backgroundColor: "#f6fff8",
      }}
    >
      <div style={{ fontWeight: "bold", fontSize: "13px", marginBottom: "6px", color: "#1b4332" }}>
        USE YOUR CREDITS
      </div>
      <div style={{ fontSize: "13px", color: "#333", marginBottom: "8px" }}>
        You have <strong>{buyer_credit_score} credits (₹{buyer_credit_score})</strong>
      </div>

      {!applied ? (
        <>
          <div style={{ fontSize: "13px", color: "#555", marginBottom: "10px" }}>
            Apply {credits_to_use} credits → ₹{previewPrice.toLocaleString("en-IN")}
          </div>
          <button
            onClick={handleApply}
            disabled={loading || buyer_credit_score === 0}
            style={{
              backgroundColor: loading ? "#aaa" : "#FF9900",
              color: "#000",
              border: "none",
              borderRadius: "4px",
              padding: "8px 16px",
              fontSize: "13px",
              fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Applying..." : `Apply ${credits_to_use} Credits — ON`}
          </button>
          {error && (
            <div style={{ fontSize: "12px", color: "#b71c1c", marginTop: "6px" }}>{error}</div>
          )}
        </>
      ) : (
        <div style={{ fontSize: "13px", color: "#2d6a4f" }}>
          <strong>
            ✓ {appliedResult?.credits_used} credits applied — Price: ₹
            {appliedResult?.final_price_inr.toLocaleString("en-IN")}
          </strong>
        </div>
      )}
    </div>
  );
}
