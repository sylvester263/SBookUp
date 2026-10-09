// Export rows in exactly the import format (same headers), so a downloaded
// export can be edited and uploaded again with zero errors. Pure (tested).
import { ATTRIBUTE_PREFIX, OPTION_PREFIX, PRODUCT_COLUMNS, VARIANT_COLUMNS } from "./columns";
import type { ImportContext, StoredAttributes } from "./types";

/** Excel's hard limit for one cell. Longer text is left blank (= keep the current value). */
export const EXCEL_CELL_LIMIT = 32_767;

export type ExportProduct = {
  name: string;
  slug: string;
  sku: string | null;
  isbn: string | null;
  brand: string | null;
  edition: string | null;
  description: string | null;
  price: number;
  sale_price: number | null;
  cost_price: number | null;
  stock_quantity: number;
  low_stock_threshold: number;
  weight_grams: number | null;
  sell_unit: string;
  pack_size: number | null;
  unit_label: string | null;
  is_active: boolean;
  is_featured: boolean;
  is_new_arrival: boolean;
  new_arrival_until: string | null;
  tags: string[] | null;
  images: string[] | null;
  attributes: StoredAttributes | null;
  category_ids: string[];
};
export type ExportVariant = {
  product_sku: string | null;
  product_slug: string;
  sku: string | null;
  name: string;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
  is_active: boolean;
  image_url: string | null;
  option_values: Record<string, string> | null;
};

export type Cell = string | number | null;
export type ExportSheet = {
  headers: string[];
  rows: Cell[][];
  tooLong: { row: number; column: string }[];
};

const yesNo = (b: boolean | null | undefined) => (b ? "yes" : "no");
const active = (ctx: ImportContext) => ctx.definitions.filter((d) => d.is_active !== false);

/** Attributes used as PRODUCT attributes by at least one category (e.g. gift-bag colour), plus any stored key. */
export function productAttributeKeys(
  ctx: ImportContext,
  products: { attributes: Record<string, unknown> | null }[] = [],
): string[] {
  const used = new Set(
    ctx.categoryAttributes.filter((ca) => !ca.is_variant_axis).map((ca) => ca.attribute_id),
  );
  const stored = new Set(products.flatMap((p) => Object.keys(p.attributes ?? {})));
  return active(ctx)
    .filter((d) => used.has(d.id) || stored.has(d.key))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.key.localeCompare(b.key))
    .map((d) => d.key);
}

/** Attributes used as a variant axis by at least one category (e.g. costume size / colour). */
export function variantOptionKeys(ctx: ImportContext): string[] {
  const used = new Set(
    ctx.categoryAttributes.filter((ca) => ca.is_variant_axis).map((ca) => ca.attribute_id),
  );
  return active(ctx)
    .filter((d) => used.has(d.id))
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
    .map((d) => d.key);
}

export function productHeaders(attrKeys: string[]): string[] {
  return [...PRODUCT_COLUMNS.map((c) => c.key), ...attrKeys.map((k) => ATTRIBUTE_PREFIX + k)];
}
export function variantHeaders(optionKeys: string[]): string[] {
  return [...VARIANT_COLUMNS.map((c) => c.key), ...optionKeys.map((k) => OPTION_PREFIX + k)];
}

export function exportProductRows(ctx: ImportContext, products: ExportProduct[]): ExportSheet {
  const slugOf = new Map(ctx.categories.map((c) => [c.id, c.slug]));
  const attrKeys = productAttributeKeys(ctx, products);
  const headers = productHeaders(attrKeys);
  const tooLong: ExportSheet["tooLong"] = [];
  const rows = products.map((p, i) => {
    const attrs = p.attributes ?? {};
    let description: Cell = p.description;
    if (description && description.length > EXCEL_CELL_LIMIT) {
      tooLong.push({ row: i + 2, column: "description" });
      description = null;
    }
    const byKey: Record<string, Cell> = {
      sku: p.sku,
      name: p.name,
      slug: p.slug,
      categories:
        p.category_ids
          .map((id) => slugOf.get(id))
          .filter(Boolean)
          .join("|") || null,
      price: Number(p.price),
      sale_price: p.sale_price == null ? null : Number(p.sale_price),
      compare_at_price: null,
      cost_price: p.cost_price == null ? null : Number(p.cost_price),
      stock_quantity: p.stock_quantity,
      low_stock_threshold: p.low_stock_threshold,
      isbn: p.isbn,
      brand: p.brand,
      edition: p.edition,
      description,
      weight_grams: p.weight_grams,
      sell_unit: p.sell_unit,
      pack_size: p.sell_unit === "pack" ? p.pack_size : null,
      unit_label: p.sell_unit === "pack" ? p.unit_label : null,
      is_active: yesNo(p.is_active),
      is_featured: yesNo(p.is_featured),
      is_new_arrival: yesNo(p.is_new_arrival),
      new_arrival_until: p.new_arrival_until ? String(p.new_arrival_until).slice(0, 10) : null,
      tags: (p.tags ?? []).join("|") || null,
      images: (p.images ?? []).join("|") || null,
    };
    for (const k of attrKeys) {
      const v = attrs[k];
      byKey[ATTRIBUTE_PREFIX + k] = Array.isArray(v)
        ? v.join("|") || null
        : v == null || v === ""
          ? null
          : typeof v === "number"
            ? v
            : String(v);
    }
    return headers.map((h) => byKey[h] ?? null);
  });
  return { headers, rows, tooLong };
}

export function exportVariantRows(ctx: ImportContext, variants: ExportVariant[]): ExportSheet {
  const optionKeys = variantOptionKeys(ctx);
  for (const v of variants)
    for (const k of Object.keys(v.option_values ?? {}))
      if (!optionKeys.includes(k)) optionKeys.push(k);
  const headers = variantHeaders(optionKeys);
  const rows = variants.map((v) => {
    const byKey: Record<string, Cell> = {
      product_sku: v.product_sku,
      product_slug: v.product_slug,
      variant_sku: v.sku,
      name: v.name,
      price: v.price == null ? null : Number(v.price),
      compare_at_price: v.compare_at_price == null ? null : Number(v.compare_at_price),
      stock: v.stock,
      is_active: yesNo(v.is_active),
      image_url: v.image_url,
    };
    for (const k of optionKeys) byKey[OPTION_PREFIX + k] = v.option_values?.[k] ?? null;
    return headers.map((h) => byKey[h] ?? null);
  });
  return { headers, rows, tooLong: [] };
}
