// Catalog helpers shared by the admin product form and the bulk importer
// (unit-tested in catalog-import.test.ts): inherited category attributes and the
// variant matrix. Row validation for the importer lives in src/lib/import/.
import {
  mergeApplicable,
  type AttributeDefinition, type EffectiveAttribute,
} from "@/lib/attributes";

export type CategoryInfo = {
  id: string;
  slug: string;
  parent_id: string | null;
  default_sell_unit?: string | null;
  default_pack_size?: number | null;
  default_unit_label?: string | null;
};
export type CategoryAttributeRow = { category_id: string; attribute_id: string; is_required: boolean; is_variant_axis: boolean; sort_order: number };

export type CatalogContext = {
  categories: CategoryInfo[];
  categoryAttributes: CategoryAttributeRow[];
  definitions: AttributeDefinition[];
};

/** Own + inherited attributes for a set of categories (nearest category's settings win). */
export function effectiveAttributesFor(categoryIds: string[], ctx: CatalogContext): EffectiveAttribute[] {
  const byId = new Map(ctx.categories.map((c) => [c.id, c]));
  const defs = new Map(ctx.definitions.filter((d) => d.is_active !== false).map((d) => [d.id, d]));
  const sets = categoryIds.map((cid) => {
    const out = new Map<string, EffectiveAttribute>();
    let cur = byId.get(cid);
    let depth = 0;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id) && depth < 20) {
      seen.add(cur.id);
      for (const ca of ctx.categoryAttributes.filter((r) => r.category_id === cur!.id)) {
        const d = defs.get(ca.attribute_id);
        if (!d || out.has(d.key)) continue;
        out.set(d.key, { ...d, is_required: ca.is_required, variant_axis: ca.is_variant_axis, inherited: depth > 0, sort_order: ca.sort_order + depth * 1000 });
      }
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
      depth++;
    }
    return Array.from(out.values());
  });
  return mergeApplicable(sets);
}

/** All combinations of the chosen values per axis (variant matrix generator). */
export function variantCombinations(axes: { key: string; values: string[] }[]): Record<string, string>[] {
  const used = axes.filter((a) => a.values.length);
  if (!used.length) return [];
  return used.reduce<Record<string, string>[]>(
    (acc, axis) => acc.flatMap((combo) => axis.values.map((v) => ({ ...combo, [axis.key]: v }))),
    [{}],
  );
}

/** Stable key for an option combination (order of keys doesn't matter). */
export const comboKey = (o: Record<string, string>) =>
  Object.keys(o).sort().map((k) => `${k}=${o[k]}`).join("|");
