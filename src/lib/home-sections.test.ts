import { describe, expect, it } from "vitest";
import { parseHomeSections, parsePriceBands, priceBandHref } from "./home-sections";

describe("homepage sections", () => {
  it("keeps the saved order, drops unknown keys, appends missing ones", () => {
    const r = parseHomeSections([{ key: "best_sellers", enabled: true }, { key: "junk" }, { key: "categories", enabled: false }]);
    expect(r.map((s) => `${s.key}:${s.enabled}`)).toEqual([
      "best_sellers:true", "categories:false", "new_arrivals:true", "recently_added:true", "price_bands:true",
    ]);
    expect(parseHomeSections(null)).toHaveLength(5);
  });
});

describe("price bands", () => {
  it("validates bands and links to /shop with the price filter", () => {
    const bands = parsePriceBands([
      { label: "Under Rs. 500", min: null, max: 500 },
      { label: "5,000+", min: 5000, max: null },
      { label: "bad", min: 900, max: 100 },
      { label: "", min: 1, max: 2 },
    ]);
    expect(bands.map((b) => b.label)).toEqual(["Under Rs. 500", "5,000+"]);
    expect(priceBandHref(bands[0])).toBe("/shop?max=500");
    expect(priceBandHref(bands[1])).toBe("/shop?min=5000");
    expect(priceBandHref({ label: "x", min: 500, max: 1000 })).toBe("/shop?min=500&max=1000");
  });
});
