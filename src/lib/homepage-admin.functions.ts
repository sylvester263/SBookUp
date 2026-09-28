// Admin: homepage sections (Admin → Homepage). Staff (admin or manager) only;
// row-level security enforces the same. Config is validated per section type
// (src/lib/homepage-sections.ts).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertStaff, logActivity } from "@/lib/admin-helpers";
import { validateSection } from "@/lib/homepage-sections";

const COLUMNS =
  "id,type,title,subtitle,config,sort_order,is_active,starts_at,ends_at,seed_key,created_at,updated_at";

const friendly = (message: string) =>
  /relation .*homepage_sections.* does not exist/i.test(message)
    ? "The homepage builder needs the database update 20260928120000_homepage_sections.sql."
    : message;

export const adminListHomeSections = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data, error } = await supabase
      .from("homepage_sections")
      .select(COLUMNS)
      .order("sort_order")
      .order("created_at");
    if (error) throw new Error(friendly(error.message));
    return data ?? [];
  });

export const adminSaveHomeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => validateSection(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { id, ...fields } = data;
    const row = { ...fields, config: data.config as never };
    if (id) {
      const { error } = await supabase.from("homepage_sections").update(row).eq("id", id);
      if (error) throw new Error(friendly(error.message));
      await logActivity(supabase, userId, "update", "homepage_section", id, row);
      return { id };
    }
    // New sections go to the end
    const { data: last } = await supabase
      .from("homepage_sections")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data: ins, error } = await supabase
      .from("homepage_sections")
      .insert({ ...row, sort_order: (last?.sort_order ?? 0) + 10 })
      .select("id")
      .single();
    if (error) throw new Error(friendly(error.message));
    await logActivity(supabase, userId, "create", "homepage_section", ins.id, row);
    return { id: ins.id };
  });

/** Saves a new order: ids top to bottom. */
export const adminReorderHomeSections = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ ids: z.array(z.string().uuid()).min(1).max(200) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    for (const [i, id] of data.ids.entries()) {
      const { error } = await supabase
        .from("homepage_sections")
        .update({ sort_order: (i + 1) * 10 })
        .eq("id", id);
      if (error) throw new Error(friendly(error.message));
    }
    await logActivity(supabase, userId, "reorder", "homepage_section", null, { ids: data.ids });
    return { ok: true };
  });

/** Quick on/off from the list. */
export const adminToggleHomeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), is_active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await supabase
      .from("homepage_sections")
      .update({ is_active: data.is_active })
      .eq("id", data.id);
    if (error) throw new Error(friendly(error.message));
    await logActivity(
      supabase,
      userId,
      data.is_active ? "activate" : "deactivate",
      "homepage_section",
      data.id,
      null,
    );
    return { ok: true };
  });

/** Copies a section (switched off, placed right after the original). */
export const adminDuplicateHomeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { data: src, error } = await supabase
      .from("homepage_sections")
      .select(COLUMNS)
      .eq("id", data.id)
      .single();
    if (error) throw new Error(friendly(error.message));
    const { data: ins, error: e2 } = await supabase
      .from("homepage_sections")
      .insert({
        type: src.type,
        title: src.title ? `${src.title} (copy)` : null,
        subtitle: src.subtitle,
        config: src.config,
        sort_order: src.sort_order + 1,
        is_active: false,
        starts_at: src.starts_at,
        ends_at: src.ends_at,
      })
      .select("id")
      .single();
    if (e2) throw new Error(friendly(e2.message));
    await logActivity(supabase, userId, "duplicate", "homepage_section", ins.id, { from: data.id });
    return { id: ins.id };
  });

export const adminDeleteHomeSection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    const { error } = await supabase.from("homepage_sections").delete().eq("id", data.id);
    if (error) throw new Error(friendly(error.message));
    await logActivity(supabase, userId, "delete", "homepage_section", data.id, null);
    return { ok: true };
  });

/** Product picker: search by name / SKU, or load specific products (to show the picked ones). */
export const adminPickProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        q: z.string().trim().max(80).optional(),
        ids: z.array(z.string().uuid()).max(48).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertStaff(supabase, userId);
    let q = supabase.from("products").select("id,name,slug,sku,images,price,is_active");
    if (data.ids?.length) q = q.in("id", data.ids);
    else if (data.q) {
      const like = `%${data.q.replace(/[%_\\,()]/g, " ")}%`;
      q = q.or(`name.ilike.${like},sku.ilike.${like}`);
    }
    const { data: rows, error } = await q.order("name").limit(data.ids?.length ? 48 : 20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
