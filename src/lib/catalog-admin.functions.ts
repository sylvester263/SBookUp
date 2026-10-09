// Admin server functions for the catalog: categories tree, attributes, product
// categories and variant matrix. Staff only. (Bulk import / export: src/lib/import/.)
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaff, logActivity, attributeErrorMessage } from "@/lib/admin-helpers";
import { validateVariantOptions, withNewOptions, type AttributeDefinition } from "@/lib/attributes";
import { effectiveAttributesFor, comboKey, type CatalogContext } from "@/lib/catalog-import";

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

