import { describe, expect, test } from "vitest";
import {
  firstProductSources,
  isSchoolLink,
  priceRangeHref,
  readableTextOn,
  sectionSource,
  visibleBanners,
} from "@/lib/homepage-render";
import { defaultSectionRows } from "@/lib/homepage-default";
import { emptyBanner } from "@/lib/homepage-sections";

describe("school features", () => {
  test("school-page links are hidden while school features are off", () => {
    expect(isSchoolLink({ type: "url", href: "/schools" })).toBe(true);
    expect(isSchoolLink({ type: "listing", href: "/bundles?x=1" })).toBe(true);
    expect(isSchoolLink({ type: "category", slug: "books" })).toBe(false);
    const school = {
      ...emptyBanner(),
      link: { type: "url" as const, href: "/schools/beaconhouse" },
    };
    const books = { ...emptyBanner(), link: { type: "category" as const, slug: "books" } };
    expect(visibleBanners([school, books], false)).toEqual([books]);
    expect(visibleBanners([school, books], true)).toHaveLength(2);
  });
});

describe("tiles and price bar", () => {
  test("readable text colour on the tile colour", () => {
    expect(readableTextOn("#0E7C7B")).toBe("#FFFFFF");
    expect(readableTextOn("#FFF3B8")).toBe("#111111");
    expect(readableTextOn("#3D5A98")).toBe("#FFFFFF");
    expect(readableTextOn("nope")).toBe("#FFFFFF");
  });
  test("price range links", () => {
    expect(priceRangeHref({ min: null, max: 500 })).toBe("/shop?max=500");
    expect(priceRangeHref({ min: 500, max: 1000 })).toBe("/shop?min=500&max=1000");
    expect(priceRangeHref({ min: 5000, max: null })).toBe("/shop?min=5000");
  });
});

describe("default layout (fallback)", () => {
  const rows = defaultSectionRows();
  test("inactive sections (the app banner) are left out", () => {
    expect(rows.some((r) => r.type === "app_banner")).toBe(false);
    expect(rows[0].type).toBe("hero_slider");
  });
  test("product sources, and the first two loaded on the server", () => {
    expect(rows.map(sectionSource).filter(Boolean)).toHaveLength(7);
    expect(firstProductSources(rows)).toEqual([
      { source: { type: "new_arrivals" }, limit: 12 },
      { source: { type: "category", slug: "books" }, limit: 12 },
    ]);
  });
});
