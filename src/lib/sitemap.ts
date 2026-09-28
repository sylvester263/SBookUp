// Pure helpers for sitemap.xml and robots.txt (unit-tested in sitemap.test.ts).
import { categoryHref, isReachable, type TreeCategory } from "@/lib/category-path";

export type SitemapEntry = { slug: string; updated_at?: string | null };
export type SitemapCategory = TreeCategory & { updated_at?: string | null };
export type SitemapData = {
  products: SitemapEntry[];
  /** Active categories (with parent_id), listed at their canonical /shop URL. */
  categories: SitemapCategory[];
  bundles: SitemapEntry[];
  schools: SitemapEntry[];
  /** When false, /schools, school pages and bundles are left out. */
  schoolFeatures?: boolean;
};

export const STATIC_PATHS = ["/", "/about", "/contact", "/faq", "/terms", "/privacy", "/refund", "/shipping", "/shop", "/track"];

/** SITE_URL env (no trailing slash), falling back to the request's own origin. */
export function resolveBaseUrl(siteUrl: string | undefined, requestUrl: string) {
  const fromEnv = (siteUrl ?? "").trim().replace(/\/+$/, "");
  return fromEnv || new URL(requestUrl).origin;
}

const xmlEscape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

function lastmod(d?: string | null) {
  if (!d) return "";
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? "" : `<lastmod>${t.toISOString().slice(0, 10)}</lastmod>`;
}

export function buildSitemapXml(base: string, data: SitemapData) {
  const url = (path: string, mod = "", extra = "") => `<url><loc>${xmlEscape(base + path)}</loc>${mod}${extra}</url>`;
  const seg = (s: string) => encodeURIComponent(s);
  const urls = [
    ...STATIC_PATHS.map((p) => url(p, "", "<changefreq>weekly</changefreq>")),
    ...(data.schoolFeatures ? [url("/schools", "", "<changefreq>weekly</changefreq>")] : []),
    // Top-level categories and sub-categories; a category under a hidden parent has no page
    ...data.categories
      .filter((c) => isReachable(data.categories, c.slug))
      .map((c) => url(categoryHref(data.categories, c.slug).split("/").map(seg).join("/"), lastmod(c.updated_at))),
    ...(data.schoolFeatures ? data.schools : []).map((s) => url(`/schools/${seg(s.slug)}`, lastmod(s.updated_at))),
    ...data.products.map((p) => url(`/product/${seg(p.slug)}`, lastmod(p.updated_at))),
    ...(data.schoolFeatures ? data.bundles : []).map((b) => url(`/bundle/${seg(b.slug)}`, lastmod(b.updated_at))),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join("\n")}\n</urlset>`;
}

export function buildRobotsTxt(base: string) {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /account",
    "Disallow: /checkout",
    "Disallow: /cart",
    "Disallow: /auth",
    "Disallow: /api/",
    "",
    `Sitemap: ${base}/sitemap.xml`,
    "",
  ].join("\n");
}
