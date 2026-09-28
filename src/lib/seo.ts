// SEO helpers: canonical URLs for listings and JSON-LD (BreadcrumbList, Product).
// Pure and unit-tested (seo.test.ts). URLs are absolute when VITE_SITE_URL is set,
// otherwise root-relative (same as the rest of the site's canonical links).
import type { ShopSearch } from "@/lib/shop";
import { categoryHref } from "@/lib/category-path";

export const SITE_NAME = "SchoolBooksExperts";

const envBase = (): string => {
  try {
    return String(import.meta.env?.VITE_SITE_URL ?? "").trim().replace(/\/+$/, "");
  } catch {
    return "";
  }
};

export function siteUrl(path: string, base: string = envBase()): string {
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Any filter, search or non-default sort in the URL (a filtered listing). */
export function isFilteredListing(s: ShopSearch): boolean {
  return Boolean(
    s.q || (s.sort && s.sort !== "new_arrivals") || s.min != null || s.max != null || s.type?.length ||
      Object.values(s.f ?? {}).some((v) => v?.length),
  );
}

/**
 * Canonical for a /shop listing. Filtered or sorted views point at the plain
 * category page; an unfiltered page 2+ keeps its page number.
 */
export function listingCanonical(path: string, s: ShopSearch): string {
  if (isFilteredListing(s)) return path;
  return s.page && s.page > 1 ? `${path}?page=${s.page}` : path;
}

export type Crumb = { name: string; path: string };

export function breadcrumbJsonLd(items: Crumb[], base?: string) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: siteUrl(c.path, base) })),
  };
}

export type SeoVariant = {
  id: string; name: string; sku?: string | null; price?: number | null; price_modifier?: number | null;
  stock?: number | null; is_active?: boolean | null; image_url?: string | null;
};
export type SeoProduct = {
  name: string; slug: string; description?: string | null; images?: string[] | null; sku?: string | null;
  isbn?: string | null; brand?: string | null; publisher?: string | null; author?: string | null;
  price: number; sale_price?: number | null; stock_quantity?: number | null;
  sell_unit?: string | null; pack_size?: number | null; unit_label?: string | null;
  variants?: SeoVariant[] | null;
};

/** Same rule as the server (_compute_order): sale price when lower, variant price or base + modifier. */
export function basePrice(p: Pick<SeoProduct, "price" | "sale_price">): number {
  return p.sale_price != null && Number(p.sale_price) < Number(p.price) ? Number(p.sale_price) : Number(p.price);
}
export function variantPrice(p: Pick<SeoProduct, "price" | "sale_price">, v: SeoVariant): number {
  return v.price != null ? Number(v.price) : basePrice(p) + Number(v.price_modifier ?? 0);
}

export function plainText(html: string | null | undefined, max = 300): string {
  const entities: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", apos: "'" };
  const txt = (html ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&(nbsp|amp|lt|gt|quot|#39|apos);/g, (_, e: string) => entities[e])
    .replace(/\s+/g, " ")
    .trim();
  return txt.length > max ? `${txt.slice(0, max - 1).trimEnd()}…` : txt;
}

const money = (n: number) => Math.round(n * 100) / 100;
const availability = (stock: number | null | undefined) =>
  Number(stock ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock";

export function productJsonLd(p: SeoProduct, base?: string) {
  const url = siteUrl(`/product/${p.slug}`, base);
  const isPack = p.sell_unit === "pack" && Number(p.pack_size) > 1;
  // Packs: the price is per pack; say how many units a pack holds
  const packSpec = (price: number) =>
    isPack
      ? {
          priceSpecification: {
            "@type": "UnitPriceSpecification", price: money(price), priceCurrency: "PKR",
            referenceQuantity: { "@type": "QuantitativeValue", value: Number(p.pack_size), unitText: p.unit_label || "item" },
          },
        }
      : {};
  const offer = (price: number, stock: number | null | undefined, extra: Record<string, unknown> = {}) => ({
    "@type": "Offer", url, price: money(price), priceCurrency: "PKR", availability: availability(stock),
    itemCondition: "https://schema.org/NewCondition", ...packSpec(price), ...extra,
  });

  const variants = (p.variants ?? []).filter((v) => v.is_active !== false);
  let offers: Record<string, unknown>;
  if (variants.length) {
    const list = variants.map((v) => offer(variantPrice(p, v), v.stock, { name: v.name, ...(v.sku ? { sku: v.sku } : {}) }));
    const prices = list.map((o) => o.price);
    offers = { "@type": "AggregateOffer", priceCurrency: "PKR", lowPrice: Math.min(...prices), highPrice: Math.max(...prices), offerCount: list.length, offers: list };
  } else {
    offers = offer(basePrice(p), p.stock_quantity);
  }

  const images = [...(p.images ?? []), ...variants.map((v) => v.image_url).filter((u): u is string => !!u)];
  const isbn = (p.isbn ?? "").replace(/[^0-9]/g, "");
  const brand = p.brand || p.publisher;
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: p.name,
    url,
    ...(images.length ? { image: [...new Set(images)].map((u) => (u.startsWith("/") ? siteUrl(u, base) : u)) } : {}),
    ...(plainText(p.description) ? { description: plainText(p.description, 5000) } : {}),
    ...(p.sku ? { sku: p.sku } : {}),
    ...(isbn.length === 13 ? { gtin13: isbn } : {}),
    ...(brand ? { brand: { "@type": "Brand", name: brand } } : {}),
    offers,
  };
}

/** Serialise for a <script type="application/ld+json"> (can't break out of the tag). */
export function jsonLd(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

// ------------------------------------------------------------ listing <head>
type ListingCategory = {
  id: string; slug: string; parent_id: string | null; name: string;
  seo_title?: string | null; seo_description?: string | null; description?: string | null;
};

/**
 * Title, description, canonical and BreadcrumbList for /shop, /shop/<cat> and
 * /shop/<parent>/<child>. `chain` is top-level → current category (empty for /shop).
 */
export function listingHead(chain: ListingCategory[], search: ShopSearch, base?: string) {
  const c = chain[chain.length - 1];
  const path = c ? categoryHref(chain, c.slug) : "/shop";
  const page = search.page && search.page > 1 ? ` — Page ${search.page}` : "";
  const title = `${c ? c.seo_title || c.name : "Shop all products"}${page} — ${SITE_NAME}`;
  const description = c
    ? c.seo_description || plainText(c.description, 160) || `Shop ${c.name} online at ${SITE_NAME}. Delivery across Pakistan.`
    : "Books, stationery, gifts, toys & games, sports items and character costumes — delivered across Pakistan.";
  const canonical = siteUrl(listingCanonical(path, search), base);
  const crumbs: Crumb[] = [{ name: "Home", path: "/" }, { name: "Shop", path: "/shop" }, ...chain.map((x) => ({ name: x.name, path: categoryHref(chain, x.slug) }))];
  return {
    meta: [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:url", content: canonical },
    ],
    links: [{ rel: "canonical", href: canonical }],
    scripts: [{ type: "application/ld+json", children: jsonLd(breadcrumbJsonLd(crumbs, base)) }],
  };
}
