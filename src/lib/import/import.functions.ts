// Server functions for the bulk importer. Staff only. Every batch is validated
// again here (the browser preview is never trusted) and written through the
// transactional RPCs public.import_products_batch / import_variants_batch with
// the caller's own session — no service-role key on the write path. The export
// reads cost_price with the service-role client AFTER the staff check, like the
// rest of the admin product screens.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, assertStaff, logActivity } from "@/lib/admin-helpers";
import { slugify } from "./coerce";
import { findCategory } from "./categories";
import type { ExportProduct, ExportVariant } from "./export-rows";
import { storagePublicPrefix } from "./image-links";
import { writeProductsBatch, writeVariantsBatch, type BatchOutput } from "./batch-write";
import {
  loadImportContext,
  lookupProducts,
  lookupVariants,
  productLookupKeys,
} from "./server-helpers";
import type { MappedRow, StoredAttributes } from "./types";

export const IMPORT_BATCH_SIZE = 100;

const fieldId = z
  .string()
  .regex(/^(?:[a-z_]{1,40}|attr:[a-z][a-z0-9_]{0,39}|option:[a-z][a-z0-9_]{0,39}|image:[1-9])$/);
const mappedRow = z.object({
  rowNumber: z.number().int().min(1).max(10_000_000),
  values: z
    .record(fieldId, z.string().max(200_000).nullable())
    .refine((v) => Object.keys(v).length <= 200, "Too many columns"),
});
const batchInput = z.object({
  fileName: z.string().trim().max(255),
  matchBy: z.enum(["auto", "sku", "isbn", "slug"]).default("auto"),
  headerOf: z.record(fieldId, z.string().max(300)),
  rows: z.array(mappedRow).min(1).max(IMPORT_BATCH_SIZE),
});

export type { BatchRowResult, RowOutcome } from "./batch-write";

/** Categories, attributes and the caller's role for the import dialog. */
export const importContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const roles = await assertStaff(context.supabase, context.userId);
    const ctx = await loadImportContext(context.supabase);
    return {
      ...ctx,
      isAdmin: roles.includes("admin"),
      storagePrefix: storagePublicPrefix(process.env.SUPABASE_URL ?? ""),
    };
  });

/** Existing products / variants the file's rows may match (for the browser preview). */
export const importLookup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        skus: z.array(z.string().max(300)).max(20_000),
        isbns: z.array(z.string().max(60)).max(20_000),
        slugs: z.array(z.string().max(300)).max(60_000),
        variantSkus: z.array(z.string().max(300)).max(20_000).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const products = await lookupProducts(context.supabase, {
      skus: data.skus,
      isbns: data.isbns,
      slugs: data.slugs,
    });
    const variants = await lookupVariants(context.supabase, {
      product_ids: products.map((p) => p.id),
      skus: data.variantSkus,
    });
    return { products, variants };
  });

/** Creates the missing categories listed in the file (admin only, off by default). */
export const importCreateCategories = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ names: z.array(z.string().trim().min(1).max(120)).min(1).max(50) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const ctx = await loadImportContext(supabase);
    const created: string[] = [];
    for (const raw of Array.from(new Set(data.names))) {
      if (findCategory(raw, ctx.categories)) continue;
      // "Parent > Child" creates Child under an existing Parent.
      const parts = raw.split(/\s*>\s*/).filter(Boolean);
      const name = parts[parts.length - 1];
      const parent =
        parts.length > 1 ? findCategory(parts.slice(0, -1).join(" > "), ctx.categories) : undefined;
      if (parts.length > 1 && !parent)
        throw new Error(`Parent category "${parts.slice(0, -1).join(" > ")}" does not exist`);
      const slug = slugify(name);
      if (!slug)
        throw new Error(`Category "${name}" needs English letters or numbers for its web address`);
      const { data: row, error } = await supabase
        .from("categories")
        .insert({ name, slug, parent_id: parent?.id ?? null, is_active: true })
        .select(
          "id, slug, name, parent_id, is_active, default_sell_unit, default_pack_size, default_unit_label",
        )
        .single();
      if (error)
        throw new Error(
          error.message.includes("duplicate")
            ? `A category with the slug "${slug}" already exists`
            : error.message,
        );
      ctx.categories.push(row);
      created.push(slug);
    }
    if (created.length)
      await logActivity(supabase, userId, "bulk_import_categories", "category", null, { created });
    return { created };
  });

/** Validates and writes one batch of product rows (one transaction). */
export const importProductsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }): Promise<BatchOutput> => {
    await assertStaff(context.supabase, context.userId);
    return writeProductsBatch(context.supabase, { ...data, rows: data.rows as MappedRow[] });
  });

/** Validates and writes one batch of variant rows (one transaction). Parents must exist by now. */
export const importVariantsBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => batchInput.parse(d))
  .handler(async ({ data, context }): Promise<BatchOutput> => {
    await assertStaff(context.supabase, context.userId);
    return writeVariantsBatch(context.supabase, { ...data, rows: data.rows as MappedRow[] });
  });

/** Downloads one image link server-side (Drive / Dropbox links rewritten); the browser compresses and uploads it. */
export const importFetchImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ url: z.string().trim().min(8).max(2000) }).parse(d))
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    const { fetchImageForImport } = await import("./fetch-image.server");
    return fetchImageForImport(data.url);
  });

/** Saves the copied images. Only links in our own storage (or ones the product already has) are accepted. */
export const importApplyImages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        products: z
          .array(
            z.object({
              id: z.string().uuid(),
              images: z.array(z.string().url().max(1000)).max(10),
            }),
          )
          .max(50)
          .default([]),
        variants: z
          .array(
            z.object({ id: z.string().uuid(), image_url: z.string().url().max(1000).nullable() }),
          )
          .max(50)
          .default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const prefix = storagePublicPrefix(process.env.SUPABASE_URL ?? "");
    const ids = data.products.map((p) => p.id);
    const { data: current, error } = ids.length
      ? await supabase.from("products").select("id, images").in("id", ids)
      : { data: [], error: null };
    if (error) throw new Error(error.message);
    const had = new Map((current ?? []).map((p) => [p.id, new Set(p.images ?? [])]));
    let saved = 0;
    for (const p of data.products) {
      const bad = p.images.find((u) => !u.startsWith(prefix) && !had.get(p.id)?.has(u));
      if (bad) throw new Error(`Image link not allowed: ${bad}`);
      const { error: e } = await supabase
        .from("products")
        .update({ images: p.images })
        .eq("id", p.id);
      if (e) throw new Error(e.message);
      saved++;
    }
    for (const v of data.variants) {
      if (v.image_url && !v.image_url.startsWith(prefix))
        throw new Error(`Image link not allowed: ${v.image_url}`);
      const { error: e } = await supabase
        .from("product_variants")
        .update({ image_url: v.image_url })
        .eq("id", v.id);
      if (e) throw new Error(e.message);
      saved++;
    }
    return { saved };
  });

/** One activity-log entry per import (who, file, counts) — not one per row. */
export const importFinish = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        fileName: z.string().trim().max(255),
        matchBy: z.enum(["auto", "sku", "isbn", "slug"]),
        mode: z.enum(["valid_only", "all"]),
        cancelled: z.boolean(),
        products: z.object({
          created: z.number().int(),
          updated: z.number().int(),
          skipped: z.number().int(),
          failed: z.number().int(),
        }),
        variants: z.object({
          created: z.number().int(),
          updated: z.number().int(),
          skipped: z.number().int(),
          failed: z.number().int(),
        }),
        images: z.object({ copied: z.number().int(), failed: z.number().int() }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertStaff(context.supabase, context.userId);
    await logActivity(
      context.supabase,
      context.userId,
      "bulk_import",
      "product_import",
      null,
      data,
    );
    return { ok: true };
  });

/** Everything for the export workbook, in the import format. */
export const importExportData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(
    async ({ context }): Promise<{ products: ExportProduct[]; variants: ExportVariant[] }> => {
      await assertStaff(context.supabase, context.userId);
      // cost_price is hidden from the API roles: service-role read after the staff check.
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const products: ExportProduct[] = [];
      for (let from = 0; from < 200_000; from += 1000) {
        const { data, error } = await supabaseAdmin
          .from("products")
          .select(
            "id, name, slug, sku, isbn, brand, edition, description, price, sale_price, cost_price, stock_quantity, low_stock_threshold, weight_grams, sell_unit, pack_size, unit_label, is_active, is_featured, is_new_arrival, new_arrival_until, tags, images, attributes, product_categories(category_id, is_primary, created_at)",
          )
          .order("name")
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const p of data ?? []) {
          const links = [...(p.product_categories ?? [])].sort(
            (a, b) =>
              Number(b.is_primary) - Number(a.is_primary) ||
              a.created_at.localeCompare(b.created_at),
          );
          const { product_categories: _links, id: _id, ...rest } = p;
          void _links;
          void _id;
          products.push({
            ...rest,
            attributes: (rest.attributes ?? {}) as StoredAttributes,
            category_ids: links.map((l) => l.category_id),
          });
        }
        if (!data || data.length < 1000) break;
      }
      const variants: ExportVariant[] = [];
      for (let from = 0; from < 200_000; from += 1000) {
        const { data, error } = await context.supabase
          .from("product_variants")
          .select(
            "sku, name, price, compare_at_price, stock, is_active, image_url, option_values, product:products(sku, slug, name)",
          )
          .order("product_id")
          .order("id")
          .range(from, from + 999);
        if (error) throw new Error(error.message);
        for (const v of data ?? []) {
          if (!v.product) continue;
          variants.push({
            product_sku: v.product.sku,
            product_slug: v.product.slug,
            sku: v.sku,
            name: v.name,
            price: v.price,
            compare_at_price: v.compare_at_price,
            stock: v.stock,
            is_active: v.is_active,
            image_url: v.image_url,
            option_values: (v.option_values ?? {}) as Record<string, string>,
          });
        }
        if (!data || data.length < 1000) break;
      }
      return { products, variants };
    },
  );
