// Homepage data: the sections, and the products for each carousel's source.
// One request per carousel (catalog_search, or one select by id for
// hand-picked products with their variants embedded).
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sourceSearchParams, type ProductSource, type SectionRow } from "@/lib/homepage-sections";
import { variantStats } from "@/lib/pricing";
import type { CardItem } from "@/components/store/ProductCard";
import type { ShopResult } from "@/lib/shop";

/** Live sections, in order (the database only returns active, in-date ones). */
export const homepageSectionsQuery = queryOptions({
  queryKey: ["homepage-sections"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("homepage_sections")
      .select("id,type,title,subtitle,config,sort_order,is_active,starts_at,ends_at")
      .order("sort_order")
      .order("created_at");
    if (error) throw error;
    return (data ?? []) as SectionRow[];
  },
  staleTime: 60_000,
});

const CARD_COLUMNS =
  "id,name,slug,price,sale_price,images,stock_quantity,sell_unit,pack_size,unit_label,is_active,product_variants(price,price_modifier,compare_at_price,stock,is_active)";

/** Products for a carousel source, in display order. */
export function sectionProductsQuery(source: ProductSource, limit: number) {
  return queryOptions({
    queryKey: ["homepage-products", source, limit],
    queryFn: async (): Promise<CardItem[]> => {
      if (source.type === "manual") {
        const ids = source.product_ids.slice(0, limit);
        if (!ids.length) return [];
        const load = async (cols: string) =>
          (await supabase
            .from("products")
            .select(cols)
            .in("id", ids)
            .eq("is_active", true)) as unknown as {
            data: unknown[] | null;
            error: { message: string } | null;
          };
        let { data, error } = await load(CARD_COLUMNS);
        // Before the compare-at migration the column doesn't exist: retry without it
        if (error && /compare_at_price/.test(error.message))
          ({ data, error } = await load(CARD_COLUMNS.replace("compare_at_price,", "")));
        if (error) throw error;
        const byId = new Map(
          (data ?? []).map((row) => {
            const { product_variants, ...p } = row as unknown as CardItem & {
              product_variants: {
                price: number | null;
                price_modifier: number;
                compare_at_price?: number | null;
                stock: number;
                is_active: boolean;
              }[];
            };
            const stats = variantStats(p, product_variants);
            // Highest "was" price above a variant's selling price (display only)
            const base =
              p.sale_price != null && Number(p.sale_price) < Number(p.price)
                ? Number(p.sale_price)
                : Number(p.price);
            const was = (product_variants ?? [])
              .filter(
                (v) =>
                  v.is_active !== false &&
                  v.compare_at_price != null &&
                  Number(v.compare_at_price) >
                    (v.price != null ? Number(v.price) : base + Number(v.price_modifier ?? 0)),
              )
              .map((v) => Number(v.compare_at_price));
            return [
              p.id,
              { ...p, ...stats, variant_was_max: was.length ? Math.max(...was) : null } as CardItem,
            ];
          }),
        );
        // Keep the order chosen in admin
        return ids.map((id) => byId.get(id)).filter((x): x is CardItem => !!x);
      }
      const { data, error } = await supabase.rpc("catalog_search", {
        p: sourceSearchParams(source, limit),
      });
      if (error) throw error;
      return ((data as unknown as ShopResult)?.items ?? []) as CardItem[];
    },
    staleTime: 60_000,
  });
}
