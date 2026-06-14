import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

function CheckIcon() {
  return (
    <svg width="32" height="32" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

export default function OrderConfirmPage() {
  const router = useRouter();
  const [buyerName, setBuyerName] = useState("");
  const [currentCredits, setCurrentCredits] = useState<number | null>(null);
  const [orderNo, setOrderNo] = useState("");

  const total = Number(router.query.total ?? 0);
  const co2 = Number(router.query.co2 ?? 0);
  const credits = Number(router.query.credits ?? 0);
  const itemCount = Number(router.query.items ?? 1);

  useEffect(() => {
    fetch(`${API_BASE}/buyers/${BUYER_ID}`)
      .then((r) => r.json())
      .then((d) => {
        if (d?.name) setBuyerName(d.name);
        if (typeof d?.credit_score === "number") setCurrentCredits(d.credit_score);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    // Generate a plausible order number once on mount (client-side only).
    const n = Math.floor(Math.random() * 9000000) + 1000000;
    setOrderNo(`402-${n}-${Math.floor(Math.random() * 9000000) + 1000000}`);
  }, []);

  const carKm = Math.round(co2 * 5);
  const newTotal = currentCredits !== null ? currentCredits + credits : null;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "32px 16px" }}>
        {/* Success header */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "8px" }}>
          <CheckIcon />
          <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, color: "#0F1111" }}>
            Order Confirmed{buyerName ? ` — Thank you, ${buyerName}!` : "!"}
          </h1>
        </div>
        {orderNo && (
          <p style={{ fontSize: "13px", color: "#555", margin: "0 0 4px 0" }}>
            Order #{orderNo}
          </p>
        )}
        <p style={{ fontSize: "14px", color: "#333", margin: "0 0 24px 0" }}>
          {itemCount} item{itemCount !== 1 ? "s" : ""} ·{" "}
          <strong style={{ color: "#B12704" }}>₹{total.toLocaleString("en-IN")}</strong>{" "}
          — arriving soon.
        </p>

        {/* Green impact panel */}
        {co2 > 0 ? (
          <div
            style={{
              border: "1px solid #b2d8b2",
              borderRadius: "8px",
              padding: "20px 24px",
              backgroundColor: "#f1f8e9",
              marginBottom: "20px",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px" }}>
              <LeafIcon />
              <span style={{ fontSize: "16px", fontWeight: "bold", color: "#1b4332" }}>
                Your green impact
              </span>
            </div>
            <p style={{ margin: "0 0 6px 0", fontSize: "14px", color: "#333" }}>
              You saved <strong>{co2} kg CO₂</strong> by choosing certified second-life instead of
              buying new.
            </p>
            <p style={{ margin: "0 0 12px 0", fontSize: "13px", color: "#555" }}>
              That&apos;s equivalent to about <strong>{carKm} km</strong> driven by car.
            </p>
            {credits > 0 && (
              <p style={{ margin: 0, fontSize: "14px", color: "#1b4332" }}>
                <strong>+{credits} green credits</strong> added.
                {newTotal !== null && (
                  <>
                    {" "}
                    Total: <strong>{newTotal} credits</strong>.
                  </>
                )}{" "}
                Redeem them on your next Second Life purchase.
              </p>
            )}
          </div>
        ) : (
          <div
            style={{
              border: "1px solid #ffe0b2",
              borderRadius: "8px",
              padding: "16px 20px",
              backgroundColor: "#fff8e1",
              marginBottom: "20px",
              fontSize: "13px",
              color: "#856404",
            }}
          >
            Tip: choosing a <strong>Certified Second Life</strong> version of this item saves CO₂ and
            earns you green credits.
          </div>
        )}

        {/* Actions */}
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <Link
            href="/"
            style={{
              backgroundColor: "#FF9900",
              color: "#000",
              borderRadius: "4px",
              padding: "10px 24px",
              fontSize: "14px",
              fontWeight: "bold",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Browse more Second Life items
          </Link>
          <Link
            href="/return"
            style={{
              backgroundColor: "white",
              color: "#146EB4",
              border: "1px solid #146EB4",
              borderRadius: "4px",
              padding: "10px 24px",
              fontSize: "14px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Returns &amp; Sell
          </Link>
          <Link
            href="/ops"
            style={{
              backgroundColor: "white",
              color: "#555",
              border: "1px solid #ddd",
              borderRadius: "4px",
              padding: "10px 24px",
              fontSize: "14px",
              textDecoration: "none",
              display: "inline-block",
            }}
          >
            Ops Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
