import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// School features (bundles, school pages) are hidden unless switched on in Settings.
async function schoolFeaturesOn(supabaseAdmin: any): Promise<boolean> {
  const { data } = await supabaseAdmin.from("store_settings").select("school_features_enabled").eq("id", true).maybeSingle();
  return data?.school_features_enabled === true;
}

// ---------- contact ----------
const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(255),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  subject: z.string().trim().max(160).optional().or(z.literal("")),
  message: z.string().trim().min(1).max(4000),
});

export const submitContactMessage = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => contactSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("contact_messages").insert({
      name: data.name,
      email: data.email,
      phone: data.phone || null,
      subject: data.subject || null,
      message: data.message,
    });
    if (error) throw new Error(error.message);
    const { notifyContactAutoReply } = await import("@/lib/email/notify.server");
    await notifyContactAutoReply(data.email, data.name, data.subject || null);
    return { ok: true };
  });

// ---------- newsletter ----------
const newsletterSchema = z.object({
  email: z.string().trim().email().max(255),
  name: z.string().trim().max(120).optional().or(z.literal("")),
});

export const subscribeNewsletter = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => newsletterSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: existing } = await supabaseAdmin
      .from("newsletters")
      .select("id, unsubscribed_at")
      .eq("email", data.email)
      .maybeSingle();
    if (existing) {
      if (existing.unsubscribed_at) {
        await supabaseAdmin.from("newsletters").update({ unsubscribed_at: null, name: data.name || null }).eq("id", existing.id);
      }
      return { ok: true, alreadySubscribed: !existing.unsubscribed_at };
    }
    const { error } = await supabaseAdmin.from("newsletters").insert({ email: data.email, name: data.name || null });
    if (error) throw new Error(error.message);
    return { ok: true, alreadySubscribed: false };
  });

export const unsubscribeNewsletterByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("newsletters")
      .select("id, email, unsubscribed_at")
      .eq("unsubscribe_token", data.token)
      .maybeSingle();
    if (!row) return { ok: false, email: null as string | null };
    if (!row.unsubscribed_at) {
      await supabaseAdmin.from("newsletters").update({ unsubscribed_at: new Date().toISOString() }).eq("id", row.id);
    }
    return { ok: true, email: row.email };
  });

// ---------- track order ----------
const trackSchema = z.object({
  orderNumber: z.string().trim().min(3).max(60),
  email: z.string().trim().email().max(255),
});

export const trackOrder = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => trackSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: order, error } = await supabaseAdmin
      .from("orders")
      .select("id, order_number, status, payment_status, payment_method, tracking_number, total, created_at, updated_at, shipping_address, guest_email, user_id, order_items(id, quantity, name_snapshot)")
      .eq("order_number", data.orderNumber)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!order) return { found: false as const };
    const emailMatches =
      order.guest_email?.toLowerCase() === data.email.toLowerCase() ||
      (order.user_id
        ? !!(await supabaseAdmin.from("profiles").select("id").eq("id", order.user_id).eq("email", data.email).maybeSingle()).data
        : false);
    if (!emailMatches) return { found: false as const };
    return { found: true as const, order };
  });

// ---------- search suggestions ----------
const searchSchema = z.object({ q: z.string().trim().min(1).max(120) });

export const searchSuggestions = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => searchSchema.parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const q = data.q;
    const isIsbn = /^\d{10}$|^\d{13}$/.test(q.replace(/-/g, ""));
    const like = `%${q}%`;

    if (isIsbn) {
      const { data: byIsbn } = await supabaseAdmin
        .from("products").select("id, name, slug, images, isbn").eq("isbn", q.replace(/-/g, "")).eq("is_active", true).limit(8);
      return { isbn: true, products: byIsbn ?? [], bundles: [], categories: [], authors: [], publishers: [] as string[] };
    }

    const showBundles = await schoolFeaturesOn(supabaseAdmin);
    const [prod, bun, cat, auth] = await Promise.all([
      supabaseAdmin.from("products").select("id, name, slug, images").or(`name.ilike.${like},author.ilike.${like},publisher.ilike.${like},sku.ilike.${like}`).eq("is_active", true).limit(5),
      showBundles
        ? supabaseAdmin.from("bundles").select("id, name, slug").ilike("name", like).eq("is_active", true).limit(3)
        : Promise.resolve({ data: [] as { id: string; name: string; slug: string }[] }),
      supabaseAdmin.from("categories").select("id, name, slug").ilike("name", like).eq("is_active", true).limit(3),
      supabaseAdmin.from("products").select("author").ilike("author", like).not("author", "is", null).limit(20),
    ]);
    // Publishers (an attribute, mirrored in products.publisher) are suggested too
    const pub = await supabaseAdmin.from("products").select("publisher").ilike("publisher", like).not("publisher", "is", null).eq("is_active", true).limit(20);
    const publishers = Array.from(new Set((pub.data ?? []).map((r: any) => r.publisher).filter(Boolean))).slice(0, 3);
    const authors = Array.from(new Set((auth.data ?? []).map((r: any) => r.author).filter(Boolean))).slice(0, 3);
    return { isbn: false, products: prod.data ?? [], bundles: bun.data ?? [], categories: cat.data ?? [], authors, publishers };
  });

// ---------- reviews ----------
export const listReviewsForProduct = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("reviews")
      .select("id, rating, title, body, is_verified_purchase, user_id, created_at")
      .eq("product_id", data.productId)
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .limit(100);
    const ids = Array.from(new Set((rows ?? []).map((r: any) => r.user_id)));
    let nameMap = new Map<string, string>();
    if (ids.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, name").in("id", ids);
      (profs ?? []).forEach((p: any) => nameMap.set(p.id, p.name ?? "Customer"));
    }
    const reviews = (rows ?? []).map((r: any) => ({ ...r, author_name: nameMap.get(r.user_id) ?? "Customer" }));
    const breakdown = [5, 4, 3, 2, 1].map((star) => ({
      star,
      count: reviews.filter((r) => r.rating === star).length,
    }));
    const total = reviews.length;
    const average = total ? reviews.reduce((s, r) => s + r.rating, 0) / total : 0;
    return { reviews, breakdown, total, average };
  });

const reviewSchema = z.object({
  product_id: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  body: z.string().trim().max(2000).optional().or(z.literal("")),
});

export const submitReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => reviewSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    // status and is_verified_purchase are set by the database trigger
    // (guard_review_writes): new reviews are always 'pending', and "verified"
    // means the user has a delivered order containing this product.
    const { data: row, error } = await supabase
      .from("reviews")
      .insert({
        product_id: data.product_id,
        user_id: userId,
        rating: data.rating,
        title: data.title || null,
        body: data.body || null,
      })
      .select("is_verified_purchase")
      .single();
    if (error) throw new Error(error.message);
    const verified = !!row?.is_verified_purchase;
    return { ok: true, verified };
  });

// ---------- wishlist ----------
export const toggleWishlist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("wishlist").select("id").eq("user_id", userId).eq("product_id", data.productId).maybeSingle();
    if (existing) {
      await supabase.from("wishlist").delete().eq("id", existing.id);
      return { added: false };
    }
    const { error } = await supabase.from("wishlist").insert({ user_id: userId, product_id: data.productId });
    if (error) throw new Error(error.message);
    return { added: true };
  });

export const listMyWishlistIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("wishlist").select("product_id").eq("user_id", userId);
    return (data ?? []).map((r: any) => r.product_id as string);
  });

// ---------- sitemap data ----------
export const getSitemapEntries = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // Supabase returns at most 1000 rows per request, so page through products.
  const products: { slug: string; updated_at: string }[] = [];
  for (let from = 0; from < 50_000; from += 1000) {
    const { data } = await supabaseAdmin
      .from("products").select("slug, updated_at").eq("is_active", true)
      .order("slug").range(from, from + 999);
    products.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  const schoolFeatures = await schoolFeaturesOn(supabaseAdmin);
  const [categories, bundles, schools] = await Promise.all([
    supabaseAdmin.from("categories").select("id, slug, parent_id, updated_at").eq("is_active", true),
    schoolFeatures ? supabaseAdmin.from("bundles").select("slug, updated_at").eq("is_active", true) : Promise.resolve({ data: [] }),
    schoolFeatures ? supabaseAdmin.from("schools").select("slug, updated_at") : Promise.resolve({ data: [] }),
  ]);
  return {
    products,
    categories: categories.data ?? [],
    // Hidden school/bundle pages are left out while school features are off.
    bundles: (bundles.data ?? []) as { slug: string; updated_at: string }[],
    schools: (schools.data ?? []) as { slug: string; updated_at: string }[],
    schoolFeatures,
  };
});

// ---------- my review for a product ----------
export const getMyReviewForProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ productId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: row } = await supabase
      .from("reviews")
      .select("id, rating, title, body, status, reject_reason, created_at, moderated_at")
      .eq("user_id", userId)
      .eq("product_id", data.productId)
      .maybeSingle();
    return { review: row ?? null };
  });

// ---------- store settings (public) ----------
export const getStoreSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin.from("store_settings").select("*").eq("id", true).maybeSingle();
  return (
    data ?? {
      id: true,
      store_name: "SchoolBooksExperts",
      contact_email: "info@schoolbooksexperts.com",
      contact_phone: "+92 300 0000000",
      address: "Lahore, Pakistan",
      currency: "PKR",
      tax_rate: 0,
      meta_title: "SchoolBooksExperts — A Complete Family Store, Lahore Since 1968",
      meta_description: "Shop books, stationery, uniforms, toys, baby items and party supplies.",
      sender_name: "SchoolBooksExperts",
      sender_email: "orders@schoolbooksexperts.com",
      school_features_enabled: false,
    }
  );
});
