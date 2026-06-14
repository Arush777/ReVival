// Client-side cart. Backend has no cart endpoint (demo scope), so the cart
// lives in localStorage and broadcasts a "cart-updated" event so the header
// badge and any open cart page stay in sync across tabs/components.

export interface CartItem {
  item_id: string;
  name: string;
  brand: string;
  grade: string;
  price_inr: number;
  photo_url: string;
  co2_saved_kg: number;
  credits: number;
}

const KEY = "secondlife_cart";
export const CART_EVENT = "cart-updated";

export function getCart(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function save(items: CartItem[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_EVENT));
}

/** Adds the item if not already present. Returns the new cart length. */
export function addToCart(item: CartItem): number {
  const items = getCart();
  if (!items.some((i) => i.item_id === item.item_id)) {
    items.push(item);
    save(items);
  }
  return items.length;
}

export function isInCart(item_id: string): boolean {
  return getCart().some((i) => i.item_id === item_id);
}

export function removeFromCart(item_id: string): void {
  save(getCart().filter((i) => i.item_id !== item_id));
}

export function clearCart(): void {
  save([]);
}

export function cartCount(): number {
  return getCart().length;
}
