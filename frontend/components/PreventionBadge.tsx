interface PreventionBadgeProps {
  flag_type: "size" | "color" | "condition";
  return_count_for_reason: number;
  recommendation: string;
  flag_source?: "visual" | "claim" | "both" | "listing_audit";
  evidence?: string;
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
  flag_source,
  evidence,
}: PreventionBadgeProps) {
  const isListingAudit = flag_source === "listing_audit";

  const alertLabel = isListingAudit
    ? flag_type === "color"
      ? "COLOR MISMATCH DETECTED"
      : "LISTING MISMATCH DETECTED"
    : flag_type === "size"
    ? "FIT ALERT"
    : flag_type === "color"
    ? "COLOR ALERT"
    : "CONDITION ALERT";

  const finding =
    flag_type === "size"
      ? "runs small"
      : flag_type === "color"
      ? "looks different in person"
      : "differs from the listing description";

  const sourceLine = isListingAudit
    ? "AI listing audit · image vs. description check performed before purchase"
    : flag_source === "claim"
    ? "Seller's listing description didn't match a returner's report."
    : flag_source === "both"
    ? "Confirmed by both AI photo inspection and a returner's report."
    : "Based on verified return data — AI-analysed";

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
          {alertLabel}
        </span>
      </div>
      {isListingAudit ? (
        <p style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#333" }}>
          AI detected a potential mismatch before any purchases.
        </p>
      ) : (
        <p style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#333" }}>
          {return_count_for_reason} buyer{return_count_for_reason === 1 ? "" : "s"} found this {finding}.
        </p>
      )}
      <p style={{ margin: "0 0 4px 0", fontSize: "13px", color: "#555" }}>{recommendation}</p>
      {evidence && (
        <p style={{ margin: "0 0 4px 0", fontSize: "12px", color: "#666", fontStyle: "italic" }}>
          &ldquo;{evidence}&rdquo;
        </p>
      )}
      <p style={{ margin: "0", fontSize: "11px", color: "#888" }}>{sourceLine}</p>
    </div>
  );
}
