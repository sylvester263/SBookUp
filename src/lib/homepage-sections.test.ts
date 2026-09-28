import { describe, expect, test } from "vitest";
import {
  SECTION_TYPES,
  defaultConfig,
  parseConfig,
  sectionStatus,
  sourceSearchParams,
  validateSection,
  viewAllHref,
} from "@/lib/homepage-sections";

const section = (type: string, config: unknown, extra: Record<string, unknown> = {}) => ({
  type,
  title: "T",
  subtitle: null,
  is_active: true,
  starts_at: null,
  ends_at: null,
  config,
  ...extra,
});
const img = { src: "https://cdn.example.com/a.webp", width: 1920, height: 700 };

describe("validateSection", () => {
  test("every type's default config is valid", () => {
    for (const t of SECTION_TYPES)
      expect(() => validateSection(section(t, defaultConfig(t))), t).not.toThrow();
  });

  test("alt text is required when a banner has an image", () => {
    const cfg = { slides: [{ image: img, alt: "", heading: "Hi" }], interval_seconds: 5 };
    expect(() => validateSection(section("hero_slider", cfg))).toThrow(/Alt text is required/);
    cfg.slides[0].alt = "Kids with notebooks";
    expect(validateSection(section("hero_slider", cfg)).config).toMatchObject({
      slides: [{ alt: "Kids with notebooks", mobile_image: null, link: null }],
    });
  });

  test("unsafe links and images are refused", () => {
    const banner = { image: null, alt: "", link: { type: "url", href: "javascript:alert(1)" } };
    expect(() => validateSection(section("app_banner", { banner }))).toThrow();
    expect(() =>
      validateSection(
        section("app_banner", {
          banner: { ...banner, link: { type: "listing", href: "https://evil.com" } },
        }),
      ),
    ).toThrow(/must start with \//);
    expect(() =>
      validateSection(
        section("hero_slider", {
          slides: [{ image: { ...img, src: "data:image/png;base64,x" }, alt: "x" }],
        }),
      ),
    ).toThrow();
  });

  test("product sources", () => {
    expect(() =>
      validateSection(
        section("product_carousel", { source: { type: "category", slug: "" }, limit: 12 }),
      ),
    ).toThrow(/Choose a category/);
    expect(() =>
      validateSection(
        section("product_carousel", { source: { type: "manual", product_ids: ["nope"] } }),
      ),
    ).toThrow();
    expect(
      validateSection(section("product_carousel", { source: { type: "on_sale" } })).config,
    ).toEqual({ source: { type: "on_sale" }, limit: 12 });
    expect(() =>
      validateSection(section("product_carousel", { source: { type: "best_sellers" }, limit: 99 })),
    ).toThrow();
  });

  test("tiles, pairs and price ranges keep their shape", () => {
    expect(() =>
      validateSection(
        section("promo_tiles", { tiles: defaultConfig("promo_tiles").tiles.slice(0, 2) }),
      ),
    ).toThrow();
    const tiles = defaultConfig("promo_tiles").tiles.map((t) => ({ ...t, color: "red" }));
    expect(() => validateSection(section("promo_tiles", { tiles }))).toThrow(/colour/);
    expect(() =>
      validateSection(
        section("banner_pair", { banners: [defaultConfig("banner_pair").banners[0]] }),
      ),
    ).toThrow();
    expect(() =>
      validateSection(section("price_bar", { ranges: [{ label: "Bad", min: 500, max: 100 }] })),
    ).toThrow(/Max must be above min/);
  });

  test("schedule: end must be after start; unknown types refused", () => {
    expect(() =>
      validateSection(
        section("price_bar", defaultConfig("price_bar"), {
          starts_at: "2026-10-02T00:00:00Z",
          ends_at: "2026-10-01T00:00:00Z",
        }),
      ),
    ).toThrow(/end date/);
    expect(() => validateSection(section("carousel_3d", {}))).toThrow();
  });
});

describe("parseConfig (storefront)", () => {
  test("bad stored data falls back to the defaults instead of crashing", () => {
    expect(parseConfig("price_bar", { ranges: "nope" })).toEqual(defaultConfig("price_bar"));
    expect(parseConfig("product_carousel", { source: { type: "best_sellers" } })).toEqual({
      source: { type: "best_sellers" },
      limit: 12,
    });
  });
});

describe("sectionStatus (same rule as the public read policy)", () => {
  const now = new Date("2026-10-01T12:00:00Z");
  test.each([
    [{ is_active: false, starts_at: null, ends_at: null }, "off"],
    [{ is_active: true, starts_at: null, ends_at: null }, "live"],
    [{ is_active: true, starts_at: "2026-10-02T00:00:00Z", ends_at: null }, "scheduled"],
    [{ is_active: true, starts_at: null, ends_at: "2026-10-01T12:00:00Z" }, "ended"],
    [
      { is_active: true, starts_at: "2026-09-30T00:00:00Z", ends_at: "2026-10-05T00:00:00Z" },
      "live",
    ],
  ] as const)("%o → %s", (s, want) => expect(sectionStatus(s, now)).toBe(want));
});

describe("sources", () => {
  const cats = [
    { id: "s", slug: "stationery", parent_id: null },
    { id: "n", slug: "notebooks", parent_id: "s" },
  ];
  test("View all links", () => {
    expect(viewAllHref({ type: "category", slug: "notebooks" }, cats)).toBe(
      "/shop/stationery/notebooks",
    );
    expect(viewAllHref({ type: "on_sale" })).toBe("/shop?on_sale=true");
    expect(viewAllHref({ type: "best_sellers" })).toBe("/shop?sort=%22best_sellers%22");
    expect(viewAllHref({ type: "manual", product_ids: [] })).toBeNull();
  });
  test("catalog_search requests", () => {
    expect(sourceSearchParams({ type: "category", slug: "books" }, 12)).toMatchObject({
      category: "books",
      only: null,
      per_page: 12,
    });
    expect(sourceSearchParams({ type: "best_sellers" }, 8)).toMatchObject({
      only: "best_sellers",
      sort: "best_sellers",
      per_page: 8,
    });
    expect(sourceSearchParams({ type: "on_sale" }, 12)).toMatchObject({ only: "on_sale" });
    expect(sourceSearchParams({ type: "new_arrivals" }, 12)).toMatchObject({
      only: "new_arrivals",
    });
  });
});
