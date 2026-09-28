// Admin server functions for the catalog: categories tree, attributes, product
// categories, variant matrix and CSV import / export. Staff only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaff, logActivity, attributeErrorMessage } from "@/lib/admin-helpers";
import { validateVariantOptions, withNewOptions, type AttributeDefinition } from "@/lib/attributes";
import {
  effectiveAttributesFor, validateProductRow, validateVariantRow, comboKey,
  type CatalogContext, type ProductRowResult, type VariantRowResult,
} from "@/lib/catalog-import";

const uuid = z.string().uuid();

async function loadCatalogContext(db: any): Promise<CatalogContext & { categoriesFull: any[] }> {
  const [cats, defs, cas] = await Promise.all([
    db.from("categories").select("*, product_categories(count)").order("display_order").order("name"),
    db.from("attribute_definitions").select("*").order("sort_order").order("label"),
    db.from("category_attributes").select("*"),
  ]);
  for (const r of [cats, defs, cas]) if (r.error) throw new Error(r.error.message);
  const categoriesFull = (cats.data ?? []).map((c: any) => ({ ...c, product_count: c.product_categories?.[0]?.count ?? 0, product_categories: undefined }));
  return {
    categoriesFull,
    categories: categoriesFull,
    definitions: (defs.data ?? []).map((d: any) => ({ ...d, options: d.options ?? [] })) as AttributeDefinition[],
    categoryAttributes: cas.data ?? [],
  };
}

async function addNewOptions(db: any, defs: AttributeDefinition[], newOptions: Record<string, string[]>) {
  for (const [key, vals] of Object.entries(newOptions)) {
    const def = defs.find((d) => d.key === key);
    if (!def) continue;
    const next = withNewOptions(def, vals);
    if (next.length === def.options.length) continue;
    const { error } = await db.from("attribute_definitions").update({ options: next }).eq("id", def.id);
    if (error) throw new Error(error.message);
    def.options = next; // keep the in-memory copy current for the next rows
  }
}

// ---------------------------------------------------------------- context
/** Everything the admin catalog screens need: categories (+ product counts), attributes, assignments. */
export const adminCatalogContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const c = await loadCatalogContext(context.supabase);
    return { categories: c.categoriesFull, definitions: c.definitions, categoryAttributes: c.categoryAttributes };
  });

// ---------------------------------------------------------------- categories
const categorySchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  parent_id: uuid.nullable().optional(),
  description: z.string().trim().max(2000).optional().or(z.literal("")).nullable(),
  image_url: z.string().url().optional().or(z.literal("")).nullable(),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  show_in_nav: z.boolean().default(false),
  show_on_home: z.boolean().default(false),
  seo_title: z.string().trim().max(120).optional().or(z.literal("")).nullable(),
  seo_description: z.string().trim().max(300).optional().or(z.literal("")).nullable(),
  default_sell_unit: z.enum(["item", "pack"]).default("item"),
  default_pack_size: z.number().int().min(2).max(1000).nullable().optional(),
  default_unit_label: z.string().trim().max(30).optional().or(z.literal("")).nullable(),
}).superRefine((d, ctx) => {
  if (d.default_sell_unit === "pack" && !d.default_pack_size) ctx.addIssue({ code: "custom", path: ["default_pack_size"], message: "Default pack size is required for pack categories" });
});

export const adminSaveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => categorySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const row: any = {
      ...data,
      parent_id: data.parent_id || null,
      description: data.description || null,
      image_url: data.image_url || null,
      seo_title: data.seo_title || null,
      seo_description: data.seo_description || null,
      default_pack_size: data.default_sell_unit === "pack" ? data.default_pack_size : null,
      default_unit_label: data.default_sell_unit === "pack" ? data.default_unit_label || null : null,
    };
    if (data.id && row.parent_id) {
      // A category can't be moved under itself or one of its own sub-categories.
      const { data: desc } = await supabase.rpc("category_descendants", { p_category_id: data.id });
      if (((desc ?? []) as unknown as string[]).includes(row.parent_id)) throw new Error("A category can't be moved under itself or one of its sub-categories");
    }
    let id = data.id;
    if (id) {
      const { error } = await supabase.from("categories").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      delete row.id;
      const { data: ins, error } = await supabase.from("categories").insert(row).select("id").single();
      if (error) throw new Error(error.message.includes("categories_slug_key") ? "That slug is already used by another category" : error.message);
      id = ins.id as string;
    }
    await logActivity(supabase, userId, data.id ? "update" : "create", "category", id!, row);
    return { id: id! };
  });

/** Sets the order of sibling categories (ids in the new order). */
export const adminReorderCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(uuid).min(1).max(200) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    for (let i = 0; i < data.ids.length; i++) {
      const { error } = await supabase.from("categories").update({ display_order: (i + 1) * 10 }).eq("id", data.ids[i]);
      if (error) throw new Error(error.message);
    }
    await logActivity(supabase, userId, "reorder", "category", null, { ids: data.ids });
    return { ok: true };
  });

/** Replaces a category's OWN attribute assignments (inherited ones are managed on the parent). */
export const adminSetCategoryAttributes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      category_id: uuid,
      items: z.array(z.object({ attribute_id: uuid, is_required: z.boolean(), is_variant_axis: z.boolean() })).max(50),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const ids = data.items.map((i) => i.attribute_id);
    let del = supabase.from("category_attributes").delete().eq("category_id", data.category_id);
    if (ids.length) del = del.not("attribute_id", "in", `(${ids.join(",")})`);
    const { error: dErr } = await del;
    if (dErr) throw new Error(dErr.message);
    if (data.items.length) {
      const { error } = await supabase.from("category_attributes").upsert(
        data.items.map((it, i) => ({ category_id: data.category_id, attribute_id: it.attribute_id, is_required: it.is_required, is_variant_axis: it.is_variant_axis, sort_order: (i + 1) * 10 })),
        { onConflict: "category_id,attribute_id" },
      );
      if (error) throw new Error(error.message);
    }
    await logActivity(supabase, userId, "update_attributes", "category", data.category_id, { items: data.items });
    return { ok: true };
  });

// ---------------------------------------------------------------- attributes
const optionSchema = z.object({
  value: z.string().trim().min(1).max(200),
  label: z.string().trim().min(1).max(200),
  sort: z.number().int().optional(),
  is_active: z.boolean().optional(),
});
const attributeSchema = z.object({
  id: uuid.optional(),
  key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "Key: lowercase letters, numbers and _ (start with a letter)"),
  label: z.string().trim().min(1).max(80),
  type: z.enum(["select", "multiselect", "number", "text"]),
  unit: z.string().trim().max(20).optional().or(z.literal("")).nullable(),
  help_text: z.string().trim().max(200).optional().or(z.literal("")).nullable(),
  options: z.array(optionSchema).max(500).default([]),
  allow_new_options: z.boolean().default(false),
  is_filterable: z.boolean().default(true),
  is_variant_axis: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  /** Required to remove options that products / variants still use. */
  confirmRemoveUsed: z.boolean().optional(),
});

async function optionUsage(db: any, key: string) {
  const { data, error } = await db.rpc("attribute_option_usage", { p_key: key });
  if (error) throw new Error(error.message);
  return (data ?? []) as { value: string; products: number; variants: number }[];
}

export const adminAttributeUsage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ key: z.string().max(40) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    return optionUsage(context.supabase, data.key);
  });

export const adminSaveAttribute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => attributeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { confirmRemoveUsed, id, ...fields } = data;
    const values = fields.options.map((o) => o.value);
    if (new Set(values).size !== values.length) throw new Error("Option values must be unique");
    const options = fields.options.map((o, i) => ({ ...o, sort: i + 1 }));
    if (id) {
      const { data: cur, error } = await supabase.from("attribute_definitions").select("*").eq("id", id).single();
      if (error) throw new Error(error.message);
      if (cur.key !== fields.key) throw new Error("An attribute's key can't be changed after it is created");
      const usage = await optionUsage(supabase, cur.key);
      const used = usage.filter((u) => u.products + u.variants > 0);
      if (cur.type !== fields.type && used.length) throw new Error("The type can't be changed while products use this attribute");
      if (fields.type === "select" || fields.type === "multiselect") {
        const removedUsed = used.filter((u) => !values.includes(u.value));
        if (removedUsed.length && !confirmRemoveUsed) {
          const list = removedUsed.map((u) => `"${u.value}" (${u.products} products${u.variants ? `, ${u.variants} variants` : ""})`).join(", ");
          throw new Error(`REMOVE_USED: These options are still used: ${list}. Deactivate them instead, or confirm removal.`);
        }
      }
      const { error: uErr } = await supabase.from("attribute_definitions").update({ ...fields, options, unit: fields.unit || null, help_text: fields.help_text || null }).eq("id", id);
      if (uErr) throw new Error(uErr.message);
      await logActivity(supabase, userId, "update", "attribute", id, { key: fields.key });
      return { id };
    }
    const { data: ins, error } = await supabase
      .from("attribute_definitions")
      .insert({ ...fields, options, unit: fields.unit || null, help_text: fields.help_text || null })
      .select("id").single();
    if (error) throw new Error(error.message.includes("attribute_definitions_key_key") ? "That key is already used" : error.message);
    await logActivity(supabase, userId, "create", "attribute", ins.id, { key: fields.key });
    return { id: ins.id as string };
  });

// ---------------------------------------------------------------- product categories
export const adminGetProductCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: uuid }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: links, error } = await context.supabase
      .from("product_categories").select("category_id, is_primary").eq("product_id", data.productId).order("is_primary", { ascending: false });
    if (error) throw new Error(error.message);
    return {
      category_ids: (links ?? []).map((l) => l.category_id),
      primary_category_id: (links ?? []).find((l) => l.is_primary)?.category_id ?? null,
    };
  });

// ---------------------------------------------------------------- variant matrix
const variantRowSchema = z.object({
  id: uuid.optional(),
  name: z.string().trim().max(80).optional().or(z.literal("")),
  sku: z.string().trim().max(80).optional().or(z.literal("")).nullable(),
  price: z.number().min(0).nullable(),
  // Display-only "was" price. Left out (undefined) unless set or being cleared,
  // so saving still works on a database without the column yet.
  compare_at_price: z.number().min(0).nullable().optional(),
  stock: z.number().int().min(0),
  image_url: z.string().url().max(500).optional().or(z.literal("")).nullable(),
  is_active: z.boolean().default(true),
  option_values: z.record(z.string()),
});

/** Saves many variants at once (the matrix editor). Each row's options are validated. */
export const adminSaveVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ product_id: uuid, rows: z.array(variantRowSchema).min(1).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const ctx = await loadCatalogContext(supabase);
    const { data: links } = await supabase.from("product_categories").select("category_id").eq("product_id", data.product_id);
    const applicable = effectiveAttributesFor((links ?? []).map((l) => l.category_id), ctx);
    const seen = new Set<string>();
    const prepared = data.rows.map((r, i) => {
      const res = validateVariantOptions(r.option_values, applicable);
      if (Object.keys(res.errors).length) throw new Error(`Row ${i + 1}: ${attributeErrorMessage(res.errors)}`);
      const key = comboKey(res.values as Record<string, string>);
      if (seen.has(key)) throw new Error(`Row ${i + 1}: this option combination appears twice`);
      seen.add(key);
      return { r, values: res.values as Record<string, string>, newOptions: res.newOptions };
    });
    for (const p of prepared) await addNewOptions(supabase, ctx.definitions, p.newOptions);
    for (const { r, values } of prepared) {
      const row = {
        product_id: data.product_id,
        name: r.name || Object.values(values).join(" / "),
        sku: r.sku || null,
        price: r.price,
        ...(r.compare_at_price !== undefined ? { compare_at_price: r.compare_at_price } : {}),
        stock: r.stock,
        image_url: r.image_url || null,
        is_active: r.is_active,
        option_values: values,
      };
      const q = r.id
        ? supabase.from("product_variants").update(row).eq("id", r.id).eq("product_id", data.product_id)
        : supabase.from("product_variants").insert(row);
      const { error } = await q;
      if (error) throw new Error(error.message.includes("duplicate") ? `${row.name}: SKU or option combination already exists` : error.message);
    }
    await logActivity(supabase, userId, "save_variants", "product", data.product_id, { count: data.rows.length });
    return { saved: data.rows.length };
  });

// ---------------------------------------------------------------- CSV import / export
const rowsInput = z.object({
  rows: z.array(z.record(z.unknown())).min(1).max(1000),
  dryRun: z.boolean().default(true),
});

/**
 * Product CSV import. Always validate with dryRun first: returns every row's
 * action (create / update) and errors. The real import runs only when NO row has
 * errors (nothing is half-imported). Upserts by slug.
 */
export const adminImportProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rowsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const ctx = await loadCatalogContext(supabase);
    const results: ProductRowResult[] = data.rows.map((raw, i) => validateProductRow(raw, i + 2, ctx));
    const slugs = results.map((r) => r.slug).filter(Boolean);
    const dup = slugs.filter((s, i) => slugs.indexOf(s) !== i);
    results.forEach((r) => { if (dup.includes(r.slug)) r.errors.push(`slug "${r.slug}" appears more than once in the file`); });
    const { data: existing } = await supabase.from("products").select("id, slug").in("slug", slugs.length ? slugs : ["-"]);
    const bySlug = new Map((existing ?? []).map((p) => [p.slug, p.id]));
    const preview = results.map((r) => ({ row: r.row, slug: r.slug, action: bySlug.has(r.slug) ? "update" : "create", errors: r.errors }));
    const errorCount = preview.filter((p) => p.errors.length).length;
    if (data.dryRun || errorCount) return { dryRun: true, imported: 0, errorCount, preview };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server"); // cost_price
    for (const r of results) await addNewOptions(supabase, ctx.definitions, r.newOptions ?? {});
    let imported = 0;
    for (const r of results) {
      const { data: saved, error } = await supabaseAdmin.from("products").upsert(r.record as any, { onConflict: "slug" }).select("id").single();
      if (error) throw new Error(`Row ${r.row} (${r.slug}): ${error.message}`);
      const pid = saved.id as string;
      const extra = (r.categoryIds ?? []).slice(1);
      if (extra.length) {
        const { error: e2 } = await supabaseAdmin.from("product_categories")
          .upsert(extra.map((category_id) => ({ product_id: pid, category_id, is_primary: false })), { onConflict: "product_id,category_id", ignoreDuplicates: true });
        if (e2) throw new Error(`Row ${r.row}: ${e2.message}`);
      }
      const keep = r.categoryIds ?? [];
      if (keep.length) await supabaseAdmin.from("product_categories").delete().eq("product_id", pid).not("category_id", "in", `(${keep.join(",")})`);
      imported++;
    }
    await logActivity(supabase, userId, "csv_import", "product", null, { count: imported });
    return { dryRun: false, imported, errorCount: 0, preview };
  });

/** Variant CSV import (product_sku / product_slug, variant_sku, price, stock, option_<axis>…). */
export const adminImportVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => rowsInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const ctx = await loadCatalogContext(supabase);
    const keys = Array.from(new Set(data.rows.map((r) => String(r.product_sku ?? r.product_slug ?? "").trim()).filter(Boolean)));
    const [bySku, bySlugRes] = await Promise.all([
      supabase.from("products").select("id, sku, slug").in("sku", keys.length ? keys : ["-"]),
      supabase.from("products").select("id, sku, slug").in("slug", keys.length ? keys : ["-"]),
    ]);
    const products = new Map<string, string>();
    for (const p of [...(bySku.data ?? []), ...(bySlugRes.data ?? [])]) {
      if (p.sku) products.set(p.sku, p.id);
      products.set(p.slug, p.id);
    }
    const pids = Array.from(new Set(products.values()));
    const [{ data: links }, { data: existingVariants }] = await Promise.all([
      supabase.from("product_categories").select("product_id, category_id").in("product_id", pids.length ? pids : ["00000000-0000-0000-0000-000000000000"]),
      supabase.from("product_variants").select("id, product_id, sku, option_values").in("product_id", pids.length ? pids : ["00000000-0000-0000-0000-000000000000"]),
    ]);
    const catsOf = (pid: string) => (links ?? []).filter((l) => l.product_id === pid).map((l) => l.category_id);
    const seen = new Set<string>();
    const results: (VariantRowResult & { productId?: string; existingId?: string })[] = data.rows.map((raw, i) => {
      const key = String(raw.product_sku ?? raw.product_slug ?? "").trim();
      const pid = products.get(key);
      const res = validateVariantRow(raw, i + 2, pid ? { id: pid, categoryIds: catsOf(pid) } : null, ctx);
      if (pid && res.record) {
        const ck = pid + "#" + comboKey(res.record.option_values);
        if (seen.has(ck)) res.errors.push("this product + option combination appears more than once in the file");
        seen.add(ck);
        const match = (existingVariants ?? []).find((v) => v.product_id === pid && ((res.record!.sku && v.sku === res.record!.sku) || comboKey((v.option_values ?? {}) as Record<string, string>) === comboKey(res.record!.option_values)));
        return { ...res, productId: pid, existingId: match?.id };
      }
      return res;
    });
    const preview = results.map((r) => ({ row: r.row, slug: r.productKey, action: r.existingId ? "update" : "create", errors: r.errors }));
    const errorCount = preview.filter((p) => p.errors.length).length;
    if (data.dryRun || errorCount) return { dryRun: true, imported: 0, errorCount, preview };
    for (const r of results) await addNewOptions(supabase, ctx.definitions, r.newOptions ?? {});
    let imported = 0;
    for (const r of results) {
      const row = { ...r.record!, product_id: r.productId! };
      const q = r.existingId ? supabase.from("product_variants").update(row).eq("id", r.existingId) : supabase.from("product_variants").insert(row);
      const { error } = await q;
      if (error) throw new Error(`Row ${r.row}: ${error.message}`);
      imported++;
    }
    await logActivity(supabase, userId, "csv_import", "product_variant", null, { count: imported });
    return { dryRun: false, imported, errorCount: 0, preview };
  });

/** Product export in the import format (categories, attr_<key>, sell_unit, pack_size…). */
export const adminExportCatalogProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ctx = await loadCatalogContext(supabaseAdmin);
    const slugOf = new Map(ctx.categories.map((c) => [c.id, c.slug]));
    const products: any[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("products").select("*, product_categories(category_id, is_primary)").order("name").range(from, from + 999);
      if (error) throw new Error(error.message);
      products.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const attrKeys = ctx.definitions.filter((d) => !d.is_variant_axis).map((d) => d.key);
    const headers = [
      "name", "slug", "categories", "sku", "isbn", "brand", "edition", "description", "price", "sale_price", "cost_price",
      "stock_quantity", "low_stock_threshold", "weight_grams", "sell_unit", "pack_size", "unit_label", "is_active", "is_featured",
      "is_new_arrival", "new_arrival_until", "tags", "images", ...attrKeys.map((k) => `attr_${k}`),
    ];
    const rows = products.map((p) => {
      const cats = [...(p.product_categories ?? [])].sort((a: any, b: any) => Number(b.is_primary) - Number(a.is_primary)).map((l: any) => slugOf.get(l.category_id)).filter(Boolean);
      const attrs = (p.attributes ?? {}) as Record<string, unknown>;
      return [
        p.name, p.slug, cats.join("|"), p.sku, p.isbn, p.brand, p.edition, p.description, p.price, p.sale_price, p.cost_price,
        p.stock_quantity, p.low_stock_threshold, p.weight_grams, p.sell_unit, p.pack_size, p.unit_label, p.is_active, p.is_featured,
        p.is_new_arrival, p.new_arrival_until, (p.tags ?? []).join("|"), (p.images ?? []).join("|"),
        ...attrKeys.map((k) => (Array.isArray(attrs[k]) ? (attrs[k] as string[]).join("|") : attrs[k] ?? "")),
      ];
    });
    return { headers, rows };
  });

export const adminExportVariants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertStaff(context.supabase, context.userId);
    const { data: defs } = await context.supabase.from("attribute_definitions").select("key").eq("is_variant_axis", true).order("sort_order");
    const axes = (defs ?? []).map((d) => d.key);
    const out: any[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await context.supabase
        .from("product_variants").select("sku, name, price, stock, is_active, image_url, option_values, product:products(sku, slug)").order("product_id").range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    const headers = ["product_sku", "product_slug", "variant_sku", "name", "price", "stock", "is_active", "image_url", ...axes.map((a) => `option_${a}`)];
    const rows = out.map((v: any) => [
      v.product?.sku ?? "", v.product?.slug ?? "", v.sku ?? "", v.name, v.price ?? "", v.stock, v.is_active, v.image_url ?? "",
      ...axes.map((a) => (v.option_values ?? {})[a] ?? ""),
    ]);
    return { headers, rows };
  });
