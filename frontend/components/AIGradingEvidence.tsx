import { useState } from "react";

interface Defect {
  type: string;
  severity: string;
  evidence?: string;
}

interface RiskFactor {
  value: number | null;
  weight: number;
  direction: "risk" | "benefit";
  llm_derived?: boolean;
}

interface MatchWithFactors {
  buyer_id: string;
  buyer_name?: string;
  re_return_risk: number;
  why_this_fits?: string;
  risk_factors?: {
    buyer_return_rate?: RiskFactor;
    size_incompatibility?: RiskFactor;
    condition_intolerance?: RiskFactor;
    brand_affinity?: RiskFactor;
    reason_recurrence?: RiskFactor;
    reason_neutralization?: RiskFactor;
    eco_boost?: RiskFactor;
  };
}

export interface AIGradingEvidenceProps {
  evidence: string[];
  defects: Defect[];
  wear_level?: string;
  functional_status?: string;
  confidence_bucket?: string;
  grade_bucket?: string;
  detected_color?: string;
  detected_size?: string;
  listed_color?: string;
  listed_size?: string;
  size_mismatch?: boolean;
  color_mismatch?: boolean;
  mismatch_notes?: string;
  rubric_version?: string;
  grader_model?: string;
  image_embedding_cache_id?: string;
  image_embedding_model_id?: string;
  image_similarity_score?: number;
  image_similarity_threshold?: number;
  image_cache_hit?: boolean;
  video_graded?: boolean;
  grade?: string;
  matches?: MatchWithFactors[];
}

const SEVERITY_COLORS: Record<string, { color: string; bg: string }> = {
  minor:    { color: "#856404", bg: "#fff8e1" },
  moderate: { color: "#e65100", bg: "#fff3e0" },
  severe:   { color: "#b71c1c", bg: "#fce4ec" },
};

const CONFIDENCE_LABELS: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const GRADE_BUCKET_LABELS: Record<string, string> = {
  like_new:     "Like New — minimal signs of use",
  light_wear:   "Light Wear — minor cosmetic marks",
  visible_wear: "Visible Wear — noticeable cosmetic imperfections",
  heavy_wear:   "Heavy Wear — significant marks, fully functional",
  damaged:      "Damaged — affects functionality",
};

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="#146EB4" style={{ flexShrink: 0, marginTop: "1px" }}>
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  );
}

function ChipIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="#2d6a4f" style={{ flexShrink: 0 }}>
      <path d="M9 3H7v2H5v2H3v2h2v8H3v2h2v2h2v-2h10v2h2v-2h2v-2h-2V9h2V7h-2V5h-2V3h-2v2H9V3zm6 14H9V7h6v10z"/>
    </svg>
  );
}

export default function AIGradingEvidence({
  evidence,
  defects,
  wear_level,
  confidence_bucket,
  grade_bucket,
  detected_color,
  detected_size,
  listed_color,
  listed_size,
  size_mismatch,
  color_mismatch,
  mismatch_notes,
  rubric_version,
  grader_model,
  image_embedding_cache_id,
  image_embedding_model_id,
  image_similarity_score,
  image_similarity_threshold,
  image_cache_hit,
  video_graded,
  grade,
  matches,
}: AIGradingEvidenceProps) {
  const [open, setOpen] = useState(false);
  const [showRisk, setShowRisk] = useState(false);

  const hasEvidence = evidence && evidence.length > 0;
  const hasDefects = defects && defects.length > 0;
  const hasMatches = matches && matches.length > 0;

  return (
    <div
      style={{
        border: "1px solid #bbd6f5",
        borderRadius: "8px",
        backgroundColor: "#f0f7ff",
        marginBottom: "24px",
      }}
    >
      {/* Header */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          width: "100%",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "14px 18px",
          display: "flex",
          alignItems: "center",
          gap: "10px",
          textAlign: "left",
        }}
      >
        <ChipIcon />
        <span style={{ fontWeight: "bold", fontSize: "14px", color: "#1a3a5c" }}>
          AI Inspection Report
        </span>
        <span
          style={{
            marginLeft: "6px",
            fontSize: "11px",
            backgroundColor: "#146EB4",
            color: "white",
            borderRadius: "10px",
            padding: "2px 8px",
            fontWeight: "bold",
          }}
        >
          {video_graded ? "VIDEO" : "PHOTO"} ANALYSIS
        </span>
        {confidence_bucket && (
          <span style={{ fontSize: "11px", color: "#555", marginLeft: "auto", marginRight: "4px" }}>
            {CONFIDENCE_LABELS[confidence_bucket] ?? confidence_bucket}
          </span>
        )}
        <span style={{ fontSize: "14px", color: "#555", flexShrink: 0 }}>{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div style={{ padding: "0 18px 18px 18px", borderTop: "1px solid #bbd6f5" }}>

          {/* Grade bucket + model attribution */}
          <div
            style={{
              display: "flex",
              gap: "10px",
              flexWrap: "wrap",
              alignItems: "center",
              padding: "10px 0 12px 0",
              fontSize: "12px",
              color: "#444",
            }}
          >
            {grade && (
              <span style={{ fontWeight: "bold", color: "#0F1111" }}>Grade {grade}</span>
            )}
            {grade_bucket && (
              <span
                style={{
                  backgroundColor: "#e8f4f8",
                  border: "1px solid #bbd6f5",
                  borderRadius: "4px",
                  padding: "2px 8px",
                }}
              >
                {GRADE_BUCKET_LABELS[grade_bucket] ?? grade_bucket}
              </span>
            )}
            {grader_model && (
              <span style={{ color: "#666", marginLeft: "auto" }}>
                Graded by: <strong>{grader_model}</strong>
              </span>
            )}
          </div>

          {/* AI Observations */}
          {hasEvidence && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: "bold", color: "#1a3a5c", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                What the AI observed
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "5px" }}>
                {evidence.map((obs, i) => (
                  <div key={i} style={{ display: "flex", gap: "7px", fontSize: "13px", color: "#333" }}>
                    <EyeIcon />
                    <span>{obs}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Defects */}
          <div style={{ marginBottom: "14px" }}>
            <div style={{ fontSize: "12px", fontWeight: "bold", color: "#1a3a5c", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Defect scan
            </div>
            {hasDefects ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                {defects.map((d, i) => {
                  const sc = SEVERITY_COLORS[d.severity] ?? { color: "#555", bg: "#f0f0f0" };
                  return (
                    <div key={i} style={{ display: "flex", gap: "8px", alignItems: "flex-start", fontSize: "13px" }}>
                      <span
                        style={{
                          backgroundColor: sc.bg,
                          color: sc.color,
                          borderRadius: "3px",
                          padding: "1px 7px",
                          fontSize: "11px",
                          fontWeight: "bold",
                          flexShrink: 0,
                          marginTop: "1px",
                        }}
                      >
                        {d.severity}
                      </span>
                      <span>
                        <strong>{d.type}</strong>
                        {d.evidence && <span style={{ color: "#666" }}> — {d.evidence}</span>}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ color: "#2d6a4f", fontSize: "13px" }}>✓ No defects detected</div>
            )}
          </div>

          {/* Size / color detection */}
          {(detected_size || detected_color) && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "12px", fontWeight: "bold", color: "#1a3a5c", marginBottom: "6px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Size &amp; Colour Verification
              </div>
              <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "13px" }}>
                {detected_size && (
                  <div>
                    <span style={{ color: "#888" }}>Listed: </span>
                    <strong>{listed_size || "—"}</strong>
                    <span style={{ margin: "0 4px", color: "#bbb" }}>→</span>
                    <span style={{ color: "#888" }}>AI detected: </span>
                    <strong style={{ color: size_mismatch ? "#b71c1c" : "#2d6a4f" }}>{detected_size}</strong>
                    {size_mismatch && <span style={{ color: "#b71c1c", marginLeft: "6px", fontSize: "11px" }}>⚠ MISMATCH</span>}
                  </div>
                )}
                {detected_color && (
                  <div>
                    <span style={{ color: "#888" }}>Listed colour: </span>
                    <strong>{listed_color || "—"}</strong>
                    <span style={{ margin: "0 4px", color: "#bbb" }}>→</span>
                    <span style={{ color: "#888" }}>AI detected: </span>
                    <strong style={{ color: color_mismatch ? "#b71c1c" : "#2d6a4f" }}>{detected_color}</strong>
                    {color_mismatch && <span style={{ color: "#b71c1c", marginLeft: "6px", fontSize: "11px" }}>⚠ MISMATCH</span>}
                  </div>
                )}
              </div>
              {mismatch_notes && (
                <div style={{ fontSize: "12px", color: "#b71c1c", marginTop: "4px" }}>{mismatch_notes}</div>
              )}
            </div>
          )}

          {/* Risk Score Breakdown for top match */}
          {hasMatches && (
            <div style={{ marginBottom: "14px" }}>
              <button
                onClick={() => setShowRisk((v) => !v)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#146EB4",
                  fontSize: "12px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  padding: 0,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                }}
              >
                {showRisk ? "▼" : "▶"} Re-Return Risk Formula — Top {matches!.length} Buyer Match{matches!.length !== 1 ? "es" : ""}
              </button>
              {showRisk && matches!.map((m, idx) => {
                const rf = m.risk_factors;
                const riskPct = (m.re_return_risk * 100).toFixed(1);
                const riskColor = m.re_return_risk < 0.1 ? "#2d6a4f" : m.re_return_risk <= 0.25 ? "#856404" : "#b71c1c";
                return (
                  <div
                    key={idx}
                    style={{
                      marginTop: "8px",
                      padding: "10px 12px",
                      backgroundColor: "white",
                      border: "1px solid #dce8f5",
                      borderRadius: "6px",
                      fontSize: "12px",
                    }}
                  >
                    <div style={{ fontWeight: "bold", color: "#0F1111", marginBottom: "8px" }}>
                      {m.buyer_name || m.buyer_id}
                      <span style={{ fontWeight: "normal", color: riskColor, marginLeft: "8px" }}>
                        Final risk: <strong>{riskPct}%</strong>
                      </span>
                    </div>
                    {rf && (
                      <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                        {rf.buyer_return_rate && (
                          <RiskRow label="Buyer return rate" factor={rf.buyer_return_rate} />
                        )}
                        {rf.size_incompatibility && (
                          <RiskRow label="Size compatibility" factor={rf.size_incompatibility} />
                        )}
                        {rf.condition_intolerance && (
                          <RiskRow label="Grade tolerance" factor={rf.condition_intolerance} />
                        )}
                        {rf.brand_affinity && (
                          <RiskRow label="Brand affinity" factor={rf.brand_affinity} />
                        )}
                        {rf.reason_recurrence && (
                          <RiskRow label="Return reason recurrence" factor={rf.reason_recurrence} aiNote="see rationale" />
                        )}
                        {rf.reason_neutralization && (
                          <RiskRow label="Reason neutralization" factor={rf.reason_neutralization} aiNote="see rationale" />
                        )}
                        {rf.eco_boost && rf.eco_boost.value !== null && rf.eco_boost.value > 0 && (
                          <RiskRow label="Eco credit" factor={rf.eco_boost} />
                        )}
                      </div>
                    )}
                    {m.why_this_fits && (
                      <div style={{ marginTop: "6px", color: "#555", fontStyle: "italic" }}>
                        "{m.why_this_fits}"
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Audit trail */}
          <div
            style={{
              borderTop: "1px solid #dce8f5",
              paddingTop: "10px",
              display: "flex",
              gap: "12px",
              flexWrap: "wrap",
              fontSize: "11px",
              color: "#888",
            }}
          >
            {rubric_version && <span>Rubric: {rubric_version}</span>}
            {image_embedding_cache_id && (
              <span title="Titan multimodal embedding vector used for visual similarity cache lookup">
                Embedding: {image_embedding_cache_id.split("#").pop()?.slice(0, 12)}…
              </span>
            )}
            {image_similarity_score ? (
              <span title={`Cache threshold ${(image_similarity_threshold ?? 0) * 100}%`}>
                Similarity: {(image_similarity_score * 100).toFixed(1)}%
                {image_cache_hit ? " cache hit" : " indexed"}
              </span>
            ) : null}
            {image_embedding_model_id && (
              <span title={image_embedding_model_id}>
                Vector model: {image_embedding_model_id}
              </span>
            )}
            {wear_level && <span>Wear: {wear_level}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function RiskRow({ label, factor, aiNote }: { label: string; factor: RiskFactor; aiNote?: string }) {
  const isBenefit = factor.direction === "benefit";
  const isLLM = factor.llm_derived;

  if (isLLM || factor.value === null) {
    const sign = isBenefit ? "−" : "+";
    return (
      <div style={{ display: "flex", gap: "6px", alignItems: "center", opacity: 0.85 }}>
        <span style={{ width: "160px", color: "#555", fontStyle: "italic" }}>{label}</span>
        <span
          style={{
            fontSize: "10px",
            backgroundColor: "#fff8e1",
            color: "#856404",
            borderRadius: "3px",
            padding: "1px 5px",
            flexShrink: 0,
          }}
        >
          AI-assessed
        </span>
        <span style={{ color: "#bbb", fontSize: "10px", marginLeft: "2px" }}>{sign}{factor.weight} wt</span>
        {aiNote && (
          <span style={{ marginLeft: "auto", color: "#888", fontSize: "11px", fontStyle: "italic" }}>
            {aiNote}
          </span>
        )}
      </div>
    );
  }

  const contribution = (factor.value as number) * factor.weight;
  const contribColor = isBenefit ? "#2d6a4f" : (factor.value as number) > 0.3 ? "#b71c1c" : "#555";
  const sign = isBenefit ? "−" : "+";
  return (
    <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
      <span style={{ width: "160px", color: "#444" }}>{label}</span>
      <span style={{ width: "36px", textAlign: "right", color: "#555" }}>{((factor.value as number) * 100).toFixed(0)}%</span>
      <span style={{ color: "#bbb", fontSize: "10px" }}>× {factor.weight} wt</span>
      <span style={{ marginLeft: "auto", fontWeight: "bold", color: contribColor }}>
        {sign}{(contribution * 100).toFixed(1)}%
      </span>
    </div>
  );
}
