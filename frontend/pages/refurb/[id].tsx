import { useRouter } from "next/router";
import { useEffect, useState } from "react";
import Link from "next/link";
import AmazonHeader from "../../components/AmazonHeader";
import TrustPassport from "../../components/TrustPassport";
import GreenImpact from "../../components/GreenImpact";
import CreditsRedemption from "../../components/CreditsRedemption";
import { addToCart } from "../../lib/cart";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  REVIEW: "#6a1b9a",
};

interface ItemData {
  item_id: string;
  listing_id: string;
  category: string;
  brand: string;
  name: string;
  status: string;
  grade: string;
  disposition: string;
  original_price_inr: number;
  base_price_inr: number;
  listed_size: string;
  listed_color: string;
  return_reason_text: string;
  return_hub_city: string;
  owner_count: number;
  photo_urls: string[];
  passport_url: string;
  co2_saved_kg: number;
  credits: number;
  matches: { buyer_id: string; re_return_risk: number }[];
}

interface PassportData {
  item_id: string;
  passport_url: string;
  passport: {
    summary: string;
    condition_statement: string;
    why_returned: string;
    buyer_reassurance: string;
  };
}

interface BuyerData {
  buyer_id: string;
  name: string;
  credit_score: number;
}

export default function RefurbPage() {
  const router = useRouter();
  const { id } = router.query as { id: string };

  const [item, setItem] = useState<ItemData | null>(null);
  const [passport, setPassport] = useState<PassportData | null>(null);
  const [buyer, setBuyer] = useState<BuyerData | null>(null);
  const [displayPrice, setDisplayPrice] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState(0);
  const [added, setAdded] = useState(false);
  const [imgError, setImgError] = useState(false);

  useEffect(() => {
    if (!id) return;

    setLoading(true);
    Promise.all([
      fetch(`${API_BASE}/items/${id}`).then((r) => r.json()),
      fetch(`${API_BASE}/items/${id}/passport`).then((r) => r.json()),
      fetch(`${API_BASE}/buyers/${BUYER_ID}`).then((r) => r.json()),
    ])
      .then(([itemData, passportData, buyerData]) => {
        if (itemData.error) {
          setError(itemData.error.message ?? "Item not found.");
          return;
        }
        setItem(itemData);
        setDisplayPrice(itemData.base_price_inr);
        setPassport(passportData);
        setBuyer(buyerData);
      })
      .catch(() => setError("Failed to load item data."))
      .finally(() => setLoading(false));
  }, [id]);

  function handleCreditsApplied(finalPrice: number) {
    setDisplayPrice(finalPrice);
  }

  function handleAddToCart() {
    if (!item) return;
    addToCart({
      item_id: item.item_id,
      name: item.name,
      brand: item.brand,
      grade: item.grade,
      price_inr: displayPrice ?? item.base_price_inr,
      photo_url: item.photo_urls?.[0] ?? "",
      co2_saved_kg: item.co2_saved_kg,
      credits: item.credits,
    });
    setAdded(true);
    window.setTimeout(() => setAdded(false), 1800);
  }

  function handleBuyNow() {
    if (!item) return;
    const price = displayPrice ?? item.base_price_inr;
    const params = new URLSearchParams({
      total: String(price),
      co2: String(item.co2_saved_kg ?? 0),
      credits: String(item.credits ?? 0),
      items: "1",
    });
    router.push(`/order-confirm?${params.toString()}`);
  }

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
        <AmazonHeader />
        <div style={{ textAlign: "center", padding: "80px 0", color: "#555" }}>
          Loading item...
        </div>
      </div>
    );
  }

  if (error || !item) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
        <AmazonHeader />
        <div style={{ maxWidth: "800px", margin: "40px auto", padding: "0 16px" }}>
          <div
            style={{
              border: "1px solid #f5c6cb",
              backgroundColor: "#f8d7da",
              borderRadius: "6px",
              padding: "16px",
              color: "#721c24",
            }}
          >
            {error ?? "Item not found."}
          </div>
        </div>
      </div>
    );
  }

  const savingsPct = Math.round(
    ((item.original_price_inr - item.base_price_inr) / item.original_price_inr) * 100
  );

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      {/* Sub-nav */}
      <div
        style={{
          backgroundColor: "#37475A",
          padding: "6px 16px",
          fontSize: "13px",
          color: "white",
        }}
      >
        <div style={{ maxWidth: "1200px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span style={{ color: "#ccc" }}>Second Life</span>
          {" > "}
          <span style={{ color: "#ccc" }}>{item.category}</span>
          {" > "}
          <span>{item.name}</span>
        </div>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "24px 16px" }}>
        {/* Top section: photos + purchase panel */}
        <div style={{ display: "flex", gap: "32px", flexWrap: "wrap", marginBottom: "32px" }}>
          {/* Photos */}
          <div style={{ flexShrink: 0, width: "340px" }}>
            <div
              style={{
                width: "340px",
                height: "340px",
                backgroundColor: "#f0f0f0",
                borderRadius: "8px",
                overflow: "hidden",
                marginBottom: "8px",
              }}
            >
              {item.photo_urls && item.photo_urls[selectedPhoto] && !imgError ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={item.photo_urls[selectedPhoto]}
                  alt={item.name}
                  onError={() => setImgError(true)}
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              ) : (
                <div
                  style={{
                    width: "100%",
                    height: "100%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#999",
                    fontSize: "14px",
                  }}
                >
                  No photo available
                </div>
              )}
            </div>
            {/* Thumbnail strip */}
            {item.photo_urls && item.photo_urls.length > 1 && (
              <div style={{ display: "flex", gap: "8px" }}>
                {item.photo_urls.map((url, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      setSelectedPhoto(i);
                      setImgError(false);
                    }}
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "4px",
                      overflow: "hidden",
                      border: selectedPhoto === i ? "2px solid #FF9900" : "2px solid #ddd",
                      cursor: "pointer",
                      padding: 0,
                      backgroundColor: "#f0f0f0",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`photo ${i + 1}`} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Purchase panel */}
          <div style={{ flex: 1, minWidth: "280px" }}>
            {/* Badges */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "8px", flexWrap: "wrap" }}>
              <span
                style={{
                  backgroundColor: "#FF9900",
                  color: "#000",
                  borderRadius: "4px",
                  padding: "3px 10px",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                Certified Second Life
              </span>
              <span
                style={{
                  backgroundColor: GRADE_COLORS[item.grade] ?? "#555",
                  color: "white",
                  borderRadius: "4px",
                  padding: "3px 10px",
                  fontSize: "12px",
                  fontWeight: "bold",
                }}
              >
                GRADE {item.grade}
              </span>
              <span
                style={{
                  border: "1px solid #888",
                  color: "#555",
                  borderRadius: "4px",
                  padding: "3px 10px",
                  fontSize: "12px",
                }}
              >
                {item.owner_count ?? 1} PREVIOUS OWNER
              </span>
            </div>

            {/* Title */}
            <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 4px 0", color: "#0F1111" }}>
              {item.name}
            </h1>
            <div style={{ fontSize: "13px", color: "#007185", marginBottom: "12px" }}>
              ★★★★☆ AI-graded condition
            </div>

            {/* Price */}
            <div style={{ marginBottom: "12px" }}>
              <span
                style={{
                  textDecoration: "line-through",
                  color: "#888",
                  fontSize: "14px",
                  marginRight: "8px",
                }}
              >
                ₹{item.original_price_inr.toLocaleString("en-IN")}
              </span>
              <span style={{ fontSize: "26px", fontWeight: "bold", color: "#B12704" }}>
                ₹{(displayPrice ?? item.base_price_inr).toLocaleString("en-IN")}
              </span>
              <span style={{ fontSize: "13px", color: "#2d6a4f", marginLeft: "8px" }}>
                Save {savingsPct}%
              </span>
            </div>

            {/* Green impact */}
            <div style={{ marginBottom: "12px" }}>
              <GreenImpact
                co2_saved_kg={item.co2_saved_kg}
                credits={item.credits}
                show_earned={true}
              />
            </div>

            {/* Size / color */}
            <div style={{ fontSize: "13px", color: "#555", marginBottom: "12px" }}>
              Size: <strong>{item.listed_size}</strong> · Colour: <strong>{item.listed_color}</strong>
            </div>

            {/* Credits redemption */}
            {buyer && (
              <div style={{ marginBottom: "16px" }}>
                <CreditsRedemption
                  buyer_id={BUYER_ID}
                  item_id={item.item_id}
                  buyer_credit_score={buyer.credit_score}
                  base_price_inr={item.base_price_inr}
                  onApplied={(finalPrice) => handleCreditsApplied(finalPrice)}
                />
              </div>
            )}

            {/* CTA buttons */}
            <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
              <button
                onClick={handleAddToCart}
                style={{
                  backgroundColor: added ? "#2d6a4f" : "#FF9900",
                  color: added ? "white" : "#000",
                  border: "none",
                  borderRadius: "4px",
                  padding: "10px 24px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  flex: 1,
                  transition: "background-color 0.2s",
                }}
              >
                {added ? "✓ Added to Cart" : "Add to Cart"}
              </button>
              <button
                onClick={handleBuyNow}
                style={{
                  backgroundColor: "#FFA41C",
                  color: "#000",
                  border: "none",
                  borderRadius: "4px",
                  padding: "10px 24px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  flex: 1,
                }}
              >
                Buy Now
              </button>
            </div>

            {added && (
              <div style={{ marginTop: "10px" }}>
                <Link href="/cart" style={{ color: "#146EB4", fontSize: "13px", fontWeight: "bold" }}>
                  Go to Cart →
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Trust Passport */}
        {passport?.passport && (
          <div style={{ marginBottom: "24px" }}>
            <TrustPassport
              summary={passport.passport.summary}
              condition_statement={passport.passport.condition_statement}
              why_returned={passport.passport.why_returned}
              buyer_reassurance={passport.passport.buyer_reassurance}
              passport_url={passport.passport_url ?? item.passport_url ?? ""}
              item_id={item.item_id}
              grade={item.grade}
            />
          </div>
        )}
      </div>
    </div>
  );
}
