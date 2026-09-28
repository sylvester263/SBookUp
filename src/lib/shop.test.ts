import { describe, expect, it } from "vitest";
import { activeChips, ancestry, buildCatalogParams, categoryHref, cleanFilters, parseShopSearch, toggleValue, type NavCategory } from "./shop";

const cat = (id: string, slug: string, parent_id: string | null, display_order = 0): NavCategory => ({
  id, name: slug.replace(/-/g, " "), slug, parent_id, display_order, show_in_nav: true, show_on_home: false,
  image_url: null, description: null, seo_title: null, seo_description: null,
});
const cats = [cat("1", "stationery", null), cat("2", "notebooks", "1"), cat("3", "a5-notebooks", "2")];

describe("filter query builder", () => {
  it("builds catalog_search params from the URL (defaults, price, types, attribute + variant filters)", () => {
    expect(buildCatalogParams("character-costumes", {
      sort: "price_asc", page: 2, min: 500, max: 2500, type: ["boys"], f: { clothing_size: ["6-7Y"], colour: ["Red", "Blue"], gender: [] },
    })).toEqual({
      category: "character-costumes", q: null, sort: "price_asc", page: 2, per_page: 24, min_price: 500, max_price: 2500,
      types: ["boys"], filters: { clothing_size: ["6-7Y"], colour: ["Red", "Blue"] }, only: null,
    });
    expect(buildCatalogParams(undefined, {})).toMatchObject({ category: null, sort: "new_arrivals", page: 1, types: null, filters: {}, min_price: null });
    expect(buildCatalogParams(undefined, {}, { only: "best_sellers", perPage: 12 })).toMatchObject({ only: "best_sellers", per_page: 12 });
  });

  it("parses messy URLs safely", () => {
    expect(parseShopSearch({ sort: "hack", page: -3, min: 100, f: { age_group: ["6-8"] } })).toEqual({ min: 100, f: { age_group: ["6-8"] } });
  });

  it("drops filters that don't exist in the new category", () => {
    expect(cleanFilters({ colour: ["Red"], subjects: ["5"] }, ["subjects", "binding_type"])).toEqual({ subjects: ["5"] });
    expect(cleanFilters({ colour: ["Red"] }, ["subjects"])).toBeUndefined();
  });

  it("toggles values and builds removable chips", () => {
    expect(toggleValue(["A"], "B")).toEqual(["A", "B"]);
    expect(toggleValue(["A"], "A")).toBeUndefined();
    const chips = activeChips(
      { type: ["notebooks"], f: { binding_type: ["Spiral", "Stitched"] }, min: 500 },
      { types: [{ value: "notebooks", label: "Notebooks", count: 3 }], facets: [{ key: "binding_type", label: "Binding Type", type: "select", is_variant_axis: false, options: [{ value: "Spiral", label: "Spiral", count: 2 }] }] },
    );
    expect(chips.map((c) => c.label)).toEqual(["Type: Notebooks", "Binding Type: Spiral", "Binding Type: Stitched", "Price: From Rs. 500"]);
    expect(chips[1].patch).toEqual({ f: { binding_type: ["Stitched"] }, page: undefined });
    expect(chips[3].patch).toEqual({ min: undefined, max: undefined, page: undefined });
  });
});

describe("category paths", () => {
  it("builds breadcrumbs and canonical /shop URLs", () => {
    expect(ancestry(cats, "a5-notebooks").map((c) => c.slug)).toEqual(["stationery", "notebooks", "a5-notebooks"]);
    expect(categoryHref(cats, "stationery")).toBe("/shop/stationery");
    expect(categoryHref(cats, "notebooks")).toBe("/shop/stationery/notebooks");
    expect(categoryHref(cats, "a5-notebooks")).toBe("/shop/notebooks/a5-notebooks");
  });
});
