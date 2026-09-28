// Header / footer / announcement settings, read from store_settings (admin →
// Settings) with safe defaults, so the site still renders before the Phase 2
// migration is applied. Pure (unit-tested in site-settings.test.ts).
import { useQuery } from "@tanstack/react-query";
import { storeSettingsQueryOptions } from "@/lib/feature-flags";
import { WHATSAPP_NUMBER } from "@/lib/schools-data";

export type Announcement = { text: string; href: string | null };
export type SocialKey = "facebook" | "instagram" | "youtube" | "tiktok" | "x";
export const SOCIAL_KEYS: SocialKey[] = ["facebook", "instagram", "youtube", "tiktok", "x"];
export const SOCIAL_LABELS: Record<SocialKey, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  youtube: "YouTube",
  tiktok: "TikTok",
  x: "X",
};
export type ThemePreset = "brand" | "teal";

export type SiteSettings = {
  storeName: string;
  logoUrl: string | null;
  theme: ThemePreset;
  announcementEnabled: boolean;
  announcements: Announcement[];
  announcementInterval: number;
  phone: string | null;
  supportHours: string | null;
  email: string | null;
  address: string | null;
  whatsapp: { number: string; hours: string | null; message: string };
  social: Partial<Record<SocialKey, string>>;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
  newsletterHeading: string;
  newsletterText: string;
  poweredBy: { text: string; url: string | null } | null;
  pickup: { enabled: boolean; address: string | null };
};

const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Only http(s) links or same-site paths are used (no "javascript:" etc.). */
export function safeHref(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  if (s.startsWith("/") && !s.startsWith("//")) return s;
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null;
  } catch {
    return null;
  }
}

export function parseSiteSettings(raw: unknown): SiteSettings {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const storeName = str(r.store_name) ?? "SchoolBooksExperts";
  const list = Array.isArray(r.announcements) ? r.announcements : [];
  const announcements = list
    .map((a) => (a && typeof a === "object" ? (a as Record<string, unknown>) : {}))
    .map((a) => ({ text: str(a.text) ?? "", href: safeHref(a.href) }))
    .filter((a) => a.text)
    .slice(0, 10);
  const socialRaw = (
    r.social_links && typeof r.social_links === "object" ? r.social_links : {}
  ) as Record<string, unknown>;
  const social: Partial<Record<SocialKey, string>> = {};
  for (const k of SOCIAL_KEYS) {
    const h = safeHref(socialRaw[k]);
    if (h && !h.startsWith("/")) social[k] = h;
  }
  const interval = Number(r.announcement_interval_seconds);
  const wa = str(r.whatsapp_number)?.replace(/\D/g, "");
  const poweredText = str(r.powered_by_text);
  return {
    storeName,
    logoUrl: safeHref(r.logo_url),
    theme: r.theme_preset === "teal" ? "teal" : "brand",
    announcementEnabled: r.announcement_enabled !== false,
    announcements: announcements.length
      ? announcements
      : [{ text: `Welcome to ${storeName}`, href: null }],
    announcementInterval: Number.isFinite(interval) ? Math.min(60, Math.max(2, interval)) : 5,
    phone: str(r.contact_phone),
    supportHours: str(r.support_hours),
    email: str(r.contact_email),
    address: str(r.address),
    whatsapp: {
      number: wa && wa.length >= 10 && wa.length <= 15 ? wa : WHATSAPP_NUMBER,
      hours: str(r.whatsapp_hours),
      message: str(r.whatsapp_message) ?? `Hi ${storeName}, I have a question.`,
    },
    social,
    appStoreUrl: safeHref(r.app_store_url),
    playStoreUrl: safeHref(r.play_store_url),
    newsletterHeading: str(r.newsletter_heading) ?? "Subscribe to our Newsletter",
    newsletterText:
      str(r.newsletter_text) ??
      "Get new arrivals, offers and back-to-school reminders in your inbox.",
    poweredBy: poweredText ? { text: poweredText, url: safeHref(r.powered_by_url) } : null,
    pickup: { enabled: r.pickup_enabled === true, address: str(r.pickup_address) },
  };
}

/** wa.me link with the pre-filled message. */
export function whatsappHref(number: string, message?: string | null) {
  return `https://wa.me/${number}${message ? `?text=${encodeURIComponent(message)}` : ""}`;
}

/** `tel:` link (spaces and dashes removed). */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;

export function useSiteSettings(): SiteSettings {
  const { data } = useQuery(storeSettingsQueryOptions);
  return parseSiteSettings(data);
}
