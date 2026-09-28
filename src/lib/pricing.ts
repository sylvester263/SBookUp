// Display helpers for pack pricing (the server decides the actual prices).

export type PackInfo = { sell_unit?: string | null; pack_size?: number | null; unit_label?: string | null };

export const rs = (n: number) => `Rs. ${Math.round(n).toLocaleString("en-PK")}`;

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
