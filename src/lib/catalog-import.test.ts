import { describe, expect, it } from "vitest";
import { comboKey, effectiveAttributesFor, variantCombinations, type CatalogContext } from "./catalog-import";
// Importer row validation is tested in src/lib/import/*.test.ts.

const opts = (...v: string[]) => v.map((x, i) => ({ value: x, label: x, sort: i + 1 }));
const ctx: CatalogContext = {
  categories: [
    { id: "books", slug: "books", parent_id: null },
    { id: "novels", slug: "novels", parent_id: "books" },
    { id: "gifts", slug: "gifts", parent_id: null },
    { id: "wrap", slug: "gift-wrapping-sheets", parent_id: "gifts", default_sell_unit: "pack", default_pack_size: 6, default_unit_label: "sheet" },
    { id: "costumes", slug: "character-costumes", parent_id: null },
  ],
  definitions: [
    { id: "a1", key: "author", label: "Author", type: "select", options: opts("Umera Ahmed"), allow_new_options: true },
    { id: "a2", key: "age_group", label: "Age Group", type: "select", options: opts("6-8", "9-12") },
    { id: "a3", key: "paper_size", label: "Size", type: "select", options: opts("A4", "A3") },
    { id: "a4", key: "clothing_size", label: "Size", type: "select", options: opts("4-5Y", "6-7Y") },
    { id: "a5", key: "colour", label: "Colour", type: "select", options: opts("Red", "Blue"), allow_new_options: true },
    { id: "a6", key: "gender", label: "Gender", type: "select", options: opts("Boys", "Girls") },
  ],
  categoryAttributes: [
    { category_id: "books", attribute_id: "a1", is_required: false, is_variant_axis: false, sort_order: 1 },
    { category_id: "books", attribute_id: "a2", is_required: false, is_variant_axis: false, sort_order: 2 },
    { category_id: "wrap", attribute_id: "a3", is_required: false, is_variant_axis: false, sort_order: 1 },
    { category_id: "costumes", attribute_id: "a6", is_required: false, is_variant_axis: false, sort_order: 1 },
    { category_id: "costumes", attribute_id: "a4", is_required: true, is_variant_axis: true, sort_order: 2 },
    { category_id: "costumes", attribute_id: "a5", is_required: true, is_variant_axis: true, sort_order: 3 },
  ],
};

describe("attribute inheritance", () => {
  it("child categories inherit their parents' attributes", () => {
    const keys = effectiveAttributesFor(["novels"], ctx).map((a) => [a.key, a.inherited]);
    expect(keys).toEqual([["author", true], ["age_group", true]]);
  });
});

describe("variant matrix", () => {
  it("generates every size × colour combination", () => {
    const combos = variantCombinations([{ key: "clothing_size", values: ["4-5Y", "6-7Y"] }, { key: "colour", values: ["Red", "Blue", "Green"] }]);
    expect(combos).toHaveLength(6);
    expect(new Set(combos.map(comboKey)).size).toBe(6);
    expect(comboKey({ colour: "Red", clothing_size: "4-5Y" })).toBe(comboKey({ clothing_size: "4-5Y", colour: "Red" }));
    expect(variantCombinations([{ key: "colour", values: [] }])).toEqual([]);
  });
});
