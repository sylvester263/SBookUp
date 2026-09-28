import { beforeEach, describe, expect, it } from "vitest";
import { cartStore, cartTotals } from "./cart-store";

describe("cart store stock limits", () => {
  beforeEach(() => cartStore.clear());

  it("never goes above the available stock and reports what was added", () => {
    expect(cartStore.add({ key: "p1", product_id: "p1", name: "Maths", price: 800, quantity: 2 }, { max: 3 })).toBe(2);
    expect(cartStore.add({ key: "p1", product_id: "p1", name: "Maths", price: 800, quantity: 2 }, { max: 3 })).toBe(1);
    expect(cartStore.add({ key: "p1", product_id: "p1", name: "Maths", price: 800 }, { max: 3 })).toBe(0);
    expect(cartStore.qtyOf("p1")).toBe(3);
  });

  it("adds nothing when out of stock", () => {
    expect(cartStore.add({ key: "p2", product_id: "p2", name: "English", price: 600 }, { max: 0 })).toBe(0);
    expect(cartStore.get()).toHaveLength(0);
  });

  it("keeps separate lines for variants and school bundles", () => {
    cartStore.add({ key: "p1", product_id: "p1", name: "Atlas", price: 1000 });
    cartStore.add({ key: "p1|v1", product_id: "p1", variant_id: "v1", name: "Atlas — Hardcover", price: 1500 });
    cartStore.add({ key: "sb:1", school_bundle_id: "1", name: "Allied — Class 5", price: 2500, children: ["3 × Atlas"] });
    expect(cartStore.get().map((l) => l.key)).toEqual(["p1", "p1|v1", "sb:1"]);
    expect(cartTotals(cartStore.get())).toEqual({ subtotal: 5000, itemCount: 3 });
  });
});
