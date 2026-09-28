// Pure CSV-import logic for products and variants (unit-tested in catalog-import.test.ts).
// The server function loads categories/attributes once, then validates every row here.
import {
  mergeApplicable, validateProductAttributes, validateVariantOptions,
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

export type ProductRowResult = {
  row: number;
  slug: string;
  errors: string[];
  record?: Record<string, unknown>;
  categoryIds?: string[];
  newOptions?: Record<string, string[]>;
};

const str = (v: unknown) => (v == null ? "" : String(v)).trim();
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
function num(v: string, field: string, errors: string[], opts: { int?: boolean; min?: number } = {}) {
  if (v === "") return null;
  const n = Number(v.replace(/,/g, ""));
  if (!Number.isFinite(n) || (opts.int && !Number.isInteger(n)) || (opts.min != null && n < opts.min)) {
    errors.push(`${field} must be a ${opts.int ? "whole " : ""}number${opts.min != null ? ` ≥ ${opts.min}` : ""}`);
    return null;
  }
  return n;
}
function bool(v: string, fallback: boolean) {
  if (v === "") return fallback;
  return ["true", "yes", "1", "y"].includes(v.toLowerCase());
}
const list = (v: string) => v.split(/[|,]/).map((x) => x.trim()).filter(Boolean);

/**
 * Validates one product CSV row. Columns: name, slug, categories ("a|b", primary first),
 * price, sale_price, cost_price, stock_quantity, low_stock_threshold, weight_grams, sku,
 * isbn, brand, edition, description, tags, images / image_url_1..3, is_active,
 * is_featured, sell_unit, pack_size, unit_label, is_new_arrival, new_arrival_until,
 * attr_<key> (multiselect values separated by "|"). Legacy author / publisher columns
 * are read as attr_author / attr_publisher.
 */
export function validateProductRow(raw: Record<string, unknown>, rowNumber: number, ctx: CatalogContext): ProductRowResult {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) r[k.trim().toLowerCase()] = str(v);
  const errors: string[] = [];
  const name = r.name;
  const slug = r.slug ? slugify(r.slug) : slugify(name ?? "");
  if (!name) errors.push("name is required");
  if (!slug) errors.push("slug is required");

  // categories
  const bySlug = new Map(ctx.categories.map((c) => [c.slug, c]));
  const catSlugs = list(r.categories || r.category_slug || "");
  const cats: CategoryInfo[] = [];
  for (const s of catSlugs) {
    const c = bySlug.get(s);
    if (!c) errors.push(`unknown category "${s}"`);
    else if (!cats.includes(c)) cats.push(c);
  }
  if (!catSlugs.length) errors.push("categories is required (slugs separated by |, primary first)");
  const primary = cats[0];

  const price = num(r.price ?? "", "price", errors, { min: 0 });
  if (price == null && !errors.some((e) => e.startsWith("price"))) errors.push("price is required");
  const record: Record<string, unknown> = {
    name, slug,
    description: r.description || null,
    sku: r.sku || null,
    isbn: r.isbn || null,
    brand: r.brand || null,
    edition: r.edition || null,
    price,
    sale_price: num(r.sale_price ?? "", "sale_price", errors, { min: 0 }),
    cost_price: num(r.cost_price ?? "", "cost_price", errors, { min: 0 }),
    stock_quantity: num(r.stock_quantity ?? "", "stock_quantity", errors, { int: true, min: 0 }) ?? 0,
    low_stock_threshold: num(r.low_stock_threshold ?? "", "low_stock_threshold", errors, { int: true, min: 0 }) ?? 5,
    weight_grams: num(r.weight_grams ?? "", "weight_grams", errors, { int: true, min: 0 }),
    is_active: bool(r.is_active ?? "", true),
    is_featured: bool(r.is_featured ?? "", false),
    is_new_arrival: bool(r.is_new_arrival ?? "", false),
    new_arrival_until: r.new_arrival_until || null,
    tags: r.tags ? list(r.tags) : [],
    images: (r.images ? list(r.images) : [r.image_url_1, r.image_url_2, r.image_url_3].filter(Boolean)) as string[],
    category_id: primary?.id ?? null,
  };
  if (record.new_arrival_until && !/^\d{4}-\d{2}-\d{2}$/.test(String(record.new_arrival_until))) errors.push("new_arrival_until must be YYYY-MM-DD");
  if (record.sale_price != null && price != null && (record.sale_price as number) >= price) errors.push("sale_price must be less than price");
  if (record.isbn && !/^[\dXx-]{10,17}$/.test(String(record.isbn))) errors.push("isbn format is invalid");
  if ((record.images as string[]).some((u) => !/^https?:\/\//i.test(u))) errors.push("image URLs must start with http(s)://");

  // pack pricing (defaults from the primary category)
  const sellUnit = (r.sell_unit || primary?.default_sell_unit || "item").toLowerCase();
  if (sellUnit !== "item" && sellUnit !== "pack") errors.push('sell_unit must be "item" or "pack"');
  const packSize = num(r.pack_size ?? "", "pack_size", errors, { int: true, min: 2 }) ?? (sellUnit === "pack" ? primary?.default_pack_size ?? null : null);
  if (sellUnit === "pack" && !packSize) errors.push("pack_size is required when sell_unit is pack");
  record.sell_unit = sellUnit;
  record.pack_size = sellUnit === "pack" ? packSize : null;
  record.unit_label = sellUnit === "pack" ? r.unit_label || primary?.default_unit_label || null : null;

  // attributes
  const attrInput: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (k.startsWith("attr_") && v !== "") attrInput[k.slice(5)] = v;
  if (r.author && attrInput.author === undefined) attrInput.author = r.author;
  if (r.publisher && attrInput.publisher === undefined) attrInput.publisher = r.publisher;
  let newOptions: Record<string, string[]> = {};
  if (cats.length) {
    const applicable = effectiveAttributesFor(cats.map((c) => c.id), ctx);
    for (const a of applicable) {
      if (a.type === "multiselect" && typeof attrInput[a.key] === "string") attrInput[a.key] = String(attrInput[a.key]).split("|").map((x) => x.trim()).filter(Boolean);
    }
    const res = validateProductAttributes(attrInput, applicable);
    for (const [k, m] of Object.entries(res.errors)) errors.push(`attr_${k}: ${m}`);
    record.attributes = res.values;
    newOptions = res.newOptions;
  }
  return { row: rowNumber, slug, errors, record, categoryIds: cats.map((c) => c.id), newOptions };
}

export type VariantRowResult = {
  row: number;
  productKey: string;
  errors: string[];
  record?: { sku: string | null; price: number | null; stock: number; is_active: boolean; image_url: string | null; option_values: Record<string, string>; name: string };
  newOptions?: Record<string, string[]>;
};

/**
 * Validates one variant CSV row. Columns: product_sku (or product_slug), variant_sku,
 * price (blank = product price), stock, is_active, image_url, name (optional),
 * option_<axis> for every variant axis (e.g. option_clothing_size, option_colour).
 */
export function validateVariantRow(
  raw: Record<string, unknown>, rowNumber: number,
  product: { id: string; categoryIds: string[] } | null, ctx: CatalogContext,
): VariantRowResult {
  const r: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw)) r[k.trim().toLowerCase()] = str(v);
  const errors: string[] = [];
  const productKey = r.product_sku || r.product_slug || "";
  if (!productKey) errors.push("product_sku (or product_slug) is required");
  else if (!product) errors.push(`product "${productKey}" not found`);
  const opts: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r)) if (k.startsWith("option_") && v !== "") opts[k.slice(7)] = v;
  let values: Record<string, string> = {};
  let newOptions: Record<string, string[]> = {};
  if (product) {
    const applicable = effectiveAttributesFor(product.categoryIds, ctx);
    if (!applicable.some((a) => a.variant_axis)) errors.push("this product's categories have no variant options (size/colour)");
    const res = validateVariantOptions(opts, applicable);
    for (const [k, m] of Object.entries(res.errors)) errors.push(`option_${k}: ${m}`);
    values = res.values as Record<string, string>;
    newOptions = res.newOptions;
  }
  const price = num(r.price ?? "", "price", errors, { min: 0 });
  const stock = num(r.stock ?? "", "stock", errors, { int: true, min: 0 }) ?? 0;
  if (r.image_url && !/^https?:\/\//i.test(r.image_url)) errors.push("image_url must start with http(s)://");
  return {
    row: rowNumber, productKey, errors, newOptions,
    record: {
      sku: r.variant_sku || null, price, stock, is_active: bool(r.is_active ?? "", true),
      image_url: r.image_url || null, option_values: values, name: r.name || Object.values(values).join(" / "),
    },
  };
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
