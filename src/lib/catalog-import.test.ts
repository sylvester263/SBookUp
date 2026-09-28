import { describe, expect, it } from "vitest";
import { comboKey, effectiveAttributesFor, validateProductRow, validateVariantRow, variantCombinations, type CatalogContext } from "./catalog-import";

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

describe("product CSV rows", () => {
  it("imports a book with categories (primary first) and attributes", () => {
    const r = validateProductRow({ name: "Peer-e-Kamil", categories: "novels|books", price: "1,200", attr_author: "Umera Ahmed", attr_age_group: "9-12" }, 2, ctx);
    expect(r.errors).toEqual([]);
    expect(r.slug).toBe("peer-e-kamil");
    expect(r.categoryIds).toEqual(["novels", "books"]);
    expect(r.record).toMatchObject({ price: 1200, category_id: "novels", sell_unit: "item", pack_size: null, attributes: { author: "Umera Ahmed", age_group: "9-12" } });
  });

  it("prefills pack pricing from the category and accepts a new author", () => {
    const wrap = validateProductRow({ name: "Floral Wrap", categories: "gift-wrapping-sheets", price: "600", attr_paper_size: "A3" }, 3, ctx);
    expect(wrap.errors).toEqual([]);
    expect(wrap.record).toMatchObject({ sell_unit: "pack", pack_size: 6, unit_label: "sheet" });
    const book = validateProductRow({ name: "Raja Gidh", categories: "books", price: "900", author: "Bano Qudsia" }, 4, ctx);
    expect(book.newOptions).toEqual({ author: ["Bano Qudsia"] });
  });

  it("reports every problem on the row", () => {
    const r = validateProductRow({ name: "", categories: "books|nope", price: "abc", stock_quantity: "-1", attr_age_group: "99", attr_colour: "Red", sell_unit: "box" }, 5, ctx);
    expect(r.errors.join("\n")).toMatch(/name is required/);
    expect(r.errors.join("\n")).toMatch(/unknown category "nope"/);
    expect(r.errors.join("\n")).toMatch(/price must be a number/);
    expect(r.errors.join("\n")).toMatch(/stock_quantity must be a whole number/);
    expect(r.errors.join("\n")).toMatch(/attr_age_group/);
    expect(r.errors.join("\n")).toMatch(/attr_colour.*not an attribute/);
    expect(r.errors.join("\n")).toMatch(/sell_unit/);
  });

  it("checks sale price and ISBN like the old importer", () => {
    const r = validateProductRow({ name: "X", categories: "books", price: "500", sale_price: "600", isbn: "abc" }, 7, ctx);
    expect(r.errors).toContain("sale_price must be less than price");
    expect(r.errors).toContain("isbn format is invalid");
    expect(validateProductRow({ name: "Y", categories: "books", price: "500", category_slug: "x", isbn: "978-969-35-0000-1" }, 8, ctx).errors).toEqual([]);
  });

  it("requires a pack size for packs without a category default", () => {
    const r = validateProductRow({ name: "Folders", categories: "books", price: "100", sell_unit: "pack" }, 6, ctx);
    expect(r.errors).toContain("pack_size is required when sell_unit is pack");
  });
});

describe("variant CSV rows + matrix", () => {
  const costume = { id: "p1", categoryIds: ["costumes"] };
  it("validates option columns against the variant axes", () => {
    const ok = validateVariantRow({ product_sku: "SPIDEY", variant_sku: "SPIDEY-6-RED", option_clothing_size: "6-7Y", option_colour: "Red", stock: "4", price: "" }, 2, costume, ctx);
    expect(ok.errors).toEqual([]);
    expect(ok.record).toMatchObject({ price: null, stock: 4, option_values: { clothing_size: "6-7Y", colour: "Red" }, name: "6-7Y / Red" });
    const bad = validateVariantRow({ product_sku: "SPIDEY", option_clothing_size: "XXL" }, 3, costume, ctx);
    expect(bad.errors.join("\n")).toMatch(/option_clothing_size.*not an allowed option/);
    expect(bad.errors.join("\n")).toMatch(/option_colour.*required/);
    const missing = validateVariantRow({ product_sku: "NOPE" }, 4, null, ctx);
    expect(missing.errors).toContain('product "NOPE" not found');
  });

  it("generates every size × colour combination", () => {
    const combos = variantCombinations([{ key: "clothing_size", values: ["4-5Y", "6-7Y"] }, { key: "colour", values: ["Red", "Blue", "Green"] }]);
    expect(combos).toHaveLength(6);
    expect(new Set(combos.map(comboKey)).size).toBe(6);
    expect(comboKey({ colour: "Red", clothing_size: "4-5Y" })).toBe(comboKey({ clothing_size: "4-5Y", colour: "Red" }));
    expect(variantCombinations([{ key: "colour", values: [] }])).toEqual([]);
  });
});
