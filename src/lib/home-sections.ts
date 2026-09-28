// Homepage section order / visibility and "Shop by price" bands (store settings).
// Pure helpers, unit-tested in home-sections.test.ts.

export const HOME_SECTION_KEYS = ["categories", "new_arrivals", "recently_added", "price_bands", "best_sellers"] as const;
export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];
export type HomeSection = { key: HomeSectionKey; enabled: boolean };

export const HOME_SECTION_LABELS: Record<HomeSectionKey, string> = {
  categories: "Shop by Category (category cards)",
  new_arrivals: "New Arrivals (carousel)",
  recently_added: "Recently Added (carousel)",
  price_bands: "Shop by price (price bands)",
  best_sellers: "Best Sellers (carousel)",
};

export const DEFAULT_HOME_SECTIONS: HomeSection[] = HOME_SECTION_KEYS.map((key) => ({ key, enabled: true }));

/** Settings value → valid, complete list (unknown keys dropped, missing ones appended enabled). */
export function parseHomeSections(raw: unknown): HomeSection[] {
  const list = Array.isArray(raw) ? raw : [];
  const out: HomeSection[] = [];
  for (const r of list) {
    const key = (r as { key?: unknown })?.key;
    if (typeof key === "string" && (HOME_SECTION_KEYS as readonly string[]).includes(key) && !out.some((o) => o.key === key)) {
      out.push({ key: key as HomeSectionKey, enabled: (r as { enabled?: unknown }).enabled !== false });
    }
  }
  for (const key of HOME_SECTION_KEYS) if (!out.some((o) => o.key === key)) out.push({ key, enabled: true });
  return out;
}

export type PriceBand = { label: string; min: number | null; max: number | null };

export function parsePriceBands(raw: unknown): PriceBand[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => ({
      label: String((b as PriceBand)?.label ?? "").trim(),
      min: numOrNull((b as PriceBand)?.min),
      max: numOrNull((b as PriceBand)?.max),
    }))
    .filter((b) => b.label && (b.min != null || b.max != null) && (b.min == null || b.max == null || b.max > b.min));
}

const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" || !Number.isFinite(Number(v)) || Number(v) < 0 ? null : Number(v));

/** /shop link with the price filter applied (same URL format the listing uses). */
export function priceBandHref(b: PriceBand) {
  const q = new URLSearchParams();
  if (b.min != null) q.set("min", String(b.min));
  if (b.max != null) q.set("max", String(b.max));
  const s = q.toString();
  return s ? `/shop?${s}` : "/shop";
}
