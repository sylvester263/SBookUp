// Server-side helpers for the bulk importer (used inside import.functions.ts
// handlers only): catalog context, existing-row lookups, DB error wording.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/integrations/supabase/types";
import type { AttributeDefinition } from "@/lib/attributes";
import type { CategoryAttributeRow } from "@/lib/catalog-import";
import { normaliseIsbn, parseCode, shortHash, slugify } from "./coerce";
import type {
  ExistingProduct,
  ExistingVariant,
  ImportCategory,
  ImportContext,
  Issue,
  MappedRow,
} from "./types";

export type Db = SupabaseClient<Database>;

export async function loadImportContext(db: Db): Promise<ImportContext> {
  const [cats, defs, cas] = await Promise.all([
    db
      .from("categories")
      .select(
        "id, slug, name, parent_id, is_active, default_sell_unit, default_pack_size, default_unit_label",
      )
      .order("display_order")
      .order("name"),
    db.from("attribute_definitions").select("*").order("sort_order").order("label"),
    db
      .from("category_attributes")
      .select("category_id, attribute_id, is_required, is_variant_axis, sort_order"),
  ]);
  for (const r of [cats, defs, cas]) if (r.error) throw new Error(r.error.message);
  return {
    categories: (cats.data ?? []) as ImportCategory[],
    definitions: (defs.data ?? []).map((d) => ({
      ...d,
      options: (d.options ?? []) as AttributeDefinition["options"],
    })) as AttributeDefinition[],
    categoryAttributes: (cas.data ?? []) as CategoryAttributeRow[],
  };
}

/** SKUs / ISBNs / slugs (and the auto slugs a row may get) that the rows may match. */
export function productLookupKeys(
  rows: MappedRow[],
  extra: { skus?: string[]; slugs?: string[] } = {},
) {
  const skus = new Set(extra.skus ?? []);
  const isbns = new Set<string>();
  const slugs = new Set(extra.slugs ?? []);
  for (const r of rows) {
    const v = r.values;
    for (const f of ["sku", "product_sku"]) {
      const c = v[f] ? parseCode(v[f]!, f) : undefined;
      if (c?.value) skus.add(c.value);
    }
    if (v.isbn) isbns.add(normaliseIsbn(v.isbn));
    if (v.product_slug) slugs.add(v.product_slug.trim());
    const hashed = v.name && !slugify(v.name) ? `item-${shortHash(v.name)}` : null;
    for (const s of [v.slug, v.name, v.sku, hashed]) {
      const base = s ? slugify(s) : "";
      if (!base) continue;
      slugs.add(base);
      for (let n = 2; n <= 6; n++) slugs.add(`${base}-${n}`);
    }
  }
  return { skus: [...skus], isbns: [...isbns].filter(Boolean), slugs: [...slugs] };
}

export async function lookupProducts(
  db: Db,
  keys: { skus: string[]; isbns: string[]; slugs: string[] },
): Promise<ExistingProduct[]> {
  if (!keys.skus.length && !keys.isbns.length && !keys.slugs.length) return [];
  const { data, error } = await db.rpc("import_lookup_products", { p: keys as unknown as Json });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExistingProduct[];
}

export async function lookupVariants(
  db: Db,
  keys: { product_ids: string[]; skus: string[] },
): Promise<ExistingVariant[]> {
  if (!keys.product_ids.length && !keys.skus.length) return [];
  const { data, error } = await db.rpc("import_lookup_variants", { p: keys as unknown as Json });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as ExistingVariant[];
}

type DbRowError = { row: number; code?: string; constraint?: string | null; message: string };

const FRIENDLY: Record<string, string> = {
  products_sku_key: "This SKU is already used by another product",
  products_slug_key: "This slug (web address) is already used by another product",
  product_variants_sku_key: "This variant SKU is already used by another variant",
  product_variants_unique_options: "This product already has a variant with these options",
  products_sell_unit_check: "Pack products need a pack size of 2 or more",
  products_price_check: "Price can't be negative",
  products_sale_price_check: "Sale price can't be negative",
  product_variants_option_values_object: "Variant options are invalid",
};

export function friendlyDbMessage(e: DbRowError): string {
  if (e.constraint && FRIENDLY[e.constraint]) return FRIENDLY[e.constraint];
  if (e.code === "23505") return "A value that must be unique is already used by another product";
  if (e.code === "23514") return `A value is not allowed (${e.constraint ?? "check"})`;
  if (e.code === "22P02" || e.code === "22003" || e.code === "22007" || e.code === "22008")
    return "A value has the wrong format";
  if (e.code === "P0002") return "This product was deleted while the import was running";
  return e.message;
}

/** Per-row errors from an "import_batch_failed" RPC error (the whole batch was rolled back). */
export function parseBatchFailure(error: {
  message: string;
  details?: string | null;
}): DbRowError[] | null {
  if (!error.message.includes("import_batch_failed")) return null;
  try {
    const list = JSON.parse(error.details ?? "[]") as DbRowError[];
    return Array.isArray(list) ? list : null;
  } catch {
    return null;
  }
}

export function dbIssue(e: DbRowError, column = "row"): Issue {
  return { row: e.row, column, value: null, message: friendlyDbMessage(e), level: "error" };
}
