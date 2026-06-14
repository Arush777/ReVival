import { useEffect, useState } from "react";

interface TrustPassportProps {
  summary: string;
  condition_statement: string;
  why_returned: string;
  buyer_reassurance: string;
  passport_url: string;
  item_id?: string;
  grade?: string;
}

function ShieldIcon({ size = 20, color = "#146EB4" }: { size?: number; color?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

export default function TrustPassport({
  summary,
  condition_statement,
  why_returned,
  buyer_reassurance,
  passport_url,
  item_id,
  grade,
}: TrustPassportProps) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open]);

  return (
    <div
      id="passport"
      style={{
        border: "1px solid #b2d8b2",
        borderRadius: "8px",
        padding: "16px 20px",
        backgroundColor: "#f1f8e9",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "12px" }}>
        <ShieldIcon />
        <span style={{ fontWeight: "bold", fontSize: "16px", color: "#1b4332" }}>
          Trust Passport
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: "11px",
            color: "#2d6a4f",
            border: "1px solid #b2d8b2",
            borderRadius: "12px",
            padding: "2px 10px",
            fontWeight: "bold",
          }}
        >
          AI-VERIFIED
        </span>
      </div>

      <p style={{ margin: "0 0 8px 0", fontWeight: "bold", fontSize: "14px", color: "#1b4332" }}>
        {summary}
      </p>
      <p style={{ margin: "0 0 6px 0", fontSize: "13px" }}>
        <strong>Condition:</strong> {condition_statement}
      </p>
      <p style={{ margin: "0 0 6px 0", fontSize: "13px" }}>
        <strong>Why returned:</strong> {why_returned}
      </p>
      <p style={{ margin: "0 0 14px 0", fontSize: "13px", color: "#2d6a4f" }}>{buyer_reassurance}</p>

      <button
        onClick={() => setOpen(true)}
        style={{
          color: "#146EB4",
          fontSize: "13px",
          fontWeight: "bold",
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textDecoration: "underline",
        }}
      >
        View full passport →
      </button>

      {/* Certificate modal */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: "white",
              borderRadius: "10px",
              maxWidth: "560px",
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              boxShadow: "0 8px 40px rgba(0,0,0,0.3)",
            }}
          >
            {/* Certificate header band */}
            <div
              style={{
                backgroundColor: "#232F3E",
                color: "white",
                padding: "20px 28px",
                borderRadius: "10px 10px 0 0",
                display: "flex",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <ShieldIcon size={28} color="#FF9900" />
              <div>
                <div style={{ fontSize: "18px", fontWeight: "bold" }}>Trust Passport</div>
                <div style={{ fontSize: "12px", color: "#ccc" }}>
                  Certified Second Life · Amazon
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Close"
                style={{
                  marginLeft: "auto",
                  background: "none",
                  border: "none",
                  color: "white",
                  fontSize: "22px",
                  cursor: "pointer",
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: "24px 28px" }}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  marginBottom: "20px",
                  flexWrap: "wrap",
                }}
              >
                {grade && (
                  <span
                    style={{
                      backgroundColor: "#0277BD",
                      color: "white",
                      borderRadius: "4px",
                      padding: "3px 10px",
                      fontSize: "12px",
                      fontWeight: "bold",
                    }}
                  >
                    GRADE {grade}
                  </span>
                )}
                <span style={{ fontSize: "15px", fontWeight: "bold", color: "#1b4332" }}>
                  {summary}
                </span>
              </div>

              <Field label="Condition Report" value={condition_statement} />
              <Field label="Reason for Return" value={why_returned} />

              <div
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "8px",
                  backgroundColor: "#d8f3dc",
                  borderRadius: "6px",
                  padding: "12px 14px",
                  marginTop: "16px",
                  color: "#1b4332",
                  fontSize: "13px",
                }}
              >
                <LeafIcon />
                <span>{buyer_reassurance}</span>
              </div>

              {/* Footer */}
              <div
                style={{
                  borderTop: "1px solid #eee",
                  marginTop: "20px",
                  paddingTop: "14px",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  fontSize: "12px",
                  color: "#888",
                  flexWrap: "wrap",
                  gap: "8px",
                }}
              >
                <span>{item_id ? `Item ID: ${item_id}` : "Certified by Amazon Second Life"}</span>
                {passport_url && (
                  <a
                    href={passport_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#146EB4" }}
                  >
                    Open certificate document ↗
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ marginBottom: "14px" }}>
      <div
        style={{
          fontSize: "11px",
          fontWeight: "bold",
          color: "#888",
          textTransform: "uppercase",
          letterSpacing: "0.5px",
          marginBottom: "3px",
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: "14px", color: "#0F1111", lineHeight: 1.5 }}>{value}</div>
    </div>
  );
}
