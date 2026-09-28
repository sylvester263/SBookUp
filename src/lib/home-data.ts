import { supabase } from "@/integrations/supabase/client";
import { categorySubtreeIds, withCategoryJoin } from "@/lib/category-tree";
import { queryOptions } from "@tanstack/react-query";

export type Banner = {
  id: string;
  title: string;
  subtitle: string | null;
  image_url: string;
  link_url: string | null;
  position: string;
};

export type Category = {
  id: string;
  name: string;
  slug: string;
  image_url: string | null;
  description: string | null;
};

export type Product = {
  id: string;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  images: string[];
  author: string | null;
  brand: string | null;
  isbn: string | null;
  is_featured: boolean;
  // Catalog fields (optional: not every query selects them)
  stock_quantity?: number;
  sell_unit?: string | null;
  pack_size?: number | null;
  unit_label?: string | null;
  is_new?: boolean;
  variant_count?: number;
  variant_min?: number | null;
  variant_max?: number | null;
  variant_in_stock?: boolean | null;
};

export type BundleItem = {
  id: string;
  quantity: number;
  product: { id: string; name: string; price: number; sale_price: number | null; images: string[] } | null;
};

export type Bundle = {
  id: string;
  name: string;
  slug: string;
  school_name: string | null;
  class_level: string | null;
  exam_board: string | null;
  total_price: number;
  discounted_price: number;
  image_url: string | null;
  description: string | null;
  items?: BundleItem[];
};

export function getBundleOriginalTotal(b: Bundle): number {
  const computed = (b.items ?? []).reduce(
    (s, it) => s + (it.product?.price ?? 0) * it.quantity,
    0,
  );
  if (computed > 0) return computed;
  return Number(b.total_price) || 0;
}

export function getBundlePrice(b: Bundle): number {
  if (b.discounted_price && Number(b.discounted_price) > 0) return Number(b.discounted_price);
  return (b.items ?? []).reduce(
    (s, it) => s + ((it.product?.sale_price ?? it.product?.price) ?? 0) * it.quantity,
    0,
  );
}

export function getBundleSavings(b: Bundle): number {
  return Math.max(0, getBundleOriginalTotal(b) - getBundlePrice(b));
}

export const bannersQuery = queryOptions({
  queryKey: ["home", "banners"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("banners")
      .select("*")
      .eq("is_active", true)
      .eq("position", "hero")
      .order("display_order");
    if (error) throw error;
    return data as Banner[];
  },
});

export const categoriesQuery = queryOptions({
  queryKey: ["home", "categories"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,image_url,description")
      .eq("is_active", true)
      .order("display_order");
    if (error) throw error;
    return data as Category[];
  },
});

export const bundlesQuery = queryOptions({
  queryKey: ["home", "bundles"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("bundles")
      .select("*, items:bundle_items(id,quantity,product:products(id,name,price,sale_price,images))")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(8);
    if (error) throw error;
    return (data ?? []) as Bundle[];
  },
});

export function productsByCategoryQuery(categorySlug: string) {
  return queryOptions({
    queryKey: ["home", "products", categorySlug],
    queryFn: async () => {
      // Category + sub-categories, any membership (product_categories)
      const catIds = await categorySubtreeIds(categorySlug);
      let q = supabase
        .from("products")
        .select(withCategoryJoin("id,name,slug,price,sale_price,images,author,brand,isbn,is_featured,sell_unit,pack_size,unit_label", !!catIds))
        .eq("is_active", true);
      if (catIds) q = q.in("product_categories.category_id", catIds);
      const { data, error } = await q.order("is_featured", { ascending: false }).limit(12);
      if (error) throw error;
      return (data ?? []) as unknown as Product[];
    },
  });
}
