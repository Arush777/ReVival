import { useEffect, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { cartCount, CART_EVENT } from "../lib/cart";
import catalogData from "../data/catalog.json";
import { CatalogProduct } from "./CatalogCard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";
const BUYER_ID = process.env.NEXT_PUBLIC_DEMO_BUYER_ID || "BUY-001";

interface BuyerInfo {
  name: string;
  credit_score: number;
}

interface Suggestion {
  label: string;
  item_id: string;
  category: string;
  brand: string;
  href?: string;
}

const ALL_CATALOG: CatalogProduct[] = [
  ...(catalogData.heroes as CatalogProduct[]),
  ...(catalogData.filler as CatalogProduct[]),
];

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

interface AmazonHeaderProps {
  initialMode?: "Second Life" | "All";
}

export default function AmazonHeader({ initialMode }: AmazonHeaderProps) {
  const router = useRouter();
  const [buyer, setBuyer] = useState<BuyerInfo | null>(null);
  const [count, setCount] = useState(0);
  const [searchMode, setSearchMode] = useState<"Second Life" | "All">(
    initialMode ?? "Second Life"
  );
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch(`${API_BASE}/buyers/${BUYER_ID}`)
      .then((r) => r.json())
      .then((data) => {
        if (data?.name) {
          setBuyer({ name: data.name, credit_score: data.credit_score ?? 0 });
        }
      })
      .catch(() => {});
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

  // Close suggestions when clicking outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const fetchSuggestions = useCallback((q: string, mode: "Second Life" | "All") => {
    if (q.length < 2) {
      setSuggestions([]);
      return;
    }
    if (mode === "All") {
      const ql = q.toLowerCase();
      const hits = ALL_CATALOG.filter(
        (p) =>
          p.title.toLowerCase().includes(ql) ||
          p.brand.toLowerCase().includes(ql) ||
          p.category.toLowerCase().includes(ql)
      ).slice(0, 8);
      setSuggestions(
        hits.map((p) => ({
          label: p.title,
          item_id: p.second_life_item_id ?? p.catalog_id,
          category: p.category,
          brand: p.brand,
          href: p.second_life_item_id ? `/refurb/${p.second_life_item_id}` : `/search?q=${encodeURIComponent(p.title)}&mode=all`,
        }))
      );
    } else {
      fetch(`${API_BASE}/search/suggestions?q=${encodeURIComponent(q)}&limit=8`)
        .then((r) => r.json())
        .then((data) => setSuggestions(data.suggestions ?? []))
        .catch(() => setSuggestions([]));
    }
  }, []);

  function handleQueryChange(e: React.ChangeEvent<HTMLInputElement>) {
    const val = e.target.value;
    setQuery(val);
    setShowSuggestions(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val, searchMode), 220);
  }

  function handleSearch(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setShowSuggestions(false);
    if (!query.trim()) return;
    router.push(`/search?q=${encodeURIComponent(query.trim())}&mode=${searchMode === "All" ? "all" : "second_life"}`);
  }

  function handleSuggestionClick(s: Suggestion) {
    setQuery(s.label);
    setShowSuggestions(false);
    router.push(s.href ?? `/refurb/${s.item_id}`);
  }

  function handleModeChange(mode: "Second Life" | "All") {
    setSearchMode(mode);
    setSuggestions([]);
    setShowSuggestions(false);
    router.push(mode === "All" ? "/?mode=all" : "/");
  }

  const showSecondLifeNav = searchMode === "Second Life";

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
        <div ref={searchRef} style={{ flex: 1, display: "flex", minWidth: 0, position: "relative" }}>
          <form
            onSubmit={handleSearch}
            style={{
              display: "flex",
              width: "100%",
              backgroundColor: "#fff",
              borderRadius: "4px",
              overflow: "visible",
            }}
          >
            <select
              value={searchMode}
              onChange={(e) => handleModeChange(e.target.value as "Second Life" | "All")}
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
                borderRadius: "4px 0 0 4px",
              }}
            >
              <option value="Second Life">Second Life</option>
              <option value="All">All</option>
            </select>
            <input
              type="text"
              value={query}
              onChange={handleQueryChange}
              onFocus={() => query.length >= 2 && setShowSuggestions(true)}
              placeholder={searchMode === "All" ? "Search Amazon.in..." : "Search second-life products..."}
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
              type="submit"
              style={{
                backgroundColor: "#FF9900",
                border: "none",
                padding: "0 16px",
                cursor: "pointer",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                borderRadius: "0 4px 4px 0",
              }}
            >
              <SearchIcon />
            </button>
          </form>

          {/* Autocomplete dropdown */}
          {showSuggestions && suggestions.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                backgroundColor: "white",
                border: "1px solid #ccc",
                borderRadius: "0 0 4px 4px",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                zIndex: 1000,
                overflow: "hidden",
              }}
            >
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onMouseDown={() => handleSuggestionClick(s)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    width: "100%",
                    padding: "9px 14px",
                    border: "none",
                    borderBottom: i < suggestions.length - 1 ? "1px solid #f0f0f0" : "none",
                    backgroundColor: "white",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#f7f7f7")}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "white")}
                >
                  <span style={{ color: "#555", flexShrink: 0 }}>
                    <SearchIcon />
                  </span>
                  <div>
                    <div style={{ fontSize: "13px", color: "#0F1111" }}>{s.label}</div>
                    <div style={{ fontSize: "11px", color: "#888" }}>
                      {s.brand} · {s.category}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
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

      {/* Secondary nav strip — hidden when "All" mode is active */}
      {showSecondLifeNav && (
        <nav style={{ backgroundColor: "#37475A", borderTop: "1px solid #3a4553" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-evenly",
              padding: "6px 16px",
              maxWidth: "1400px",
              margin: "0 auto",
              fontSize: "13px",
            }}
          >
            <NavLink href="/" label="Second Life" />
            <NavLink href="/sell" label="Sell Your Item" />
            <NavLink href="/return" label="Returns" />
            <NavLink href="/ops" label="Ops Dashboard" />
          </div>
        </nav>
      )}
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
