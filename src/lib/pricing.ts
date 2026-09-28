// Display helpers for pack pricing (the server decides the actual prices).

export type PackInfo = { sell_unit?: string | null; pack_size?: number | null; unit_label?: string | null };

export const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-PK")}`;

// Fixed locale so the server and browser render the same text (no hydration mismatch).
const MONEY = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** Card price format: "Rs.1,395.00". */
export const money = (n: number) => `Rs.${MONEY.format(n)}`;

/** A "was" price worth showing: only when it's higher than what the customer pays. */
export function wasPriceOf(price: number, was: number | string | null | undefined): number | null {
  const w = was == null || was === "" ? NaN : Number(was);
  return Number.isFinite(w) && w > price ? w : null;
}

/** The fields a product card needs; listing, homepage and related-product queries all provide them. */
export type CardProduct = PackInfo & {
  price: number;
  sale_price?: number | null;
  stock_quantity?: number | null;
  variant_count?: number | null;
  variant_min?: number | null;
  variant_max?: number | null;
  variant_in_stock?: boolean | null;
  /** Highest variant "was" price above its selling price (from catalog_search). */
  variant_was_max?: number | null;
};

export type CardPricing = {
  /** "Rs.1,395.00" or a range "Rs.68.00 - Rs.269.00". */
  priceText: string;
  /** Struck-through regular price, or null. */
  wasText: string | null;
  /** "Pack of 6", or null for single items. */
  packText: string | null;
  /** What the card's button does. */
  action: "add" | "options" | "out";
  /** Unit price for an "add" (display only; the server re-prices at checkout). */
  unitPrice: number;
};

type VariantRow = { price?: number | null; price_modifier?: number | null; stock?: number | null; is_active?: boolean | null };

/**
 * variant_count / min / max / in_stock from a product's variant rows, using the
 * server's rule: the variant's own price, else the product price (sale price if
 * lower) plus the modifier. Matches what catalog_search returns for listings.
 */
export function variantStats(p: { price: number; sale_price?: number | null }, variants: VariantRow[] | null | undefined) {
  const active = (variants ?? []).filter((v) => v.is_active !== false);
  if (!active.length) return { variant_count: 0, variant_min: null, variant_max: null, variant_in_stock: null };
  const base = p.sale_price != null && Number(p.sale_price) < Number(p.price) ? Number(p.sale_price) : Number(p.price);
  const prices = active.map((v) => (v.price != null ? Number(v.price) : base + Number(v.price_modifier ?? 0)));
  return {
    variant_count: active.length,
    variant_min: Math.min(...prices),
    variant_max: Math.max(...prices),
    variant_in_stock: active.some((v) => Number(v.stock ?? 0) > 0),
  };
}

/** Price, button and pack text for a product card. */
export function cardPricing(p: CardProduct): CardPricing {
  const hasVariants = (p.variant_count ?? 0) > 0;
  const sale = wasPriceOf(Number(p.sale_price ?? NaN), p.price) != null ? Number(p.sale_price) : null;
  const packText = isPack(p) ? packLabel(p) : null;
  if (hasVariants) {
    const min = p.variant_min ?? sale ?? p.price;
    const max = p.variant_max ?? min;
    // A struck-through price only makes sense next to a single price, not a range
    const was = max > min ? null : wasPriceOf(min, p.variant_was_max);
    return {
      priceText: max > min ? `${money(min)} - ${money(max)}` : money(min),
      wasText: was != null ? money(was) : null,
      packText,
      action: p.variant_in_stock === false ? "out" : "options",
      unitPrice: min,
    };
  }
  const unit = sale ?? Number(p.price);
  const out = p.stock_quantity != null && p.stock_quantity <= 0;
  return {
    priceText: money(unit),
    wasText: sale != null ? money(Number(p.price)) : null,
    packText,
    action: out ? "out" : "add",
    unitPrice: unit,
  };
}

export function isPack(p: PackInfo): p is PackInfo & { pack_size: number } {
  return p.sell_unit === "pack" && !!p.pack_size && p.pack_size >= 2;
}

/** "Pack of 6" (or "" for single items). */
export function packLabel(p: PackInfo) {
  return isPack(p) ? `Pack of ${p.pack_size}` : "";
}

/**
 * "Rs. 600 / pack of 6 (Rs. 100 per sheet)" for packs, "Rs. 600" for single items.
 * The per-unit figure is rounded to the nearest rupee.
 */
export function formatPackPrice(price: number, p: PackInfo) {
  if (!isPack(p)) return rs(price);
  const unit = (p.unit_label || "item").trim();
  return `${rs(price)} / pack of ${p.pack_size} (${rs(price / p.pack_size)} per ${unit})`;
}
