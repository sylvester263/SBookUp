// Storefront listing (/shop): URL search params, the catalog_search request,
// active-filter chips and category paths. Pure helpers are unit-tested (shop.test.ts).
import { z } from "zod";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SORTS = [
  { value: "new_arrivals", label: "New Arrivals" },
  { value: "best_sellers", label: "Best Sellers" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "name", label: "Name" },
] as const;
export type ShopSort = (typeof SORTS)[number]["value"];

/** Everything lives in the URL: shareable and back-button safe. */
export const shopSearchSchema = z.object({
  q: z.string().trim().max(120).optional().catch(undefined),
  sort: z.enum(["new_arrivals", "best_sellers", "price_asc", "price_desc", "name"]).optional().catch(undefined),
  page: z.number().int().min(1).max(10_000).optional().catch(undefined),
  min: z.number().min(0).optional().catch(undefined),
  max: z.number().min(0).optional().catch(undefined),
  type: z.array(z.string().max(120)).max(30).optional().catch(undefined),
  f: z.record(z.array(z.string().max(200)).max(50)).optional().catch(undefined),
  /** "Shop Deals": only products on sale (sale price, or a variant below its was price). */
  on_sale: z.preprocess((v) => (v === true || v === "true" ? true : undefined), z.literal(true).optional()).catch(undefined),
});
export type ShopSearch = z.infer<typeof shopSearchSchema>;

export function parseShopSearch(raw: Record<string, unknown>): ShopSearch {
  const r = shopSearchSchema.safeParse(raw);
  return r.success ? r.data : {};
}

export const PER_PAGE = 24;

/** Request body for catalog_search. */
export function buildCatalogParams(categorySlug: string | undefined, s: ShopSearch, extra: { only?: "new_arrivals" | "best_sellers" | "on_sale"; perPage?: number } = {}) {
  const filters = Object.fromEntries(Object.entries(s.f ?? {}).filter(([, v]) => Array.isArray(v) && v.length));
  return {
    category: categorySlug ?? null,
    q: s.q || null,
    sort: s.sort ?? "new_arrivals",
    page: s.page ?? 1,
    per_page: extra.perPage ?? PER_PAGE,
    min_price: s.min ?? null,
    max_price: s.max ?? null,
    types: s.type?.length ? s.type : null,
    filters,
    only: extra.only ?? (s.on_sale ? "on_sale" : null),
  };
}

export type FacetOption = { value: string; label: string; count: number };
export type Facet = { key: string; label: string; type: string; unit?: string | null; help_text?: string | null; is_variant_axis: boolean; options: FacetOption[] };
export type ShopItem = {
  id: string; name: string; slug: string; price: number; sale_price: number | null; images: string[];
  author: string | null; brand: string | null; isbn: string | null; is_featured: boolean; stock_quantity: number;
  sell_unit: string | null; pack_size: number | null; unit_label: string | null; is_new: boolean;
  variant_count: number; variant_min: number | null; variant_max: number | null; variant_in_stock: boolean | null;
  /** Missing until the on_sale migration is applied. */
  variant_was_max?: number | null;
};
export type ShopResult = {
  not_found?: boolean;
  category: { id: string; slug: string; name: string } | null;
  items: ShopItem[]; total: number; page: number; per_page: number;
  price: { min: number | null; max: number | null };
  types: FacetOption[]; facets: Facet[]; filter_keys: string[];
};

export function shopQuery(categorySlug: string | undefined, s: ShopSearch, extra: Parameters<typeof buildCatalogParams>[2] = {}) {
  const params = buildCatalogParams(categorySlug, s, extra);
  return queryOptions({
    queryKey: ["shop", params],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("catalog_search", { p: params });
      if (error) throw error;
      return data as unknown as ShopResult;
    },
  });
}

/** Drops filter keys the current category doesn't have (e.g. after switching category). */
export function cleanFilters(f: ShopSearch["f"], allowedKeys: string[]): ShopSearch["f"] {
  if (!f) return undefined;
  const out = Object.fromEntries(Object.entries(f).filter(([k, v]) => allowedKeys.includes(k) && v?.length));
  return Object.keys(out).length ? out : undefined;
}

export function toggleValue(list: string[] | undefined, value: string): string[] | undefined {
  const cur = list ?? [];
  const next = cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
  return next.length ? next : undefined;
}

export type Chip = { key: string; label: string; patch: Partial<ShopSearch> };

/** Active filter chips; each chip's patch removes just that filter (and resets the page). */
export function activeChips(s: ShopSearch, result: Pick<ShopResult, "types" | "facets"> | undefined, typeLabel = "Type"): Chip[] {
  const chips: Chip[] = [];
  const typeName = (v: string) => result?.types.find((t) => t.value === v)?.label ?? v;
  for (const t of s.type ?? []) chips.push({ key: `type:${t}`, label: `${typeLabel}: ${typeName(t)}`, patch: { type: toggleValue(s.type, t), page: undefined } });
  for (const [k, vals] of Object.entries(s.f ?? {})) {
    const facet = result?.facets.find((x) => x.key === k);
    for (const v of vals) {
      const label = facet?.options.find((o) => o.value === v)?.label ?? v;
      const rest = { ...(s.f ?? {}), [k]: vals.filter((x) => x !== v) };
      if (!rest[k].length) delete rest[k];
      chips.push({ key: `f:${k}:${v}`, label: `${facet?.label ?? k}: ${label}${facet?.unit ? ` ${facet.unit}` : ""}`, patch: { f: Object.keys(rest).length ? rest : undefined, page: undefined } });
    }
  }
  if (s.min != null || s.max != null) {
    const txt = s.min != null && s.max != null ? `Rs. ${s.min.toLocaleString()} – ${s.max.toLocaleString()}`
      : s.min != null ? `From Rs. ${s.min.toLocaleString()}` : `Up to Rs. ${s.max!.toLocaleString()}`;
    chips.push({ key: "price", label: `Price: ${txt}`, patch: { min: undefined, max: undefined, page: undefined } });
  }
  if (s.q) chips.push({ key: "q", label: `Search: “${s.q}”`, patch: { q: undefined, page: undefined } });
  if (s.on_sale) chips.push({ key: "on_sale", label: "Deals only", patch: { on_sale: undefined, page: undefined } });
  return chips;
}

export const clearAllPatch: Partial<ShopSearch> = { type: undefined, f: undefined, min: undefined, max: undefined, q: undefined, on_sale: undefined, page: undefined };

// ---------------------------------------------------------------- categories
export type NavCategory = {
  id: string; name: string; slug: string; parent_id: string | null; display_order: number;
  show_in_nav: boolean; show_on_home: boolean; image_url: string | null; description: string | null;
  seo_title: string | null; seo_description: string | null;
};

/** All active categories (small table) — nav, breadcrumbs, banners, homepage grid. */
export const navCategoriesQuery = queryOptions({
  queryKey: ["nav-categories"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,parent_id,display_order,show_in_nav,show_on_home,image_url,description,seo_title,seo_description")
      .eq("is_active", true)
      .order("display_order")
      .order("name");
    if (error) throw error;
    return (data ?? []) as NavCategory[];
  },
  staleTime: 5 * 60_000,
});

export function childrenOf(cats: NavCategory[], parentId: string | null) {
  return cats.filter((c) => c.parent_id === parentId).sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
}

// Breadcrumb chain and canonical /shop URL (pure; shared with the sitemap and SEO)
export { ancestry, categoryHref } from "@/lib/category-path";

export type PublicAttributeDef = { key: string; label: string; type: string; unit: string | null; options: { value: string; label: string; sort?: number }[]; sort_order: number };

/** Active attribute definitions (labels / option order for product pages). */
export const attributeDefsQuery = queryOptions({
  queryKey: ["attribute-defs"],
  queryFn: async () => {
    const { data, error } = await supabase.from("attribute_definitions").select("key,label,type,unit,options,sort_order").eq("is_active", true).order("sort_order");
    if (error) throw error;
    return (data ?? []) as unknown as PublicAttributeDef[];
  },
  staleTime: 10 * 60_000,
});
