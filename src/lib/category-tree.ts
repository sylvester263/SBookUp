import { supabase } from "@/integrations/supabase/client";

/**
 * Ids of a category and all of its sub-categories (by slug), or null when the
 * slug doesn't exist. Used to list a product under every category it belongs to
 * (via product_categories) and under those categories' parents.
 */
export async function categorySubtreeIds(slug: string): Promise<string[] | null> {
  const { data: cat } = await supabase.from("categories").select("id").eq("slug", slug).maybeSingle();
  if (!cat?.id) return null;
  const { data } = await supabase.rpc("category_descendants", { p_category_id: cat.id });
  const ids = (data ?? []) as unknown as string[];
  return ids.length ? ids : [cat.id];
}

/** Adds the product_categories join used for category filtering to a select list. */
export const withCategoryJoin = (columns: string, filtered: boolean) =>
  filtered ? `${columns},product_categories!inner(category_id)` : columns;
