import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  REVIEW: "#6a1b9a",
};

interface SearchResult {
  item_id: string;
  name: string;
  brand: string;
  category: string;
  grade: string;
  status: string;
  base_price_inr: number;
  original_price_inr: number;
  photo_url: string;
  return_hub_city: string;
  co2_saved_kg: number;
  credits: number;
}

export default function SearchPage() {
  const router = useRouter();
  const { q = "", mode = "second_life" } = router.query as { q: string; mode: string };
  const isAllMode = mode === "all";

  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    if (!q) return;
    setLoading(true);
    setSearched(false);
    fetch(`${API_BASE}/search?q=${encodeURIComponent(q)}&limit=20`)
      .then((r) => r.json())
      .then((data) => {
        let items: SearchResult[] = data.items ?? [];
        if (!isAllMode) {
          items = items.filter((i) => i.status === "listed");
        }
        setResults(items);
      })
      .catch(() => setResults([]))
      .finally(() => {
        setLoading(false);
        setSearched(true);
      });
  }, [q, isAllMode]);

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader initialMode={isAllMode ? "All" : "Second Life"} />

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "20px 16px" }}>
        {/* Result header */}
        <div style={{ marginBottom: "16px" }}>
          <div style={{ fontSize: "18px", color: "#0F1111" }}>
            {loading ? (
              "Searching..."
            ) : searched ? (
              <>
                {results.length > 0
                  ? `${results.length} result${results.length !== 1 ? "s" : ""} for `
                  : "No results for "}
                <strong>&ldquo;{q}&rdquo;</strong>
                {isAllMode && (
                  <span style={{ fontSize: "13px", color: "#888", marginLeft: "8px" }}>
                    (showing second-life inventory)
                  </span>
                )}
              </>
            ) : null}
          </div>
          {!isAllMode && (
            <div style={{ fontSize: "13px", color: "#555", marginTop: "4px" }}>
              Showing certified second-life items only.{" "}
              <button
                onClick={() => router.push(`/search?q=${encodeURIComponent(q)}&mode=all`)}
                style={{
                  background: "none",
                  border: "none",
                  color: "#146EB4",
                  cursor: "pointer",
                  fontSize: "13px",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Search all products
              </button>
            </div>
          )}
        </div>

        {/* Results grid */}
        {!loading && searched && results.length === 0 && (
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
            <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "8px" }}>
              No results found for &ldquo;{q}&rdquo;
            </div>
            <div style={{ fontSize: "14px" }}>
              Try a different search term, or{" "}
              <Link href="/" style={{ color: "#146EB4" }}>
                browse all second-life items
              </Link>
              .
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {results.map((item) => {
            const savingsPct =
              item.original_price_inr > 0
                ? Math.round(
                    ((item.original_price_inr - item.base_price_inr) /
                      item.original_price_inr) *
                      100
                  )
                : 0;
            return (
              <div
                key={item.item_id}
                style={{
                  backgroundColor: "white",
                  borderRadius: "8px",
                  padding: "16px",
                  display: "flex",
                  gap: "16px",
                  border: "1px solid #ddd",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                }}
              >
                {/* Photo */}
                <Link
                  href={`/refurb/${item.item_id}`}
                  style={{
                    flexShrink: 0,
                    width: "110px",
                    height: "110px",
                    backgroundColor: "#f0f0f0",
                    borderRadius: "4px",
                    overflow: "hidden",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {item.photo_url ? (
                    /* eslint-disable-next-line @next/next/no-img-element */
                    <img
                      src={item.photo_url}
                      alt={item.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  ) : (
                    <span style={{ color: "#999", fontSize: "12px" }}>No photo</span>
                  )}
                </Link>

                {/* Details */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: "6px", marginBottom: "5px", flexWrap: "wrap" }}>
                    {item.grade && item.grade !== "" && (
                      <>
                        <span
                          style={{
                            backgroundColor: "#FF9900",
                            color: "#000",
                            borderRadius: "3px",
                            padding: "2px 7px",
                            fontSize: "11px",
                            fontWeight: "bold",
                          }}
                        >
                          CERTIFIED REFURB
                        </span>
                        <span
                          style={{
                            backgroundColor: GRADE_COLORS[item.grade] ?? "#555",
                            color: "white",
                            borderRadius: "3px",
                            padding: "2px 7px",
                            fontSize: "11px",
                            fontWeight: "bold",
                          }}
                        >
                          GRADE {item.grade}
                        </span>
                      </>
                    )}
                  </div>

                  <Link
                    href={`/refurb/${item.item_id}`}
                    style={{
                      fontSize: "16px",
                      fontWeight: "bold",
                      color: "#0F1111",
                      textDecoration: "none",
                      display: "block",
                      marginBottom: "4px",
                    }}
                  >
                    {item.name}
                  </Link>

                  <div style={{ fontSize: "13px", color: "#555", marginBottom: "6px" }}>
                    {item.brand} · {item.category} · Ships from {item.return_hub_city}
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    {item.original_price_inr > 0 && (
                      <span style={{ textDecoration: "line-through", color: "#888", fontSize: "13px" }}>
                        ₹{item.original_price_inr.toLocaleString("en-IN")}
                      </span>
                    )}
                    <span style={{ fontSize: "18px", fontWeight: "bold", color: "#B12704" }}>
                      ₹{item.base_price_inr.toLocaleString("en-IN")}
                    </span>
                    {savingsPct > 0 && (
                      <span style={{ fontSize: "13px", color: "#2d6a4f" }}>
                        Save {savingsPct}%
                      </span>
                    )}
                  </div>

                  {item.co2_saved_kg > 0 && (
                    <div style={{ fontSize: "12px", color: "#2d6a4f", marginTop: "4px" }}>
                      Saves {item.co2_saved_kg} kg CO₂ · +{item.credits} green credits
                    </div>
                  )}
                </div>

                <div style={{ flexShrink: 0, display: "flex", alignItems: "center" }}>
                  <Link
                    href={`/refurb/${item.item_id}`}
                    style={{
                      backgroundColor: "#FF9900",
                      color: "#000",
                      borderRadius: "4px",
                      padding: "8px 16px",
                      fontSize: "13px",
                      fontWeight: "bold",
                      textDecoration: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    View Item
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
