interface PreventionBadgeProps {
  flag_type: "size" | "color";
  return_count_for_reason: number;
  recommendation: string;
}

function WarningIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="#856404"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0 }}
    >
      <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z" />
    </svg>
  );
}

export default function PreventionBadge({
  flag_type,
  return_count_for_reason,
  recommendation,
}: PreventionBadgeProps) {
  const alertLabel = flag_type === "size" ? "FIT ALERT" : "COLOR ALERT";

  return (
    <div
      style={{
        border: "2px solid #ffc107",
        borderRadius: "6px",
        padding: "14px 16px",
        backgroundColor: "#fff8e1",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          marginBottom: "6px",
        }}
      >
        <WarningIcon />
        <span style={{ fontWeight: "bold", fontSize: "14px", color: "#856404" }}>
          [!] {alertLabel}
        </span>
      </div>
      <p style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#333" }}>
        {return_count_for_reason} buyers found this{" "}
        {flag_type === "size" ? "runs small" : "looks different in person"}.
      </p>
      <p style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#555" }}>{recommendation}</p>
      <p style={{ margin: "0", fontSize: "11px", color: "#888" }}>
        Based on verified return data — AI-analysed
      </p>
    </div>
  );
}
