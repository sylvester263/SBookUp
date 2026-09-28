import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isRevenueOrder, pktDayKey, pktMonthKey, pktStartOfDay } from "@/lib/sales";
import { validateProductAttributes, validateVariantOptions } from "@/lib/attributes";
import { assertStaff, assertAdmin, logActivity, loadApplicableAttributes, saveNewOptions, attributeErrorMessage } from "@/lib/admin-helpers";

// ---------- role check ----------
// ---------- pagination helpers ----------
const pageInput = {
  page: z.number().int().min(1).max(100_000).default(1),
  pageSize: z.number().int().min(10).max(200).default(50),
};
function pageRange(page: number, pageSize: number) {
  const from = (page - 1) * pageSize;
  return { from, to: from + pageSize - 1 };
}
/** Search text safe to put inside a PostgREST or() filter. */
function searchTerm(q?: string) {
  // Characters that would break PostgREST's or() syntax or act as wildcards.
  const t = (q ?? "").replace(/[%_,()*\\"]/g, " ").trim();
  return t ? `%${t}%` : null;
}
/** A yyyy-mm-dd (Pakistan date) -> UTC ISO instant at the start of that day. */
function pktDateStart(d: string) {
  return new Date(Date.parse(`${d}T00:00:00+05:00`)).toISOString();
}

// ---------- role / me ----------
export const getMyAdminRole = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    const roles = (data ?? []).map((r: any) => r.role);
    return { roles, isStaff: roles.includes("admin") || roles.includes("manager"), isAdmin: roles.includes("admin") };
  });

// ---------- dashboard ----------
export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);

    // All date ranges are in Pakistan time (UTC+5), not the server's UTC day.
    const today = pktStartOfDay(0);
    const yesterday = pktStartOfDay(1);
    const last30 = pktStartOfDay(29);
    const last7 = pktStartOfDay(6);

    const [last30Res, last7Res, productsRes, customersRes, lowStockRes, recentOrdersRes] = await Promise.all([
      supabase.from("orders").select("id, total, status, payment_status, created_at, payment_method").gte("created_at", last30.toISOString()).limit(10000),
      supabase.from("orders").select("id, status, payment_status, created_at, order_items(product_id, products:product_id(category_id, categories:category_id(name)))").gte("created_at", last7.toISOString()).limit(5000),
      supabase.from("products").select("id", { count: "exact", head: true }).eq("is_active", true),
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      (async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin.rpc("get_low_stock_products", { p_limit: 10 });
      })(),
      supabase.from("orders").select("id, order_number, total, status, created_at, shipping_address, order_items(id)").order("created_at", { ascending: false }).limit(10),
    ]);

    const all30 = (last30Res.data ?? []) as any[];
    const notCancelled = all30.filter((o) => o.status !== "cancelled");
    const revenue30 = all30.filter(isRevenueOrder);
    const inRange = (o: any, from: Date, to?: Date) => new Date(o.created_at) >= from && (!to || new Date(o.created_at) < to);
    // Order counts = orders placed (not cancelled). Revenue = orders that count as revenue (see src/lib/sales.ts).
    const todayOrders = notCancelled.filter((o) => inRange(o, today));
    const ydayOrders = notCancelled.filter((o) => inRange(o, yesterday, today));
    const todayRevenue = revenue30.filter((o) => inRange(o, today)).reduce((s: number, o: any) => s + Number(o.total), 0);
    const ydayRevenue = revenue30.filter((o) => inRange(o, yesterday, today)).reduce((s: number, o: any) => s + Number(o.total), 0);

    // Revenue per Pakistan-time day (last 30)
    const dayMap = new Map<string, number>();
    for (let i = 29; i >= 0; i--) dayMap.set(pktDayKey(pktStartOfDay(i)), 0);
    revenue30.forEach((o: any) => {
      const k = pktDayKey(o.created_at);
      if (dayMap.has(k)) dayMap.set(k, (dayMap.get(k) ?? 0) + Number(o.total));
    });
    const revenueSeries = Array.from(dayMap.entries()).map(([date, revenue]) => ({ date: date.slice(5), revenue }));

    // Payment methods donut (last 30, orders placed and not cancelled)
    const payMap = new Map<string, number>();
    notCancelled.forEach((o: any) => payMap.set(o.payment_method, (payMap.get(o.payment_method) ?? 0) + 1));
    const paymentSeries = Array.from(payMap.entries()).map(([name, value]) => ({ name, value }));

    // Orders by category (last 7, not cancelled)
    const catMap = new Map<string, number>();
    ((last7Res.data ?? []) as any[]).filter((o) => o.status !== "cancelled").forEach((o: any) => {
      (o.order_items ?? []).forEach((it: any) => {
        const name = it?.products?.categories?.name ?? "Other";
        catMap.set(name, (catMap.get(name) ?? 0) + 1);
      });
    });
    const categorySeries = Array.from(catMap.entries()).map(([name, count]) => ({ name, count }));

    return {
      kpis: {
        todayOrders: todayOrders.length,
        todayRevenue,
        ordersChange: ydayOrders.length ? Math.round(((todayOrders.length - ydayOrders.length) / ydayOrders.length) * 100) : 0,
        revenueChange: ydayRevenue ? Math.round(((todayRevenue - ydayRevenue) / ydayRevenue) * 100) : 0,
        totalProducts: productsRes.count ?? 0,
        activeCustomers: customersRes.count ?? 0,
      },
      revenueSeries,
      paymentSeries,
      categorySeries,
      lowStock: lowStockRes.data ?? [],
      recentOrders: recentOrdersRes.data ?? [],
    };
  });

// ---------- products ----------
export const adminListProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ...pageInput,
      q: z.string().trim().max(120).optional(),
      categoryId: z.string().uuid().optional(),
      status: z.enum(["all", "active", "draft"]).default("all"),
      stock: z.enum(["all", "low", "out"]).default("all"),
      attrKey: z.string().regex(/^[a-z][a-z0-9_]{0,39}$/).optional(),
      attrValue: z.string().trim().max(200).optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    // cost_price is not readable through the public API roles, so staff reads go
    // through the service-role client AFTER the staff check above. All columns are
    // loaded because the edit drawer saves the full row.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Category filter = products linked to the category or any of its children
    // (any membership, not only the primary), via the product_categories join.
    let catIds: string[] | null = null;
    if (data.categoryId) {
      const { data: ids } = await supabaseAdmin.rpc("category_descendants", { p_category_id: data.categoryId });
      catIds = ((ids ?? []) as unknown as string[]).length ? (ids as unknown as string[]) : [data.categoryId];
    }
    // Attribute filter: product attributes, or — for variant axes such as costume
    // size / colour — products that have a variant with that option.
    let attrDef: { key: string; type: string; is_variant_axis: boolean } | null = null;
    if (data.attrKey && data.attrValue) {
      const { data: d } = await supabaseAdmin.from("attribute_definitions").select("key, type, is_variant_axis").eq("key", data.attrKey).maybeSingle();
      attrDef = d;
    }
    const joins = [
      catIds ? "product_categories!inner(category_id)" : null,
      attrDef?.is_variant_axis ? "product_variants!inner(option_values)" : null,
    ].filter(Boolean);
    let q = supabaseAdmin
      .from("products")
      .select(["*, categories:category_id(name)", ...joins].join(", "), { count: "exact" })
      .order("created_at", { ascending: false });
    if (catIds) q = q.in("product_categories.category_id", catIds);
    if (attrDef && data.attrValue) {
      if (attrDef.is_variant_axis) q = q.contains("product_variants.option_values", { [attrDef.key]: data.attrValue });
      else if (attrDef.type === "multiselect") q = q.contains("attributes", { [attrDef.key]: [data.attrValue] });
      else if (attrDef.type === "number") q = q.eq(`attributes->>${attrDef.key}`, data.attrValue);
      else q = q.contains("attributes", { [attrDef.key]: data.attrValue });
    }
    const term = searchTerm(data.q);
    if (term) q = q.or(`name.ilike.${term},sku.ilike.${term},isbn.ilike.${term}`);
    if (data.status !== "all") q = q.eq("is_active", data.status === "active");
    if (data.stock === "out") q = q.lte("stock_quantity", 0);
    if (data.stock === "low") {
      // "low" = at or under the product's own threshold but not zero
      const { data: low } = await supabaseAdmin.rpc("get_low_stock_products", { p_limit: 1000 });
      const ids = (low ?? []).map((r: any) => r.id);
      q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]).gt("stock_quantity", 0);
    }
    const { from, to } = pageRange(data.page, data.pageSize);
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

const productSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(200).regex(/^[a-z0-9-]+$/),
  sku: z.string().trim().max(60).optional().or(z.literal("")),
  isbn: z.string().trim().max(40).optional().or(z.literal("")),
  category_id: z.string().uuid().nullable().optional(),
  brand: z.string().trim().max(80).optional().or(z.literal("")),
  author: z.string().trim().max(120).optional().or(z.literal("")),
  publisher: z.string().trim().max(120).optional().or(z.literal("")),
  edition: z.string().trim().max(40).optional().or(z.literal("")),
  description: z.string().max(5000).optional().or(z.literal("")),
  cost_price: z.number().min(0).optional().nullable(),
  price: z.number().min(0),
  sale_price: z.number().min(0).nullable().optional(),
  stock_quantity: z.number().int().min(0),
  low_stock_threshold: z.number().int().min(0).default(5),
  weight_grams: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  images: z.array(z.string().url()).max(10).default([]),
  tags: z.array(z.string().max(40)).max(20).default([]),
  // Catalog Phase B (all optional so older callers keep working):
  category_ids: z.array(z.string().uuid()).min(1).max(10).optional(),
  primary_category_id: z.string().uuid().optional(),
  attributes: z.record(z.unknown()).optional(),
  sell_unit: z.enum(["item", "pack"]).optional(),
  pack_size: z.number().int().min(2).max(1000).nullable().optional(),
  unit_label: z.string().trim().max(30).optional().or(z.literal("")).nullable(),
  is_new_arrival: z.boolean().optional(),
  new_arrival_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional().or(z.literal("")),
}).superRefine((d, ctx) => {
  if (d.sell_unit === "pack" && !d.pack_size) ctx.addIssue({ code: "custom", path: ["pack_size"], message: "Pack size is required when selling by the pack" });
  if (d.category_ids && d.primary_category_id && !d.category_ids.includes(d.primary_category_id)) {
    ctx.addIssue({ code: "custom", path: ["primary_category_id"], message: "The primary category must be one of the selected categories" });
  }
});

export const adminUpsertProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => productSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { category_ids, primary_category_id, attributes, ...rest } = data;
    const row: any = { ...rest };
    Object.keys(row).forEach((k) => row[k] === "" && (row[k] = null));
    if (row.sell_unit === "item") row.pack_size = null;

    // Categories: the primary one is written to products.category_id (a trigger keeps
    // product_categories in sync); the others are added as extra memberships below.
    let categoryIds = category_ids;
    if (categoryIds) row.category_id = primary_category_id ?? categoryIds[0];
    if (!categoryIds && attributes && data.id) {
      const { data: links } = await supabase.from("product_categories").select("category_id").eq("product_id", data.id);
      categoryIds = (links ?? []).map((l: any) => l.category_id);
    }
    if (!categoryIds && attributes && row.category_id) categoryIds = [row.category_id];

    // Attributes: validated against the definitions of the product's categories.
    if (attributes) {
      const applicable = await loadApplicableAttributes(supabase, categoryIds ?? []);
      const result = validateProductAttributes(attributes, applicable);
      if (Object.keys(result.errors).length) throw new Error(attributeErrorMessage(result.errors));
      await saveNewOptions(supabase, applicable, result.newOptions);
      // Keep stored values for keys that don't apply to these categories (e.g. an
      // author on a product in a not-yet-mapped category) instead of erasing them.
      let kept: Record<string, unknown> = {};
      if (data.id) {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: cur } = await supabaseAdmin.from("products").select("attributes").eq("id", data.id).maybeSingle();
        const applicableKeys = new Set(applicable.map((a) => a.key));
        kept = Object.fromEntries(Object.entries((cur?.attributes ?? {}) as Record<string, unknown>).filter(([k]) => !applicableKeys.has(k)));
      }
      row.attributes = { ...kept, ...result.values };
      // author / publisher columns are mirrors of the attributes (set by a DB trigger)
      delete row.author;
      delete row.publisher;
    }

    let id = data.id;
    if (id) {
      const { error } = await supabase.from("products").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      delete row.id;
      const { data: ins, error } = await supabase.from("products").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      id = ins.id as string;
    }

    if (category_ids) {
      const primary = row.category_id as string;
      const extra = category_ids.filter((c) => c !== primary);
      if (extra.length) {
        const { error } = await supabase
          .from("product_categories")
          .upsert(extra.map((category_id) => ({ product_id: id!, category_id, is_primary: false })), { onConflict: "product_id,category_id", ignoreDuplicates: true });
        if (error) throw new Error(error.message);
      }
      const { error: delErr } = await supabase
        .from("product_categories")
        .delete()
        .eq("product_id", id!)
        .not("category_id", "in", `(${category_ids.join(",")})`);
      if (delErr) throw new Error(delErr.message);
    }
    await logActivity(supabase, userId, data.id ? "update" : "create", "product", id!, row);
    return { id: id! };
  });

export const adminDeleteProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await supabase.from("products").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "product", data.id);
    return { ok: true };
  });

export const adminBulkProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ids: z.array(z.string().uuid()).min(1).max(200), op: z.enum(["activate", "deactivate", "delete"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    if (data.op === "delete") {
      const { error } = await supabase.from("products").delete().in("id", data.ids);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("products").update({ is_active: data.op === "activate" }).in("id", data.ids);
      if (error) throw new Error(error.message);
    }
    await logActivity(supabase, userId, `bulk_${data.op}`, "product", null, { ids: data.ids });
    return { ok: true };
  });

const bulkRowSchema = z.object({
  name: z.string().min(1).max(300),
  slug: z.string().min(1).max(300),
  description: z.string().max(10000).optional().nullable(),
  category_id: z.string().uuid().optional().nullable(),
  brand: z.string().max(120).optional().nullable(),
  author: z.string().max(200).optional().nullable(),
  publisher: z.string().max(200).optional().nullable(),
  edition: z.string().max(80).optional().nullable(),
  isbn: z.string().max(32).optional().nullable(),
  sku: z.string().max(80).optional().nullable(),
  price: z.number().min(0),
  sale_price: z.number().min(0).optional().nullable(),
  cost_price: z.number().min(0).optional().nullable(),
  stock_quantity: z.number().int().min(0).default(0),
  low_stock_threshold: z.number().int().min(0).default(5),
  weight_grams: z.number().int().min(0).optional().nullable(),
  is_active: z.boolean().default(true),
  is_featured: z.boolean().default(false),
  images: z.array(z.string().url()).max(10).default([]),
  tags: z.array(z.string().max(40)).max(20).default([]),
});

export const adminBulkUpsertProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ rows: z.array(bulkRowSchema).min(1).max(500) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const rows = data.rows.map((r) => {
      const o: any = { ...r };
      Object.keys(o).forEach((k) => o[k] === "" && (o[k] = null));
      return o;
    });
    const { error, data: ins } = await supabase
      .from("products")
      .upsert(rows, { onConflict: "slug" })
      .select("id");
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "bulk_upsert", "product", null, { count: rows.length });
    return { count: ins?.length ?? rows.length };
  });

export const adminExportProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    // Includes cost_price: service-role read, only after the staff check.
    // Paged because Supabase returns at most 1000 rows per request.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const out: any[] = [];
    for (let from = 0; from < 100_000; from += 1000) {
      const { data, error } = await supabaseAdmin
        .from("products")
        .select("name, slug, description, price, sale_price, cost_price, stock_quantity, low_stock_threshold, weight_grams, brand, author, publisher, edition, isbn, sku, is_active, is_featured, tags, images, categories:category_id(slug)")
        .order("name")
        .range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  });



// ---------- orders ----------
export const adminListOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ...pageInput,
      q: z.string().trim().max(120).optional(),
      status: z.string().max(30).default("all"),
      payStatus: z.string().max(30).default("all"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase
      .from("orders")
      .select("id, order_number, user_id, guest_email, status, payment_status, payment_method, total, shipping_address, created_at, tracking_number, order_items(id)", { count: "exact" })
      .order("created_at", { ascending: false });
    const term = searchTerm(data.q);
    if (term) q = q.or(`order_number.ilike.${term},guest_email.ilike.${term},shipping_address->>name.ilike.${term},shipping_address->>phone.ilike.${term}`);
    if (data.status !== "all") q = q.eq("status", data.status as any);
    if (data.payStatus !== "all") q = q.eq("payment_status", data.payStatus as any);
    // Date filters are Pakistan calendar days
    if (data.from) q = q.gte("created_at", pktDateStart(data.from));
    if (data.to) q = q.lt("created_at", new Date(Date.parse(pktDateStart(data.to)) + 86_400_000).toISOString());
    const { from, to } = pageRange(data.page, data.pageSize);
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const adminGetOrder = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return order;
  });

export const adminUpdateOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      status: z.enum(["pending", "confirmed", "processing", "shipped", "delivered", "cancelled", "refunded"]).optional(),
      payment_status: z.enum(["pending", "pending_verification", "paid", "failed", "refunded"]).optional(),
      tracking_number: z.string().trim().max(80).optional().or(z.literal("")),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const patch: any = {};
    if (data.status) patch.status = data.status;
    if (data.payment_status) patch.payment_status = data.payment_status;
    if (data.tracking_number !== undefined) patch.tracking_number = data.tracking_number || null;
    const { data: before } = await supabase.from("orders").select("status").eq("id", data.id).maybeSingle();
    const { error } = await supabase.from("orders").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "update", "order", data.id, patch, before ? { status: before.status } : null);
    // Customer email on confirmed / shipped / delivered / cancelled (best-effort)
    if (data.status && before && before.status !== data.status) {
      const { notifyOrderStatus } = await import("@/lib/email/notify.server");
      await notifyOrderStatus(data.id, data.status);
    }
    return { ok: true };
  });

// ---------- categories (used by product picker) ----------
export const adminListCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase.from("categories").select("id, name, slug, parent_id, display_order, is_active, image_url").order("display_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const categorySchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120).regex(/^[a-z0-9-]+$/),
  parent_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().optional().or(z.literal("")),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
});

export const adminUpsertCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => categorySchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const row: any = { ...data, image_url: data.image_url || null, parent_id: data.parent_id || null };
    if (data.id) {
      const { error } = await supabase.from("categories").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, "update", "category", data.id, row);
      return { id: data.id };
    }
    delete row.id;
    const { data: ins, error } = await supabase.from("categories").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "create", "category", ins.id, row);
    return { id: ins.id };
  });

export const adminDeleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    // Refuse while it still has sub-categories or products (deleting would silently
    // drop product links). Hide it (inactive) or move things first.
    const [{ count: children }, { count: products }] = await Promise.all([
      supabase.from("categories").select("id", { count: "exact", head: true }).eq("parent_id", data.id),
      supabase.from("product_categories").select("product_id", { count: "exact", head: true }).eq("category_id", data.id),
    ]);
    if ((children ?? 0) > 0) throw new Error(`This category has ${children} sub-categories. Move or delete them first, or hide the category instead.`);
    if ((products ?? 0) > 0) throw new Error(`${products} products are in this category. Move them first, or hide the category instead.`);
    const { error } = await supabase.from("categories").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "category", data.id);
    return { ok: true };
  });

// ---------- image upload (signed url via admin storage) ----------
export const adminGetUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ bucket: z.enum(["product-images", "banner-images"]), filename: z.string().trim().min(1).max(120).regex(/^[a-zA-Z0-9._-]+$/) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const path = `${Date.now()}-${data.filename}`;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: signed, error } = await supabaseAdmin.storage.from(data.bucket).createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    const { data: pub } = supabaseAdmin.storage.from(data.bucket).getPublicUrl(path);
    return { path, token: signed.token, signedUrl: signed.signedUrl, publicUrl: pub.publicUrl };
  });

// ---------- bundles ----------
export const adminListBundles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase
      .from("bundles")
      .select("*, bundle_items(id, quantity, product_id, products:product_id(id, name, price, images))")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const bundleSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  slug: z.string().trim().min(1).max(160).regex(/^[a-z0-9-]+$/),
  description: z.string().max(2000).optional().or(z.literal("")),
  school_name: z.string().max(120).optional().or(z.literal("")),
  class_level: z.string().max(60).optional().or(z.literal("")),
  exam_board: z.string().max(60).optional().or(z.literal("")),
  image_url: z.string().url().optional().or(z.literal("")),
  total_price: z.number().min(0).default(0),
  discounted_price: z.number().min(0).default(0),
  is_active: z.boolean().default(true),
  items: z.array(z.object({ product_id: z.string().uuid(), quantity: z.number().int().min(1).max(99) })).default([]),
});

export const adminUpsertBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bundleSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { items, id, ...rest } = data;
    const row: any = { ...rest, description: rest.description || null, image_url: rest.image_url || null };
    let bundleId = id;
    if (id) {
      const { error } = await supabase.from("bundles").update(row).eq("id", id);
      if (error) throw new Error(error.message);
    } else {
      const { data: ins, error } = await supabase.from("bundles").insert(row).select("id").single();
      if (error) throw new Error(error.message);
      bundleId = ins.id;
    }
    await supabase.from("bundle_items").delete().eq("bundle_id", bundleId!);
    if (items.length) {
      const { error } = await supabase.from("bundle_items").insert(items.map((it) => ({ ...it, bundle_id: bundleId as string })));
      if (error) throw new Error(error.message);
    }
    await logActivity(supabase, userId, id ? "update" : "create", "bundle", bundleId!, row);
    return { id: bundleId };
  });

export const adminDeleteBundle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    await supabase.from("bundle_items").delete().eq("bundle_id", data.id);
    const { error } = await supabase.from("bundles").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "bundle", data.id);
    return { ok: true };
  });

// ---------- coupons ----------
export const adminListCoupons = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase.from("coupons").select("*").order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const couponSchema = z.object({
  id: z.string().uuid().optional(),
  code: z.string().trim().min(2).max(40).regex(/^[A-Z0-9_-]+$/),
  type: z.enum(["percentage", "fixed", "free_shipping"]),
  value: z.number().min(0),
  min_order_amount: z.number().min(0).default(0),
  max_uses: z.number().int().min(0).nullable().optional(),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
  is_active: z.boolean().default(true),
});

export const adminUpsertCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => couponSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const row: any = { ...data };
    if (!row.valid_from) row.valid_from = null;
    if (!row.valid_until) row.valid_until = null;
    if (row.max_uses === undefined || row.max_uses === null || row.max_uses === 0) row.max_uses = null;
    if (data.id) {
      const { error } = await supabase.from("coupons").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, "update", "coupon", data.id, row);
      return { id: data.id };
    }
    delete row.id;
    const { data: ins, error } = await supabase.from("coupons").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "create", "coupon", ins.id, row);
    return { id: ins.id };
  });

export const adminDeleteCoupon = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await supabase.from("coupons").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "coupon", data.id);
    return { ok: true };
  });

// ---------- banners ----------
export const adminListBanners = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase.from("banners").select("*").order("display_order");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const bannerSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(160),
  subtitle: z.string().max(240).optional().or(z.literal("")),
  image_url: z.string().url(),
  link_url: z.string().max(400).optional().or(z.literal("")),
  position: z.enum(["hero", "section", "sidebar"]).default("hero"),
  display_order: z.number().int().min(0).default(0),
  is_active: z.boolean().default(true),
  valid_from: z.string().nullable().optional(),
  valid_until: z.string().nullable().optional(),
});

export const adminUpsertBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bannerSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const row: any = { ...data, subtitle: data.subtitle || null, link_url: data.link_url || null };
    if (!row.valid_from) row.valid_from = null;
    if (!row.valid_until) row.valid_until = null;
    if (data.id) {
      const { error } = await supabase.from("banners").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, "update", "banner", data.id, row);
      return { id: data.id };
    }
    delete row.id;
    const { data: ins, error } = await supabase.from("banners").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "create", "banner", ins.id, row);
    return { id: ins.id };
  });

export const adminDeleteBanner = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await supabase.from("banners").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "banner", data.id);
    return { ok: true };
  });

// ---------- customers ----------
export const adminListCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ ...pageInput, q: z.string().trim().max(120).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase
      .from("profiles")
      .select("id, email, name, phone, school_name, created_at", { count: "exact" })
      .order("created_at", { ascending: false });
    const term = searchTerm(data.q);
    if (term) q = q.or(`name.ilike.${term},email.ilike.${term},phone.ilike.${term},school_name.ilike.${term}`);
    const { from, to } = pageRange(data.page, data.pageSize);
    const { data: profiles, error: pErr, count } = await q.range(from, to);
    if (pErr) throw new Error(pErr.message);
    // Order stats only for the customers on this page (cancelled/refunded excluded from spend)
    const ids = (profiles ?? []).map((p: any) => p.id);
    const stats = new Map<string, { count: number; total: number; last: string | null }>();
    if (ids.length) {
      const { data: orders, error: oErr } = await supabase.from("orders").select("user_id, total, status, created_at").in("user_id", ids).limit(10000);
      if (oErr) throw new Error(oErr.message);
      (orders ?? []).forEach((o: any) => {
        const s = stats.get(o.user_id) ?? { count: 0, total: 0, last: null };
        s.count++;
        if (o.status !== "cancelled" && o.status !== "refunded") s.total += Number(o.total);
        if (!s.last || o.created_at > s.last) s.last = o.created_at;
        stats.set(o.user_id, s);
      });
    }
    const rows = (profiles ?? []).map((p: any) => ({ ...p, ...(stats.get(p.id) ?? { count: 0, total: 0, last: null }) }));
    return { rows, total: count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const adminListProductsLite = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase.from("products").select("id, name, price, images, sku").eq("is_active", true).order("name").limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- marketing: newsletters & reminders ----------
export const adminListNewsletters = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ...pageInput, q: z.string().trim().max(120).optional(), status: z.enum(["all", "active", "unsubscribed"]).default("all") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase.from("newsletters").select("id, email, name, subscribed_at, unsubscribed_at", { count: "exact" }).order("subscribed_at", { ascending: false });
    const term = searchTerm(data.q);
    if (term) q = q.or(`email.ilike.${term},name.ilike.${term}`);
    if (data.status === "active") q = q.is("unsubscribed_at", null);
    if (data.status === "unsubscribed") q = q.not("unsubscribed_at", "is", null);
    const { from, to } = pageRange(data.page, data.pageSize);
    const [{ data: rows, error, count }, active] = await Promise.all([
      q.range(from, to),
      supabase.from("newsletters").select("id", { count: "exact", head: true }).is("unsubscribed_at", null),
    ]);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0, activeCount: active.count ?? 0, page: data.page, pageSize: data.pageSize };
  });

export const adminExportNewsletters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const out: any[] = [];
    for (let from = 0; from < 200_000; from += 1000) {
      const { data, error } = await supabase
        .from("newsletters").select("email, name, subscribed_at, unsubscribed_at")
        .order("subscribed_at", { ascending: false }).range(from, from + 999);
      if (error) throw new Error(error.message);
      out.push(...(data ?? []));
      if (!data || data.length < 1000) break;
    }
    return out;
  });

export const adminListReminders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase.from("reminders").select("*").order("trigger_date", { ascending: false }).limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const reminderSchema = z.object({
  id: z.string().uuid().optional(),
  user_id: z.string().uuid(),
  reminder_type: z.string().trim().min(1).max(60),
  trigger_date: z.string().min(1),
  message: z.string().max(500).optional().or(z.literal("")),
});

export const adminUpsertReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reminderSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const row: any = { ...data, message: data.message || null };
    if (data.id) {
      const { error } = await supabase.from("reminders").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, "update", "reminder", data.id, row);
      return { id: data.id };
    }
    delete row.id;
    const { data: ins, error } = await supabase.from("reminders").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "create", "reminder", ins.id, row);
    return { id: ins.id };
  });

export const adminDeleteReminder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await supabase.from("reminders").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "reminder", data.id);
    return { ok: true };
  });

// ---------- reports ----------
export const adminReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const since = pktStartOfDay(89); // last 90 days, Pakistan time
    const [ordersRes, itemsRes, productsRes] = await Promise.all([
      supabase.from("orders").select("id, total, status, payment_status, payment_method, created_at, user_id").gte("created_at", since.toISOString()).limit(20000),
      supabase
        .from("order_items")
        .select("product_id, name_snapshot, quantity, subtotal, orders:order_id!inner(created_at, status, payment_status)")
        .gte("orders.created_at", since.toISOString())
        .limit(20000),
      (async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        return supabaseAdmin.rpc("get_low_stock_products", { p_limit: 50 });
      })(),
    ]);
    // Only orders that count as revenue (see src/lib/sales.ts)
    const orders = ((ordersRes.data ?? []) as any[]).filter(isRevenueOrder);
    const items = ((itemsRes.data ?? []) as any[]).filter((it) => it.orders && isRevenueOrder(it.orders));

    const monthMap = new Map<string, { revenue: number; orders: number }>();
    orders.forEach((o: any) => {
      const k = pktMonthKey(o.created_at);
      const s = monthMap.get(k) ?? { revenue: 0, orders: 0 };
      s.revenue += Number(o.total); s.orders += 1;
      monthMap.set(k, s);
    });
    const monthly = Array.from(monthMap.entries()).sort().map(([month, v]) => ({ month, ...v }));

    const prodMap = new Map<string, { name: string; quantity: number; revenue: number }>();
    items.forEach((it: any) => {
      const key = it.product_id ?? it.name_snapshot;
      const s = prodMap.get(key) ?? { name: it.name_snapshot, quantity: 0, revenue: 0 };
      s.quantity += Number(it.quantity); s.revenue += Number(it.subtotal);
      prodMap.set(key, s);
    });
    const topProducts = Array.from(prodMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, 15);

    const totalRevenue = orders.reduce((s: number, o: any) => s + Number(o.total), 0);
    const aov = orders.length ? totalRevenue / orders.length : 0;
    const uniqueCustomers = new Set(orders.map((o: any) => o.user_id).filter(Boolean)).size;

    return {
      summary: { totalRevenue, orderCount: orders.length, aov, uniqueCustomers },
      monthly,
      topProducts,
      lowStock: productsRes.data ?? [],
    };
  });

// ---------- shipping zones (settings) ----------
export const adminListShippingZones = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase.from("shipping_zones").select("*").order("created_at");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const zoneSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(120),
  cities: z.array(z.string().trim().min(1).max(80)).max(200).default([]),
  base_rate: z.number().min(0).default(0),
  per_kg_rate: z.number().min(0).default(0),
  estimated_days: z.number().int().min(1).max(60).default(3),
  free_shipping_threshold: z.number().min(0).nullable().optional(),
  is_active: z.boolean().default(true),
});

export const adminUpsertShippingZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => zoneSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const row: any = { ...data };
    if (data.id) {
      const { error } = await supabase.from("shipping_zones").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, "update", "shipping_zone", data.id, row);
      return { id: data.id };
    }
    delete row.id;
    const { data: ins, error } = await supabase.from("shipping_zones").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "create", "shipping_zone", ins.id, row);
    return { id: ins.id };
  });

export const adminDeleteShippingZone = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { error } = await supabase.from("shipping_zones").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "shipping_zone", data.id);
    return { ok: true };
  });

// ---------- activity logs ----------
export const adminListActivityLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      ...pageInput,
      adminId: z.string().max(40).default("all"), // uuid, "system" or "all"
      entity: z.string().max(60).default("all"),
      from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
      to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase
      .from("activity_logs")
      .select("id, admin_id, action, entity_type, entity_id, new_value, old_value, created_at", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.adminId === "system") q = q.is("admin_id", null);
    else if (data.adminId !== "all") q = q.eq("admin_id", data.adminId);
    if (data.entity !== "all") q = q.eq("entity_type", data.entity);
    if (data.from) q = q.gte("created_at", pktDateStart(data.from));
    if (data.to) q = q.lt("created_at", new Date(Date.parse(pktDateStart(data.to)) + 86_400_000).toISOString());
    const { from, to } = pageRange(data.page, data.pageSize);
    const { data: rows, error, count } = await q.range(from, to);
    if (error) throw new Error(error.message);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.admin_id).filter(Boolean)));
    const adminMap = new Map<string, { name: string | null; email: string | null }>();
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name, email").in("id", ids);
      (profs ?? []).forEach((p: any) => adminMap.set(p.id, { name: p.name, email: p.email }));
    }
    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, admin: r.admin_id ? adminMap.get(r.admin_id) ?? null : null })),
      total: count ?? 0,
      page: data.page,
      pageSize: data.pageSize,
    };
  });

/** Options for the Activity Log filters: staff members and entity types. */
export const adminActivityLogFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const [{ data: staff }, { data: recent }] = await Promise.all([
      supabase.from("user_roles").select("user_id, role").in("role", ["admin", "manager"]),
      supabase.from("activity_logs").select("entity_type").order("created_at", { ascending: false }).limit(1000),
    ]);
    const staffIds = Array.from(new Set((staff ?? []).map((r: any) => r.user_id)));
    const { data: profs } = staffIds.length
      ? await supabase.from("profiles").select("id, name, email").in("id", staffIds)
      : { data: [] as any[] };
    return {
      admins: (profs ?? []).map((p: any) => ({ id: p.id, label: p.name || p.email || p.id.slice(0, 8) })),
      entities: Array.from(new Set((recent ?? []).map((r: any) => r.entity_type).filter(Boolean))).sort(),
    };
  });

// ---------- reviews moderation ----------
export const adminListReviews = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ...pageInput, status: z.enum(["all", "pending", "approved", "rejected"]).default("pending") }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase
      .from("reviews")
      .select("id, product_id, user_id, rating, title, body, status, reject_reason, is_verified_purchase, moderated_at, created_at, products:product_id(name, slug, images)", { count: "exact" })
      .order("created_at", { ascending: false });
    if (data.status !== "all") q = q.eq("status", data.status);
    const { from, to } = pageRange(data.page, data.pageSize);
    const countOf = (st: "pending" | "approved" | "rejected") =>
      supabase.from("reviews").select("id", { count: "exact", head: true }).eq("status", st);
    const [{ data: rows, error, count }, pending, approved, rejected] = await Promise.all([
      q.range(from, to), countOf("pending"), countOf("approved"), countOf("rejected"),
    ]);
    if (error) throw new Error(error.message);
    const userIds = Array.from(new Set((rows ?? []).map((r: any) => r.user_id).filter(Boolean)));
    const pmap = new Map<string, { name: string | null; email: string | null }>();
    if (userIds.length) {
      const { data: profs } = await supabase.from("profiles").select("id, name, email").in("id", userIds);
      (profs ?? []).forEach((p: any) => pmap.set(p.id, { name: p.name, email: p.email }));
    }
    const counts = { pending: pending.count ?? 0, approved: approved.count ?? 0, rejected: rejected.count ?? 0 };
    return {
      rows: (rows ?? []).map((r: any) => ({ ...r, reviewer: pmap.get(r.user_id) ?? null })),
      total: count ?? 0,
      counts: { ...counts, all: counts.pending + counts.approved + counts.rejected },
      page: data.page,
      pageSize: data.pageSize,
    };
  });

export const adminModerateReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      action: z.enum(["approved", "rejected"]),
      reject_reason: z.string().trim().max(500).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const patch: any = {
      status: data.action,
      is_approved: data.action === "approved",
      moderated_at: new Date().toISOString(),
      moderated_by: userId,
      reject_reason: data.action === "rejected" ? (data.reject_reason ?? null) : null,
    };
    const { data: updated, error } = await supabase
      .from("reviews")
      .update(patch)
      .eq("id", data.id)
      .select("id, product_id, user_id, rating, title")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, `review_${data.action}`, "review", data.id, patch, null);
    return { ok: true, review: updated };
  });

// ---------- store settings ----------
const storeSettingsSchema = z.object({
  store_name: z.string().trim().min(1).max(120),
  contact_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  contact_phone: z.string().trim().max(40).optional().or(z.literal("")),
  address: z.string().trim().max(500).optional().or(z.literal("")),
  currency: z.string().trim().min(1).max(8),
  tax_rate: z.number().min(0).max(100),
  meta_title: z.string().trim().max(200).optional().or(z.literal("")),
  meta_description: z.string().trim().max(400).optional().or(z.literal("")),
  sender_name: z.string().trim().max(120).optional().or(z.literal("")),
  sender_email: z.string().trim().email().max(255).optional().or(z.literal("")),
  logo_url: z.string().trim().url().max(500).optional().or(z.literal("")),
  bank_name: z.string().trim().max(120).optional().or(z.literal("")),
  bank_account_title: z.string().trim().max(120).optional().or(z.literal("")),
  bank_account_number: z.string().trim().max(60).optional().or(z.literal("")),
  bank_iban: z.string().trim().max(40).optional().or(z.literal("")),
  bank_instructions: z.string().trim().max(1000).optional().or(z.literal("")),
  enable_cod: z.boolean().optional(),
  enable_bank_transfer: z.boolean().optional(),
  school_features_enabled: z.boolean().optional(),
  home_sections: z.array(z.object({ key: z.enum(["categories", "new_arrivals", "recently_added", "price_bands", "best_sellers"]), enabled: z.boolean() })).max(10).optional(),
  price_bands: z.array(z.object({ label: z.string().trim().min(1).max(40), min: z.number().min(0).nullable(), max: z.number().min(0).nullable() })).max(10).optional(),
});

export const adminUpdateStoreSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => storeSettingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const patch = {
      ...data,
      contact_email: data.contact_email || null,
      contact_phone: data.contact_phone || null,
      address: data.address || null,
      meta_title: data.meta_title || null,
      meta_description: data.meta_description || null,
      sender_name: data.sender_name || null,
      sender_email: data.sender_email || null,
      logo_url: data.logo_url || null,
      bank_name: data.bank_name || null,
      bank_account_title: data.bank_account_title || null,
      bank_account_number: data.bank_account_number || null,
      bank_iban: data.bank_iban || null,
      bank_instructions: data.bank_instructions || null,
      // JazzCash / EasyPaisa switches are NOT settable here until the gateways
      // are connected (see src/lib/payments). They stay false in the database.
    };
    const { data: row, error } = await supabase
      .from("store_settings")
      .upsert({ id: true, ...patch }, { onConflict: "id" })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "store_settings_update", "settings", null, patch, null);
    return { ok: true, settings: row };
  });

// ---------- payment proof (bank transfer) ----------
export const adminGetPaymentProofUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: o, error } = await supabase.from("orders").select("payment_proof_path").eq("id", data.orderId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!o?.payment_proof_path) return { url: null as string | null };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Private bucket: short-lived signed link, generated only for staff.
    const { data: signed, error: sErr } = await supabaseAdmin.storage.from("payment-proofs").createSignedUrl(o.payment_proof_path, 600);
    if (sErr) throw new Error(sErr.message);
    return { url: signed.signedUrl as string | null };
  });

// ---------- contact messages ----------
export const adminListMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      folder: z.enum(["inbox", "unread", "archived"]).default("inbox"),
      q: z.string().trim().max(120).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase
      .from("contact_messages")
      .select("id, name, email, phone, subject, message, is_read, archived_at, replied_at, reply_body, created_at")
      .order("created_at", { ascending: false })
      .limit(200);
    if (data.folder === "archived") q = q.not("archived_at", "is", null);
    else q = q.is("archived_at", null);
    if (data.folder === "unread") q = q.eq("is_read", false);
    if (data.q) {
      const t = data.q.replace(/[%_,()]/g, " ");
      q = q.or(`name.ilike.%${t}%,email.ilike.%${t}%,subject.ilike.%${t}%,message.ilike.%${t}%`);
    }
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adminUnreadMessageCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { count, error } = await supabase
      .from("contact_messages")
      .select("id", { count: "exact", head: true })
      .eq("is_read", false)
      .is("archived_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

export const adminUpdateMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_read: z.boolean().optional(), archived: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const patch: { is_read?: boolean; archived_at?: string | null } = {};
    if (data.is_read !== undefined) patch.is_read = data.is_read;
    if (data.archived !== undefined) patch.archived_at = data.archived ? new Date().toISOString() : null;
    const { error } = await supabase.from("contact_messages").update(patch).eq("id", data.id);
    if (error) throw new Error(error.message);
    if (data.archived !== undefined) await logActivity(supabase, userId, data.archived ? "archive" : "unarchive", "contact_message", data.id);
    return { ok: true };
  });

export const adminReplyMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid(), reply: z.string().trim().min(1).max(5000) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: m, error } = await supabase.from("contact_messages").select("id, name, email, subject").eq("id", data.id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!m) throw new Error("Message not found");
    const { sendContactReply } = await import("@/lib/email/notify.server");
    const res = await sendContactReply(m.email, m.name, m.subject, data.reply);
    if (!res.ok) throw new Error(res.error ?? "Email could not be sent");
    const { error: uErr } = await supabase
      .from("contact_messages")
      .update({ is_read: true, replied_at: new Date().toISOString(), reply_body: data.reply })
      .eq("id", data.id);
    if (uErr) throw new Error(uErr.message);
    await logActivity(supabase, userId, "reply", "contact_message", data.id);
    return { ok: true, logged: !!res.logged };
  });

// ---------- newsletter campaign ----------
export const adminSendNewsletter = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      subject: z.string().trim().min(3).max(160),
      body: z.string().trim().min(10).max(20000),
      testEmail: z.string().trim().email().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { sendNewsletterCampaign } = await import("@/lib/email/notify.server");
    if (data.testEmail) {
      // Test send: one email, not logged as a campaign. The token is a placeholder.
      const r = await sendNewsletterCampaign(`[TEST] ${data.subject}`, data.body, [
        { email: data.testEmail, name: null, unsubscribe_token: "00000000-0000-0000-0000-000000000000" },
      ]);
      return { sent: r.sent, failed: r.failed, logged: r.logged, test: true };
    }
    const { data: subs, error } = await supabase
      .from("newsletters")
      .select("email, name, unsubscribe_token")
      .is("unsubscribed_at", null)
      .limit(5000);
    if (error) throw new Error(error.message);
    const recipients = (subs ?? []) as { email: string; name: string | null; unsubscribe_token: string }[];
    if (!recipients.length) throw new Error("There are no active subscribers");
    const r = await sendNewsletterCampaign(data.subject, data.body, recipients);
    await supabase.from("newsletter_campaigns").insert({
      subject: data.subject, body: data.body, sent_count: r.sent, failed_count: r.failed, sent_by: userId,
    });
    await logActivity(supabase, userId, "newsletter_sent", "newsletter", null, { subject: data.subject, sent: r.sent, failed: r.failed });
    return { sent: r.sent, failed: r.failed, logged: r.logged, test: false };
  });

export const adminListCampaigns = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase
      .from("newsletter_campaigns")
      .select("id, subject, sent_count, failed_count, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

// ---------- product variants ----------
export const adminListVariants = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: rows, error } = await supabase
      .from("product_variants")
      // "*" so compare_at_price is included once its migration is applied
      .select("*")
      .eq("product_id", data.productId)
      .order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

const variantSchema = z.object({
  id: z.string().uuid().optional(),
  product_id: z.string().uuid(),
  name: z.string().trim().max(80).optional().or(z.literal("")),
  sku: z.string().trim().max(80).optional().or(z.literal("")),
  price: z.number().min(0).nullable(),
  stock: z.number().int().min(0),
  weight_grams: z.number().int().min(0).nullable().optional(),
  is_active: z.boolean().default(true),
  option_values: z.record(z.string()).optional(),
  image_url: z.string().url().max(500).nullable().optional().or(z.literal("")),
});

export const adminUpsertVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => variantSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    // Option values (e.g. size / colour) must match the variant axes of the
    // product's categories; every axis is required when the product has axes.
    const { data: links } = await supabase.from("product_categories").select("category_id").eq("product_id", data.product_id);
    const applicable = await loadApplicableAttributes(supabase, (links ?? []).map((l: any) => l.category_id));
    const hasAxes = applicable.some((a) => a.variant_axis);
    let optionValues: Record<string, string> = {};
    if (hasAxes || (data.option_values && Object.keys(data.option_values).length)) {
      const result = validateVariantOptions(data.option_values ?? {}, applicable);
      if (Object.keys(result.errors).length) throw new Error(attributeErrorMessage(result.errors));
      await saveNewOptions(supabase, applicable, result.newOptions);
      optionValues = result.values as Record<string, string>;
    }
    const name = data.name || Object.values(optionValues).join(" / ");
    if (!name) throw new Error("Variant name is required");
    const row = {
      product_id: data.product_id,
      name,
      sku: data.sku || null,
      price: data.price,
      stock: data.stock,
      weight_grams: data.weight_grams ?? null,
      is_active: data.is_active,
      option_values: optionValues,
      image_url: data.image_url || null,
    };
    if (data.id) {
      const { error } = await supabase.from("product_variants").update(row).eq("id", data.id).eq("product_id", data.product_id);
      if (error) throw new Error(error.message);
      await logActivity(supabase, userId, "update", "product_variant", data.id, row);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("product_variants").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "create", "product_variant", ins.id, row);
    return { id: ins.id };
  });

export const adminDeleteVariant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    // Past order lines keep their name/price snapshot (variant_id becomes null).
    const { error } = await supabase.from("product_variants").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(supabase, userId, "delete", "product_variant", data.id);
    return { ok: true };
  });
