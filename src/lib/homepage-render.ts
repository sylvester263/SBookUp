// Pure helpers for rendering homepage sections (unit-tested in homepage-render.test.ts).
import { isSchoolFeatureHref } from "@/lib/feature-flags";
import type { BannerLink } from "@/lib/banner-link";
import {
  isKnownType,
  parseConfig,
  type Banner,
  type PriceRange,
  type ProductSource,
  type SectionRow,
} from "@/lib/homepage-sections";

/** Does this link lead to a school-feature page (hidden while school features are off)? */
export function isSchoolLink(link: BannerLink | null | undefined): boolean {
  if (!link) return false;
  return (link.type === "url" || link.type === "listing") && isSchoolFeatureHref(link.href);
}

/** Banners that may be shown: school-feature links are dropped while those features are off. */
export function visibleBanners(banners: Banner[], schoolFeatures: boolean): Banner[] {
  return schoolFeatures ? banners : banners.filter((b) => !isSchoolLink(b.link));
}

/** Black or white text, whichever reads better on the tile colour (WCAG luminance). */
export function readableTextOn(hex: string): "#FFFFFF" | "#111111" {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return "#FFFFFF";
  const n = parseInt(m[1], 16);
  const lin = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  // Contrast against white vs against near-black; pick the larger
  return 1.05 / (L + 0.05) >= (L + 0.05) / 0.0555 ? "#FFFFFF" : "#111111";
}

/** /shop?min=…&max=… for a price range (the shop reads plain numbers). */
export function priceRangeHref(r: Pick<PriceRange, "min" | "max">): string {
  const q = new URLSearchParams();
  if (r.min != null) q.set("min", String(r.min));
  if (r.max != null) q.set("max", String(r.max));
  const s = q.toString();
  return s ? `/shop?${s}` : "/shop";
}

/** The product source of a section (null for sections without products). */
export function sectionSource(row: SectionRow): { source: ProductSource; limit: number } | null {
  if (!isKnownType(row.type)) return null;
  switch (row.type) {
    case "product_carousel": {
      const c = parseConfig("product_carousel", row.config);
      return { source: c.source, limit: c.limit };
    }
    case "banner_with_products": {
      const c = parseConfig("banner_with_products", row.config);
      return { source: c.source, limit: c.limit };
    }
    case "banner_full": {
      const c = parseConfig("banner_full", row.config);
      return c.source ? { source: c.source, limit: c.limit } : null;
    }
    default:
      return null;
  }
}

/** Product sources of the first `count` product sections (loaded on the server, so the top of the page doesn't pop in). */
export function firstProductSources(rows: SectionRow[], count = 2) {
  return rows
    .map(sectionSource)
    .filter((x): x is NonNullable<typeof x> => !!x)
    .slice(0, count);
}
