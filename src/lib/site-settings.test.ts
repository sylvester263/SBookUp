import { describe, expect, test } from "vitest";
import { parseSiteSettings, safeHref, telHref, whatsappHref } from "@/lib/site-settings";
import { siteChromeSchema } from "@/lib/site-settings.functions";
import {
  citiesFromZones,
  deliveryEstimate,
  parseDeliveryChoice,
  zoneForCity,
  type DeliveryZone,
} from "@/lib/delivery-location";
import { parseShopSearch, buildCatalogParams, activeChips, clearAllPatch } from "@/lib/shop";

describe("parseSiteSettings", () => {
  test("defaults when settings are missing (e.g. before the migration)", () => {
    const s = parseSiteSettings(undefined);
    expect(s.storeName).toBe("SchoolBooksExperts");
    expect(s.theme).toBe("brand");
    expect(s.announcementEnabled).toBe(true);
    expect(s.announcements).toEqual([{ text: "Welcome to SchoolBooksExperts", href: null }]);
    expect(s.whatsapp.number).toMatch(/^\d{10,15}$/);
    expect(s.social).toEqual({});
    expect(s.appStoreUrl).toBeNull();
    expect(s.poweredBy).toBeNull();
    expect(s.pickup.enabled).toBe(false);
    expect(s.copyright).toBe("© 2026 SchoolBooksExperts. All Rights Reserved.");
  });

  test("reads the admin settings and drops unsafe links", () => {
    const s = parseSiteSettings({
      store_name: "Acme Books",
      theme_preset: "teal",
      announcement_interval_seconds: 1,
      announcements: [
        { text: "Deals", href: "/shop?on_sale=true" },
        { text: "Bad", href: "javascript:alert(1)" },
        { text: "" },
      ],
      whatsapp_number: "92 300 1234567",
      social_links: {
        facebook: "https://facebook.com/x",
        instagram: "javascript:x",
        youtube: "/local",
      },
      app_store_url: "https://apps.apple.com/x",
      powered_by_text: "Powered by Acme",
      powered_by_url: "ftp://x",
    });
    expect(s.theme).toBe("teal");
    expect(s.announcements).toEqual([
      { text: "Deals", href: "/shop?on_sale=true" },
      { text: "Bad", href: null },
    ]);
    expect(s.announcementInterval).toBe(2);
    expect(s.whatsapp.number).toBe("923001234567");
    expect(s.whatsapp.message).toContain("Acme Books");
    expect(s.social).toEqual({ facebook: "https://facebook.com/x" });
    expect(s.appStoreUrl).toBe("https://apps.apple.com/x");
    expect(s.poweredBy).toEqual({ text: "Powered by Acme", url: null });
    expect(s.copyright).toBe("© 2026 Acme Books. All Rights Reserved.");
    expect(parseSiteSettings({ footer_text: " © Custom line " }).copyright).toBe("© Custom line");
  });

  test("link helpers", () => {
    expect(safeHref("//evil.com")).toBeNull();
    expect(safeHref("/faq")).toBe("/faq");
    expect(whatsappHref("923001234567", "Hi there")).toBe(
      "https://wa.me/923001234567?text=Hi%20there",
    );
    expect(telHref("+92 300-123 4567")).toBe("tel:+923001234567");
  });
});

describe("admin Header & Footer validation", () => {
  const base = {
    theme_preset: "brand",
    announcement_enabled: true,
    announcements: [],
    announcement_interval_seconds: 5,
    support_hours: "",
    whatsapp_number: "",
    whatsapp_hours: "",
    whatsapp_message: "",
    social_links: { facebook: "", instagram: "", youtube: "", tiktok: "", x: "" },
    app_store_url: "",
    play_store_url: "",
    newsletter_heading: "",
    newsletter_text: "",
    powered_by_text: "",
    powered_by_url: "",
    pickup_enabled: false,
    pickup_address: "",
  };
  test("empty strings become null; WhatsApp number is normalised", () => {
    const r = siteChromeSchema.parse({ ...base, whatsapp_number: "+92 300 1234567" });
    expect(r.whatsapp_number).toBe("923001234567");
    expect(r.support_hours).toBeNull();
    expect(r.social_links.facebook).toBeNull();
  });
  test("refuses unsafe or malformed values", () => {
    expect(siteChromeSchema.safeParse({ ...base, whatsapp_number: "12" }).success).toBe(false);
    expect(
      siteChromeSchema.safeParse({ ...base, app_store_url: "javascript:alert(1)" }).success,
    ).toBe(false);
    expect(
      siteChromeSchema.safeParse({ ...base, announcements: [{ text: "Hi", href: "//evil.com" }] })
        .success,
    ).toBe(false);
    expect(siteChromeSchema.safeParse({ ...base, theme_preset: "pink" }).success).toBe(false);
    expect(
      siteChromeSchema.safeParse({ ...base, announcements: [{ text: "Hi", href: "/shop" }] })
        .success,
    ).toBe(true);
  });
});

describe("delivery location", () => {
  const zones: DeliveryZone[] = [
    {
      id: "z1",
      name: "Lahore",
      cities: ["Lahore"],
      estimated_days: 1,
      base_rate: 150,
      free_shipping_threshold: 2000,
    },
    {
      id: "z2",
      name: "Punjab",
      cities: ["Multan", " Faisalabad ", "lahore"],
      estimated_days: 3,
      base_rate: 250,
      free_shipping_threshold: null,
    },
  ];
  test("cities are unique, trimmed and sorted; matching is case-insensitive", () => {
    expect(citiesFromZones(zones).map((c) => `${c.city}:${c.zone.id}`)).toEqual([
      "Faisalabad:z2",
      "Lahore:z1",
      "Multan:z2",
    ]);
    expect(zoneForCity(zones, " MULTAN ")?.id).toBe("z2");
    expect(zoneForCity(zones, "Karachi")).toBeNull();
  });
  test("estimate text", () => {
    expect(deliveryEstimate(zones[0])).toBe("Delivery in 1 day");
    expect(deliveryEstimate(zones[1])).toBe("Delivery in 3 days");
    expect(deliveryEstimate(null)).toBeNull();
  });
  test("stored choice is validated", () => {
    expect(parseDeliveryChoice({ method: "delivery", city: " Lahore ", zoneId: "z1" })).toEqual({
      method: "delivery",
      city: "Lahore",
      zoneId: "z1",
    });
    expect(parseDeliveryChoice({ method: "pickup" })).toEqual({ method: "pickup" });
    expect(parseDeliveryChoice({ method: "delivery", city: "" })).toBeNull();
    expect(parseDeliveryChoice("x")).toBeNull();
  });
});

describe("Shop Deals URL", () => {
  test("on_sale=true scopes the search to deals and shows a removable chip", () => {
    const s = parseShopSearch({ on_sale: true });
    expect(s.on_sale).toBe(true);
    expect(parseShopSearch({ on_sale: "true" }).on_sale).toBe(true);
    expect(parseShopSearch({ on_sale: "yes" }).on_sale).toBeUndefined();
    expect(buildCatalogParams(undefined, s).only).toBe("on_sale");
    expect(buildCatalogParams(undefined, {}).only).toBeNull();
    const chip = activeChips(s, undefined).find((c) => c.key === "on_sale");
    expect(chip?.patch.on_sale).toBeUndefined();
    expect("on_sale" in clearAllPatch).toBe(true);
  });
});
