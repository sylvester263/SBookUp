// Where a banner (or tile / slide) goes. Stored as JSON in homepage section
// config and edited with the admin link picker (Phase 3).
import { categoryHref, type TreeCategory } from "@/lib/category-path";

export type BannerLink =
  | { type: "category"; slug: string }
  | { type: "product"; slug: string }
  /** A listing URL on this site, e.g. "/shop/books?sort=best_sellers" */
  | { type: "listing"; href: string }
  | { type: "url"; href: string };

export type ResolvedLink = { href: string; external: boolean };

/** Only same-site paths ("/…", not "//…"). */
const isSitePath = (h: string) => h.startsWith("/") && !h.startsWith("//");

/**
 * The href for a banner link, or null when it's missing or unsafe
 * (e.g. "javascript:" URLs are refused). `cats` builds nested category paths
 * (/shop/stationery/notebooks); without it, /shop/<slug> is used.
 */
export function resolveBannerLink(
  link: BannerLink | null | undefined,
  cats: TreeCategory[] = [],
): ResolvedLink | null {
  if (!link) return null;
  switch (link.type) {
    case "category":
      return link.slug ? { href: categoryHref(cats, link.slug), external: false } : null;
    case "product":
      return link.slug
        ? { href: `/product/${encodeURIComponent(link.slug)}`, external: false }
        : null;
    case "listing": {
      const h = (link.href ?? "").trim();
      return isSitePath(h) ? { href: h, external: false } : null;
    }
    case "url": {
      const h = (link.href ?? "").trim();
      if (isSitePath(h)) return { href: h, external: false };
      try {
        const u = new URL(h);
        return u.protocol === "https:" || u.protocol === "http:"
          ? { href: u.toString(), external: true }
          : null;
      } catch {
        return null;
      }
    }
    default:
      return null;
  }
}
