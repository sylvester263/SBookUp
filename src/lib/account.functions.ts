import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// ---------- Profile ----------
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  });

const profileUpdateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  phone: z.string().trim().regex(/^\+92\d{10}$/, "Phone must be +92XXXXXXXXXX").optional().or(z.literal("")),
  school_name: z.string().trim().max(120).optional().or(z.literal("")),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileUpdateSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { name?: string; phone?: string | null; school_name?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name;
    if (data.phone !== undefined) patch.phone = data.phone || null;
    if (data.school_name !== undefined) patch.school_name = data.school_name || null;
    const { error } = await supabase.from("profiles").update(patch).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateNotificationPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      school_reminders: z.boolean(),
      newsletter: z.boolean(),
      order_updates: z.boolean(),
      promotions: z.boolean(),
      restock_alerts: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("profiles").update({ notification_prefs: data }).eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Addresses ----------
export const listAddresses = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase.from("addresses").select("*").order("is_default", { ascending: false }).order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

const addressSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().max(40).optional().or(z.literal("")),
  street: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().max(80).optional().or(z.literal("")),
  postal_code: z.string().trim().max(20).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^\+92\d{10}$/).optional().or(z.literal("")),
  is_default: z.boolean().default(false),
});

export const upsertAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => addressSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (data.is_default) {
      await supabase.from("addresses").update({ is_default: false }).eq("user_id", userId);
    }
    const row = {
      user_id: userId,
      label: data.label || null,
      street: data.street,
      city: data.city,
      province: data.province || null,
      postal_code: data.postal_code || null,
      phone: data.phone || null,
      is_default: data.is_default,
    };
    if (data.id) {
      const { error } = await supabase.from("addresses").update(row).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { id: data.id };
    }
    const { data: ins, error } = await supabase.from("addresses").insert(row).select("id").single();
    if (error) throw new Error(error.message);
    return { id: ins.id };
  });

export const deleteAddress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("addresses").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- Wishlist ----------
export const listWishlist = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("wishlist")
      .select("id, product_id, products:product_id(id, name, slug, price, sale_price, images, author, brand, isbn)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const toggleWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ product_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase.from("wishlist").select("id").eq("user_id", userId).eq("product_id", data.product_id).maybeSingle();
    if (existing) {
      await supabase.from("wishlist").delete().eq("id", existing.id);
      return { in_list: false };
    }
    await supabase.from("wishlist").insert({ user_id: userId, product_id: data.product_id });
    return { in_list: true };
  });

// ---------- Orders ----------
export const listOrders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, payment_status, payment_method, total, created_at, order_items(id, name_snapshot, quantity)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getOrderById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: order, error } = await supabase
      .from("orders")
      .select("*, order_items(*)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return order;
  });

export const cancelOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    // cancel_my_order() checks ownership + status, restocks once and releases the coupon.
    const { error } = await context.supabase.rpc("cancel_my_order", { p_order_id: data.id });
    if (error) throw new Error(error.message);
    const { notifyOrderStatus } = await import("@/lib/email/notify.server");
    await notifyOrderStatus(data.id, "cancelled");
    return { ok: true };
  });

// ---------- Cart check (current prices + stock per line) ----------
export type CartLineCheck = {
  index: number;
  available_for_sale: boolean;
  name: string | null;
  unit_price: number | null;
  available: number;
  sell_unit?: string | null;
  pack_size?: number | null;
};

export const checkCart = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      items: z.array(z.object({
        product_id: z.string().uuid().optional(),
        variant_id: z.string().uuid().optional(),
        bundle_id: z.string().uuid().optional(),
        school_bundle_id: z.string().uuid().optional(),
        quantity: z.number().int().min(1).max(99),
      })).max(100),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    if (!data.items.length) return [] as CartLineCheck[];
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("cart_lines", { p_items: data.items });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as CartLineCheck[];
  });

// ---------- Place order ----------
// Prices, stock, coupon, shipping and tax are all decided by the database
// functions quote_order() / place_order(). The browser only sends ids + quantities.
const cartItemsSchema = z.array(
  z.object({
    product_id: z.string().uuid().optional(),
    variant_id: z.string().uuid().optional(),
    bundle_id: z.string().uuid().optional(),
    school_bundle_id: z.string().uuid().optional(),
    quantity: z.number().int().min(1).max(50),
  }),
).min(1).max(100);

const paymentMethodSchema = z.enum(["cod", "jazzcash", "easypaisa", "bank_transfer"]);

export type OrderQuote = {
  lines: { product_id: string | null; variant_id: string | null; bundle_id: string | null; school_bundle_id: string | null; name: string; unit_price: number; quantity: number; subtotal: number; sell_unit?: string | null; pack_size?: number | null; unit_label?: string | null; variant_options?: Record<string, string> | null }[];
  subtotal: number;
  discount: number;
  delivery_fee: number;
  cod_fee: number;
  shipping: number;
  tax_rate: number;
  tax: number;
  total: number;
  coupon_code: string | null;
  coupon_type: "percentage" | "fixed" | "free_shipping" | null;
  coupon_error: string | null;
  free_shipping: boolean;
  zone_name: string;
  eta_days: number;
  weight_grams: number;
};

export const quoteOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      items: cartItemsSchema,
      city: z.string().trim().max(80).optional(),
      payment_method: paymentMethodSchema.default("cod"),
      coupon_code: z.string().trim().max(40).optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: quote, error } = await supabaseAdmin.rpc("quote_order", {
      p_items: data.items,
      p_city: data.city || undefined,
      p_payment_method: data.payment_method,
      p_coupon_code: data.coupon_code || undefined,
    });
    if (error) throw new Error(error.message);
    return quote as unknown as OrderQuote;
  });

const checkoutSchema = z.object({
  items: cartItemsSchema,
  shipping_address: z.object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().regex(/^\+92\d{10}$/),
    street: z.string().trim().min(3).max(200),
    city: z.string().trim().min(2).max(80),
    province: z.string().trim().max(80).optional(),
    postal_code: z.string().trim().max(20).optional(),
  }),
  payment_method: paymentMethodSchema,
  coupon_code: z.string().trim().max(40).optional(),
  notes: z.string().max(500).optional(),
});

export const placeOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checkoutSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Called with the customer's own token so auth.uid() is the buyer.
    const { data: res, error } = await context.supabase.rpc("place_order", {
      p_items: data.items,
      p_shipping_address: data.shipping_address,
      p_payment_method: data.payment_method,
      p_coupon_code: data.coupon_code || undefined,
      p_notes: data.notes || undefined,
    });
    if (error) throw new Error(error.message);
    const r = res as unknown as { order_id: string; order_number: string; total: number };
    // Confirmation to the customer + alert to the store (best-effort, never throws).
    const { notifyOrderPlaced } = await import("@/lib/email/notify.server");
    await notifyOrderPlaced(r.order_id);
    return { order_id: r.order_id, order_number: r.order_number };
  });

// ---------- Order confirmation page / bank-transfer proof ----------
export const getMyOrderByNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderNumber: z.string().trim().min(3).max(60) }).parse(d))
  .handler(async ({ data, context }) => {
    // RLS: customers only see their own orders.
    const { data: order, error } = await context.supabase
      .from("orders")
      .select("id, order_number, status, payment_method, payment_status, payment_proof_uploaded_at, total, created_at")
      .eq("order_number", data.orderNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return order;
  });

export const attachPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orderId: z.string().uuid(), path: z.string().min(10).max(300) }).parse(d))
  .handler(async ({ data, context }) => {
    // attach_payment_proof() checks ownership, payment method and that the file is
    // inside the customer's own folder, then marks the order pending_verification.
    const { error } = await context.supabase.rpc("attach_payment_proof", { p_order_id: data.orderId, p_path: data.path });
    if (error) throw new Error(error.message);
    return { ok: true };
  });
