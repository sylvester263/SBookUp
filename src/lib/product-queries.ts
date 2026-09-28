import { supabase } from "@/integrations/supabase/client";
import { queryOptions } from "@tanstack/react-query";
import type { Product } from "@/lib/home-data";
import { categorySubtreeIds, withCategoryJoin } from "@/lib/category-tree";
import { variantStats } from "@/lib/pricing";

export type Sort = "relevance" | "price_asc" | "price_desc" | "newest" | "rating" | "popular";

export type ProductListInput = {
  categorySlug?: string;
  q?: string;
  searchField?: "all" | "title" | "isbn" | "author";
  minPrice?: number;
  maxPrice?: number;
  publishers?: string[];
  tags?: string[];
  inStock?: boolean;
  minRating?: number;
  sort?: Sort;
  page?: number;
  perPage?: number;
};

const PER_PAGE_DEFAULT = 24;

// Every column the public may read. Never use select("*") on products:
// cost_price is not readable by the public and "*" would be refused.
export const PUBLIC_PRODUCT_COLUMNS =
  "id,name,slug,description,sku,isbn,category_id,brand,author,publisher,edition,price,sale_price,stock_quantity,low_stock_threshold,weight_grams,images,tags,is_featured,is_active,created_at,updated_at,attributes,sell_unit,pack_size,unit_label,sales_count,is_new_arrival,new_arrival_until";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function productBySlugQuery(slug: string) {
  return queryOptions({
    queryKey: ["product", slug],
    queryFn: async () => {
      if (!slug) return null;
      // Try by slug first
      let { data: product, error } = await supabase
        .from("products")
        .select(PUBLIC_PRODUCT_COLUMNS)
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) console.error("Product by slug error:", error);

      // Fallback: maybe the URL contains an id
      if (!product && UUID_RE.test(slug)) {
        const { data: byId, error: errById } = await supabase
          .from("products")
          .select(PUBLIC_PRODUCT_COLUMNS)
          .eq("id", slug)
          .maybeSingle();
        if (errById) console.error("Product by id error:", errById);
        product = byId ?? null;
      }

      if (!product) return null;

      // Fetch category separately (safer than embedded join)
      let category: { id: string; name: string; slug: string } | null = null;
      if (product.category_id) {
        const { data: cat } = await supabase
          .from("categories")
          .select("id,name,slug")
          .eq("id", product.category_id)
          .maybeSingle();
        category = cat ?? null;
      }

      // Variants
      const { data: variants } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", product.id);

      // Every category the product belongs to (primary first) — for "Also in" links.
      const { data: links } = await supabase
        .from("product_categories")
        .select("is_primary, category:categories(id,name,slug,is_active)")
        .eq("product_id", product.id);
      const all_categories = ((links ?? []) as unknown as { is_primary: boolean; category: { id: string; name: string; slug: string; is_active: boolean } | null }[])
        .filter((l) => l.category?.is_active)
        .sort((a, b) => Number(b.is_primary) - Number(a.is_primary))
        .map((l) => ({ ...l.category!, is_primary: l.is_primary }));

      return { ...product, categories: category, all_categories, variants: (variants ?? []).filter((v: any) => v.is_active !== false) };
    },
  });
}

export function relatedProductsQuery(categoryId: string | null, excludeId: string) {
  return queryOptions({
    queryKey: ["products", "related", categoryId, excludeId],
    queryFn: async () => {
      if (!categoryId) return [] as Product[];
      // Stock, pack and variant fields too, so the card shows the right button
      // (e.g. "Choose options" for costumes). One query: variants are embedded.
      const { data, error } = await supabase
        .from("products")
        .select("id,name,slug,price,sale_price,images,author,brand,isbn,is_featured,stock_quantity,sell_unit,pack_size,unit_label,product_variants(price,price_modifier,stock,is_active)")
        .eq("is_active", true)
        .eq("category_id", categoryId)
        .neq("id", excludeId)
        .limit(6);
      if (error) throw error;
      return (data ?? []).map(({ product_variants, ...p }) => ({ ...p, ...variantStats(p, product_variants) })) as Product[];
    },
  });
}

export function bundleBySlugQuery(slug: string) {
  return queryOptions({
    queryKey: ["bundle", slug],
    queryFn: async () => {
      const { data: bundle, error } = await supabase
        .from("bundles")
        .select("*")
        .eq("slug", slug)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      if (!bundle) return null;
      const { data: items } = await supabase
        .from("bundle_items")
        .select("id,quantity,product_id,products(id,name,slug,price,sale_price,images,author)")
        .eq("bundle_id", bundle.id);
      return { bundle, items: items ?? [] };
    },
  });
}

export function relatedBundlesQuery(excludeId: string) {
  return queryOptions({
    queryKey: ["bundles", "related", excludeId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bundles")
        .select("*")
        .eq("is_active", true)
        .neq("id", excludeId)
        .limit(4);
      if (error) throw error;
      return data ?? [];
    },
  });
}
