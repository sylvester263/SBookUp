import { useEffect, useState, useSyncExternalStore } from "react";

export type CartLine = {
  key: string; // product_id|variant_id or bundle_id
  product_id?: string;
  bundle_id?: string;
  school_bundle_id?: string;
  variant_id?: string;
  name: string;
  image?: string;
  price: number;
  quantity: number;
  slug?: string;
  /** For bundles: the items inside, shown under the line (display only). */
  children?: string[];
};

const KEY = "jsn_cart_v1";
export const CART_ADDED_EVENT = "cart:added";
let state: CartLine[] = [];
const listeners = new Set<() => void>();

function load(): CartLine[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}
function persist() {
  if (typeof window !== "undefined") localStorage.setItem(KEY, JSON.stringify(state));
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") state = load();

export const cartStore = {
  get: () => state,
  subscribe: (cb: () => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  // Adds to the cart. If `max` (units in stock) is given, the line never goes
  // above it. Returns how many units were actually added (0 = none).
  add: (line: Omit<CartLine, "quantity"> & { quantity?: number }, opts?: { max?: number }) => {
    const qty = line.quantity ?? 1;
    const idx = state.findIndex((l) => l.key === line.key);
    const current = idx >= 0 ? state[idx].quantity : 0;
    const target = opts?.max != null ? Math.min(current + qty, Math.max(0, opts.max)) : current + qty;
    const added = target - current;
    if (added <= 0) return 0;
    if (idx >= 0) {
      state = state.map((l, i) => (i === idx ? { ...l, quantity: target } : l));
    } else {
      state = [...state, { ...line, quantity: target }];
    }
    persist();
    // Lets the header's cart badge animate on a real add (not on page load)
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CART_ADDED_EVENT, { detail: { added } }));
    return added;
  },
  /** Units of this line already in the cart. */
  qtyOf: (key: string) => state.find((l) => l.key === key)?.quantity ?? 0,
  setQty: (key: string, qty: number) => {
    state = qty <= 0 ? state.filter((l) => l.key !== key) : state.map((l) => (l.key === key ? { ...l, quantity: qty } : l));
    persist();
  },
  remove: (key: string) => {
    state = state.filter((l) => l.key !== key);
    persist();
  },
  clear: () => {
    state = [];
    persist();
  },
};

const EMPTY: CartLine[] = [];
export function useCart() {
  return useSyncExternalStore(cartStore.subscribe, cartStore.get, () => EMPTY);
}

/** True for a moment after something is added to the cart (drives the badge bump). */
export function useCartBump() {
  const [bump, setBump] = useState(false);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      setBump(false);
      // Next frame so a second add restarts the animation
      requestAnimationFrame(() => setBump(true));
      clearTimeout(t);
      t = setTimeout(() => setBump(false), 500);
    };
    window.addEventListener(CART_ADDED_EVENT, on);
    return () => { window.removeEventListener(CART_ADDED_EVENT, on); clearTimeout(t); };
  }, []);
  return bump;
}

export function cartTotals(lines: CartLine[]) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.quantity, 0);
  const itemCount = lines.reduce((s, l) => s + l.quantity, 0);
  return { subtotal, itemCount };
}
