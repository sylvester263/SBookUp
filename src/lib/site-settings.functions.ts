// Admin: header / footer / announcement settings (Settings → Header & Footer).
// Kept apart from adminUpdateStoreSettings so the other tabs keep saving on a
// database without the Phase 2 migration. Admin only.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertAdmin, logActivity } from "@/lib/admin-helpers";

/** http(s) URL, or empty (= not set). */
const url = z
  .string()
  .trim()
  .max(500)
  .refine((v) => v === "" || /^https?:\/\//i.test(v), "Must start with https://")
  .transform((v) => v || null);
/** Same-site path ("/shop") or http(s) URL, or empty. */
const link = z
  .string()
  .trim()
  .max(500)
  .refine(
    (v) => v === "" || (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//i.test(v),
    "Use a path like /shop or a full https:// link",
  )
  .transform((v) => v || null);
const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => v || null);

export const siteChromeSchema = z.object({
  theme_preset: z.enum(["brand", "teal"]),
  announcement_enabled: z.boolean(),
  announcements: z
    .array(
      z.object({ text: z.string().trim().min(1, "Message text is required").max(160), href: link }),
    )
    .max(10),
  announcement_interval_seconds: z.number().int().min(2).max(60),
  support_hours: text(120),
  whatsapp_number: z
    .string()
    .trim()
    .transform((v) => v.replace(/[\s+()-]/g, ""))
    .refine(
      (v) => v === "" || /^[0-9]{10,15}$/.test(v),
      "WhatsApp number: country code + number, digits only (e.g. 923001234567)",
    )
    .transform((v) => v || null),
  whatsapp_hours: text(120),
  whatsapp_message: text(300),
  social_links: z.object({ facebook: url, instagram: url, youtube: url, tiktok: url, x: url }),
  app_store_url: url,
  play_store_url: url,
  newsletter_heading: text(80),
  newsletter_text: text(200),
  powered_by_text: text(80),
  powered_by_url: url,
  pickup_enabled: z.boolean(),
  pickup_address: text(300),
});
export type SiteChromeInput = z.input<typeof siteChromeSchema>;

export const adminUpdateSiteChrome = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => siteChromeSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    // Only set social links are stored
    const social_links = Object.fromEntries(Object.entries(data.social_links).filter(([, v]) => v));
    const patch = { ...data, social_links };
    const { error } = await supabase
      .from("store_settings")
      .upsert({ id: true, ...patch }, { onConflict: "id" });
    if (error) {
      throw new Error(
        /column .* does not exist/i.test(error.message)
          ? "These settings need the latest database update (migration 20260928110100_site_chrome_settings.sql)."
          : error.message,
      );
    }
    await logActivity(supabase, userId, "site_chrome_update", "settings", null, patch, null);
    return { ok: true };
  });
