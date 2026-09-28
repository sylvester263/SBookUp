import { describe, expect, test } from "vitest";
import { cardPricing, money, variantStats, wasPriceOf } from "@/lib/pricing";

describe("money", () => {
  test("Rs. with two decimals and thousands separators", () => {
    expect(money(1395)).toBe("Rs.1,395.00");
    expect(money(68)).toBe("Rs.68.00");
    expect(money(150000.5)).toBe("Rs.150,000.50");
  });
});

describe("wasPriceOf", () => {
  test("only a higher price counts", () => {
    expect(wasPriceOf(800, 1000)).toBe(1000);
    expect(wasPriceOf(800, "1000")).toBe(1000);
    expect(wasPriceOf(800, 800)).toBeNull();
    expect(wasPriceOf(800, 700)).toBeNull();
    expect(wasPriceOf(800, null)).toBeNull();
    expect(wasPriceOf(800, "")).toBeNull();
  });
});

describe("cardPricing", () => {
  test("simple product: price, add to cart", () => {
    expect(cardPricing({ price: 1395, stock_quantity: 4 })).toEqual({
      priceText: "Rs.1,395.00",
      wasText: null,
      packText: null,
      action: "add",
      unitPrice: 1395,
    });
  });

  test("on sale: sale price shown, regular price struck through", () => {
    const r = cardPricing({ price: 1000, sale_price: 850, stock_quantity: 1 });
    expect(r.priceText).toBe("Rs.850.00");
    expect(r.wasText).toBe("Rs.1,000.00");
    expect(r.unitPrice).toBe(850);
  });

  test("a sale price that isn't lower is ignored", () => {
    const r = cardPricing({ price: 1000, sale_price: 1200 });
    expect(r.priceText).toBe("Rs.1,000.00");
    expect(r.wasText).toBeNull();
  });

  test("no stock: out of stock", () => {
    expect(cardPricing({ price: 500, stock_quantity: 0 }).action).toBe("out");
  });

  test("unknown stock is not treated as out of stock", () => {
    expect(cardPricing({ price: 500 }).action).toBe("add");
  });

  test("variants with different prices: range, choose options", () => {
    const r = cardPricing({
      price: 100,
      variant_count: 3,
      variant_min: 68,
      variant_max: 269,
      variant_in_stock: true,
    });
    expect(r.priceText).toBe("Rs.68.00 - Rs.269.00");
    expect(r.action).toBe("options");
    expect(r.wasText).toBeNull();
  });

  test("variants with one price: single price", () => {
    expect(
      cardPricing({
        price: 100,
        variant_count: 2,
        variant_min: 2400,
        variant_max: 2400,
        variant_in_stock: true,
      }).priceText,
    ).toBe("Rs.2,400.00");
  });

  test("variants with one price and a was price: struck through; not next to a range", () => {
    const one = { price: 100, variant_count: 2, variant_min: 2400, variant_max: 2400, variant_in_stock: true, variant_was_max: 3000 };
    expect(cardPricing(one).wasText).toBe("Rs.3,000.00");
    expect(cardPricing({ ...one, variant_max: 2600 }).wasText).toBeNull();
    expect(cardPricing({ ...one, variant_was_max: 2000 }).wasText).toBeNull();
  });

  test("variants all out of stock: out of stock (product stock is ignored)", () => {
    expect(
      cardPricing({
        price: 100,
        stock_quantity: 50,
        variant_count: 2,
        variant_min: 10,
        variant_max: 20,
        variant_in_stock: false,
      }).action,
    ).toBe("out");
  });

  test("pack product shows 'Pack of 6'", () => {
    expect(
      cardPricing({
        price: 300,
        sell_unit: "pack",
        pack_size: 6,
        unit_label: "sheet",
        stock_quantity: 3,
      }).packText,
    ).toBe("Pack of 6");
    expect(cardPricing({ price: 300, sell_unit: "item" }).packText).toBeNull();
  });
});

describe("variantStats (same rule as catalog_search)", () => {
  test("own price, else product price (sale if lower) + modifier; inactive ignored", () => {
    expect(
      variantStats({ price: 1000, sale_price: 900 }, [
        { price: 1200, stock: 0 },
        { price: null, price_modifier: -100, stock: 2 },
        { price: 50, stock: 5, is_active: false },
      ]),
    ).toEqual({ variant_count: 2, variant_min: 800, variant_max: 1200, variant_in_stock: true });
  });

  test("no variants", () => {
    expect(variantStats({ price: 10 }, [])).toEqual({
      variant_count: 0,
      variant_min: null,
      variant_max: null,
      variant_in_stock: null,
    });
    expect(variantStats({ price: 10 }, null).variant_count).toBe(0);
  });

  test("all out of stock", () => {
    expect(variantStats({ price: 10 }, [{ price: 10, stock: 0 }]).variant_in_stock).toBe(false);
  });
});
