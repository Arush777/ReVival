import { useRouter } from "next/router";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";
import Spinner from "../components/Spinner";

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
    </svg>
  );
}

function CoinIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="#FF9900" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.91s4.18 1.39 4.18 3.91c-.01 1.83-1.38 2.83-3.12 3.16z" />
    </svg>
  );
}

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  REVIEW: "#6a1b9a",
};

export default function ExchangePage() {
  const router = useRouter();

  const item_id = String(router.query.item_id ?? "");
  const name = String(router.query.name ?? "Your item");
  const grade = String(router.query.grade ?? "");
  const credit = Number(router.query.credit ?? 0);
  const co2 = Number(router.query.co2 ?? 0);
  const credits = Number(router.query.credits ?? 0);

  const isReady = router.isReady;

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      {/* Sub-nav */}
      <div style={{ backgroundColor: "#37475A", padding: "6px 16px", fontSize: "13px", color: "white" }}>
        <div style={{ maxWidth: "800px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span style={{ color: "#ccc" }}>Returns</span>
          {" > "}
          <span>Trade-in Credit Confirmed</span>
        </div>
      </div>

      <div style={{ maxWidth: "800px", margin: "0 auto", padding: "24px 16px" }}>
        {!isReady ? (
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 0" }}>
            <Spinner size={32} />
          </div>
        ) : (
          <>
            {/* Success header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "12px",
                marginBottom: "24px",
              }}
            >
              <CheckIcon />
              <h1 style={{ fontSize: "24px", fontWeight: "bold", margin: 0, color: "#0F1111" }}>
                Trade-in complete!
              </h1>
            </div>

            {/* Item summary */}
            <div
              style={{
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "20px 24px",
                border: "1px solid #ddd",
                marginBottom: "16px",
              }}
            >
              <div style={{ fontSize: "15px", marginBottom: "8px" }}>
                <strong>Item:</strong> {name}
                {grade && (
                  <span
                    style={{
                      marginLeft: "10px",
                      backgroundColor: GRADE_COLORS[grade] ?? "#555",
                      color: "white",
                      borderRadius: "4px",
                      padding: "2px 8px",
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    Grade {grade}
                  </span>
                )}
              </div>
              <div style={{ fontSize: "15px", color: "#333" }}>
                <strong>Trade-in value:</strong>{" "}
                <span style={{ fontSize: "18px", fontWeight: "bold", color: "#B12704" }}>
                  ₹{credit.toLocaleString("en-IN")}
                </span>{" "}
                <span style={{ fontSize: "13px", color: "#888" }}>(90% of recovered value)</span>
              </div>
              <div style={{ fontSize: "13px", color: "#555", marginTop: "4px" }}>
                Added to your Second Life credit wallet
              </div>
            </div>

            {/* Credit wallet panel */}
            <div
              style={{
                border: "2px solid #FF9900",
                borderRadius: "8px",
                padding: "20px 24px",
                backgroundColor: "#fffbf0",
                marginBottom: "16px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "8px",
                }}
              >
                <CoinIcon />
                <span style={{ fontSize: "20px", fontWeight: "bold", color: "#B12704" }}>
                  ₹{credit.toLocaleString("en-IN")} store credit
                </span>
              </div>
              <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#555" }}>
                Valid on Second Life certified listings only
              </p>
              <Link
                href="/"
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
                Browse Second Life listings →
              </Link>
            </div>

            {/* Green impact */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "8px",
                backgroundColor: "#d8f3dc",
                borderRadius: "6px",
                padding: "12px 16px",
                marginBottom: "20px",
                fontSize: "13px",
                color: "#1b4332",
              }}
            >
              <LeafIcon />
              <span>
                CO₂ saved: <strong>{co2} kg</strong>
                {credits > 0 && (
                  <>
                    {" "}· <strong>+{credits} green credits</strong> earned
                  </>
                )}
              </span>
            </div>

            {/* Back button */}
            <Link
              href="/"
              style={{
                color: "#146EB4",
                fontSize: "14px",
                textDecoration: "underline",
              }}
            >
              ← Back to Home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
