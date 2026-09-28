// Shared bits for the admin catalog screens (categories, attributes, product form).
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { adminCatalogContext } from "@/lib/catalog-admin.functions";
import type { AttributeDefinition } from "@/lib/attributes";
import type { CategoryAttributeRow } from "@/lib/catalog-import";

export type AdminCategory = {
  id: string; name: string; slug: string; parent_id: string | null; description: string | null; image_url: string | null;
  display_order: number; is_active: boolean; show_in_nav: boolean; show_on_home: boolean;
  seo_title: string | null; seo_description: string | null;
  default_sell_unit: string; default_pack_size: number | null; default_unit_label: string | null;
  product_count: number;
};

export type CatalogData = { categories: AdminCategory[]; definitions: AttributeDefinition[]; categoryAttributes: CategoryAttributeRow[] };

export function useCatalog() {
  const fn = useServerFn(adminCatalogContext);
  return useQuery({ queryKey: ["admin-catalog"], queryFn: async () => (await fn()) as unknown as CatalogData });
}

/** Depth-first flattening of the category tree (siblings by display_order, then name). */
export function flattenTree<T extends { id: string; parent_id: string | null; display_order: number; name: string }>(rows: T[]) {
  const byParent = new Map<string | null, T[]>();
  const ids = new Set(rows.map((r) => r.id));
  for (const r of rows) {
    const k = r.parent_id && ids.has(r.parent_id) ? r.parent_id : null;
    if (!byParent.has(k)) byParent.set(k, []);
    byParent.get(k)!.push(r);
  }
  for (const list of byParent.values()) list.sort((a, b) => a.display_order - b.display_order || a.name.localeCompare(b.name));
  const out: { c: T; depth: number; siblings: T[] }[] = [];
  const walk = (parent: string | null, depth: number, seen: Set<string>) => {
    for (const c of byParent.get(parent) ?? []) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push({ c, depth, siblings: byParent.get(parent) ?? [] });
      walk(c.id, depth + 1, seen);
    }
  };
  walk(null, 0, new Set());
  return out;
}

/** Full path label, e.g. "Stationery › Notebooks". */
export function categoryPath(id: string, cats: { id: string; name: string; parent_id: string | null }[]) {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const parts: string[] = [];
  let cur = byId.get(id);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(cur.name);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return parts.join(" › ");
}
