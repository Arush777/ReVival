import { useEffect, useState } from "react";
import Link from "next/link";
import { cartCount, CART_EVENT } from "../lib/cart";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

interface BuyerInfo {
  name: string;
  credit_score: number;
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="#000" xmlns="http://www.w3.org/2000/svg">
      <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
    </svg>
  );
}

function CartIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="white" xmlns="http://www.w3.org/2000/svg">
      <path d="M7 18c-1.1 0-1.99.9-1.99 2S5.9 22 7 22s2-.9 2-2-.9-2-2-2zm10 0c-1.1 0-1.99.9-1.99 2S15.9 22 17 22s2-.9 2-2-.9-2-2-2zm-8.9-5h9.45c.75 0 1.41-.41 1.75-1.03L21 7H5.21l-.94-2H1v2h2l3.6 7.59L5.25 15c-.16.28-.25.61-.25.95C5 17.1 5.9 18 7 18h12v-2H7.42c-.14 0-.25-.11-.25-.25l.03-.12.9-1.63z" />
    </svg>
  );
}

export default function AmazonHeader() {
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [count, setCount] = useState(0);

  useEffect(() => {
    fetch(`${API_BASE}/buyers/${BUYER_ID}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.name) {
          setBuyer({ name: data.name, credit_score: data.credit_score ?? 0 });
        }
      })
      .catch(() => {
        // Never crash the page if the API is down
      });
  }, []);

  useEffect(() => {
    const sync = () => setCount(cartCount());
    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return (
    <header style={{ backgroundColor: "#232F3E", color: "white", width: "100%" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          padding: "8px 16px",
          gap: "12px",
          maxWidth: "1400px",
          margin: "0 auto",
        }}
      >
        {/* Logo */}
        <Link
          href="/"
          style={{
            fontSize: "20px",
            fontFamily: "Arial, sans-serif",
            fontWeight: "bold",
            whiteSpace: "nowrap",
            padding: "4px 8px",
            border: "1px solid transparent",
            cursor: "pointer",
            letterSpacing: "-0.5px",
            flexShrink: 0,
            color: "white",
            textDecoration: "none",
          }}
        >
          amazon<span style={{ color: "#FF9900" }}>.in</span>
        </Link>

        {/* Deliver to */}
        <div style={{ fontSize: "12px", flexShrink: 0, lineHeight: "1.3" }}>
          <div style={{ color: "#ccc" }}>Deliver to</div>
          <div style={{ fontWeight: "bold" }}>India</div>
        </div>

        {/* Search bar */}
        <div style={{ flex: 1, display: "flex", minWidth: 0 }}>
          <div
            style={{
              display: "flex",
              width: "100%",
              backgroundColor: "#fff",
              borderRadius: "4px",
              overflow: "hidden",
            }}
          >
            <select
              style={{
                backgroundColor: "#f3f3f3",
                border: "none",
                borderRight: "1px solid #cdcdcd",
                padding: "0 8px",
                fontSize: "12px",
                color: "#555",
                cursor: "pointer",
                outline: "none",
                flexShrink: 0,
              }}
            >
              <option>Second Life</option>
              <option>All</option>
            </select>
            <input
              type="text"
              placeholder="Search second-life products..."
              readOnly
              style={{
                flex: 1,
                border: "none",
                padding: "8px 12px",
                fontSize: "14px",
                color: "#000",
                outline: "none",
                minWidth: 0,
              }}
            />
            <button
              style={{
                backgroundColor: "#FF9900",
                border: "none",
                padding: "0 16px",
                cursor: "pointer",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
              }}
            >
              <SearchIcon />
            </button>
          </div>
        </div>

        {/* Account */}
        <div
          style={{
            fontSize: "13px",
            lineHeight: "1.3",
            cursor: "pointer",
            flexShrink: 0,
          }}
        >
          <div style={{ color: "#ccc", fontSize: "11px" }}>
            Hello, {buyer?.name ?? "Sign in"}
          </div>
          <div style={{ fontWeight: "bold" }}>Account &amp; Lists</div>
        </div>

        {/* Credits badge */}
        {buyer !== null && (
          <div
            style={{
              backgroundColor: "#FF9900",
              color: "#000",
              borderRadius: "12px",
              padding: "3px 10px",
              fontSize: "12px",
              fontWeight: "bold",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {buyer.credit_score} pts
          </div>
        )}

        {/* Cart */}
        <Link
          href="/cart"
          style={{
            display: "flex",
            alignItems: "flex-end",
            gap: "4px",
            cursor: "pointer",
            flexShrink: 0,
            color: "white",
            textDecoration: "none",
            position: "relative",
          }}
        >
          <div style={{ position: "relative" }}>
            <CartIcon />
            {count > 0 && (
              <span
                style={{
                  position: "absolute",
                  top: "-8px",
                  right: "-8px",
                  backgroundColor: "#FF9900",
                  color: "#000",
                  borderRadius: "50%",
                  minWidth: "18px",
                  height: "18px",
                  fontSize: "11px",
                  fontWeight: "bold",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "0 4px",
                }}
              >
                {count}
              </span>
            )}
          </div>
          <span style={{ fontSize: "14px", fontWeight: "bold" }}>Cart</span>
        </Link>
      </div>

      {/* Secondary nav strip */}
      <nav style={{ backgroundColor: "#37475A", borderTop: "1px solid #3a4553" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "18px",
            padding: "6px 16px",
            maxWidth: "1400px",
            margin: "0 auto",
            fontSize: "13px",
            flexWrap: "wrap",
          }}
        >
          <NavLink href="/" label="Second Life" />
          <NavLink href="/product/LST-NIKE-AIR-270-BLK-10" label="Original PDP" />
          <NavLink href="/sell" label="Sell Your Item" />
          <NavLink href="/return" label="Returns" />
          <NavLink href="/ops" label="Ops Dashboard" />
        </div>
      </nav>
    </header>
  );
}

function NavLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      style={{
        color: "white",
        textDecoration: "none",
        fontWeight: "bold",
        padding: "2px 4px",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </Link>
  );
}
