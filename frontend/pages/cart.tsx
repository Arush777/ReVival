import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import AmazonHeader from "../components/AmazonHeader";
import { getCart, removeFromCart, clearCart, CART_EVENT, CartItem } from "../lib/cart";

const GRADE_COLORS: Record<string, string> = {
  A: "#2e7d32",
  B: "#0277BD",
  C: "#e65100",
  D: "#b71c1c",
  NEW: "#555",
  REVIEW: "#6a1b9a",
};

function LeafIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#2d6a4f" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
      <path d="M17 8C8 10 5.9 16.17 3.82 21.34L5.71 22l1-2.3A4.49 4.49 0 0 0 8 20C19 20 22 3 22 3c-1 2-8 2.25-13 3.6C5.6 7.6 3 10 3 10c-1 4 1 8 4 8 .5 0 1-.06 1.5-.2z" />
    </svg>
  );
}

export default function CartPage() {
  const router = useRouter();
  const [items, setItems] = useState<CartItem[]>([]);
  const [mounted, setMounted] = useState(false);
  const [imgErrors, setImgErrors] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setMounted(true);
    const sync = () => setItems(getCart());
    sync();
    window.addEventListener(CART_EVENT, sync);
    return () => window.removeEventListener(CART_EVENT, sync);
  }, []);

  const total = items.reduce((sum, i) => sum + i.price_inr, 0);
  const totalCo2 = Math.round(items.reduce((sum, i) => sum + (i.co2_saved_kg ?? 0), 0) * 10) / 10;
  const totalCredits = items.reduce((sum, i) => sum + (i.credits ?? 0), 0);

  function handleCheckout() {
    const params = new URLSearchParams({
      total: String(total),
      co2: String(totalCo2),
      credits: String(totalCredits),
      items: String(items.length),
    });
    clearCart();
    router.push(`/order-confirm?${params.toString()}`);
  }

  return (
    <div style={{ minHeight: "100vh", backgroundColor: "#EAEDED" }}>
      <AmazonHeader />

      <div style={{ backgroundColor: "#37475A", padding: "6px 16px", fontSize: "13px", color: "white" }}>
        <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
          <a href="/" style={{ color: "#ccc", textDecoration: "none" }}>Home</a>
          {" > "}
          <span>Shopping Cart</span>
        </div>
      </div>

      <div style={{ maxWidth: "1000px", margin: "0 auto", padding: "24px 16px" }}>
        <h1 style={{ fontSize: "22px", fontWeight: "bold", margin: "0 0 20px 0" }}>
          Shopping Cart
        </h1>

        {!mounted ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "#555" }}>Loading...</div>
        ) : items.length === 0 ? (
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "48px 24px",
              textAlign: "center",
              border: "1px solid #ddd",
            }}
          >
            <div style={{ fontSize: "18px", fontWeight: "bold", marginBottom: "8px" }}>
              Your cart is empty
            </div>
            <p style={{ color: "#555", fontSize: "14px", marginBottom: "20px" }}>
              Browse certified Second Life listings to start saving money and CO₂.
            </p>
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
              Browse Second Life listings →
            </Link>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap", alignItems: "flex-start" }}>
            {/* Items list */}
            <div style={{ flex: 1, minWidth: "320px" }}>
              {items.map((item) => (
                <div
                  key={item.item_id}
                  style={{
                    backgroundColor: "white",
                    borderRadius: "8px",
                    padding: "16px",
                    border: "1px solid #ddd",
                    marginBottom: "12px",
                    display: "flex",
                    gap: "16px",
                  }}
                >
                  <div
                    style={{
                      flexShrink: 0,
                      width: "90px",
                      height: "90px",
                      borderRadius: "4px",
                      overflow: "hidden",
                      backgroundColor: "#f0f0f0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {item.photo_url && !imgErrors[item.item_id] ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={item.photo_url}
                        alt={item.name}
                        onError={() => setImgErrors((p) => ({ ...p, [item.item_id]: true }))}
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    ) : (
                      <span style={{ color: "#999", fontSize: "11px" }}>No photo</span>
                    )}
                  </div>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "4px", flexWrap: "wrap" }}>
                      <span style={{ fontSize: "15px", fontWeight: "bold" }}>{item.name}</span>
                      <span
                        style={{
                          backgroundColor: GRADE_COLORS[item.grade] ?? "#555",
                          color: "white",
                          borderRadius: "4px",
                          padding: "1px 7px",
                          fontSize: "10px",
                          fontWeight: "bold",
                        }}
                      >
                        {item.grade === "NEW" ? "NEW" : `GRADE ${item.grade}`}
                      </span>
                    </div>
                    {item.co2_saved_kg > 0 && (
                      <div style={{ display: "flex", alignItems: "center", gap: "4px", fontSize: "12px", color: "#2d6a4f", marginBottom: "6px" }}>
                        <LeafIcon />
                        Saves {item.co2_saved_kg} kg CO₂ · +{item.credits} credits
                      </div>
                    )}
                    <div style={{ fontSize: "18px", fontWeight: "bold", color: "#B12704" }}>
                      ₹{item.price_inr.toLocaleString("en-IN")}
                    </div>
                    <button
                      onClick={() => removeFromCart(item.item_id)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "#146EB4",
                        fontSize: "12px",
                        cursor: "pointer",
                        padding: "4px 0 0 0",
                        textDecoration: "underline",
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Order summary */}
            <div
              style={{
                width: "300px",
                backgroundColor: "white",
                borderRadius: "8px",
                padding: "20px",
                border: "1px solid #ddd",
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: "14px", color: "#555", marginBottom: "8px" }}>
                Subtotal ({items.length} item{items.length !== 1 ? "s" : ""}):
              </div>
              <div style={{ fontSize: "22px", fontWeight: "bold", color: "#0F1111", marginBottom: "12px" }}>
                ₹{total.toLocaleString("en-IN")}
              </div>

              {totalCo2 > 0 && (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    backgroundColor: "#d8f3dc",
                    borderRadius: "6px",
                    padding: "8px 12px",
                    fontSize: "12px",
                    color: "#1b4332",
                    marginBottom: "16px",
                  }}
                >
                  <LeafIcon />
                  This order saves {totalCo2} kg CO₂
                </div>
              )}

              <button
                onClick={handleCheckout}
                style={{
                  backgroundColor: "#FF9900",
                  color: "#000",
                  border: "none",
                  borderRadius: "4px",
                  padding: "12px",
                  fontSize: "15px",
                  fontWeight: "bold",
                  cursor: "pointer",
                  width: "100%",
                }}
              >
                Proceed to Checkout
              </button>

              <Link
                href="/"
                style={{
                  display: "block",
                  textAlign: "center",
                  color: "#146EB4",
                  fontSize: "13px",
                  marginTop: "12px",
                }}
              >
                Continue shopping
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
