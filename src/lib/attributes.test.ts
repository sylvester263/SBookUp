import { describe, expect, it } from "vitest";
import { mergeApplicable, validateProductAttributes, validateVariantOptions, withNewOptions, type EffectiveAttribute } from "./attributes";
import { formatPackPrice, packLabel } from "./pricing";

const opt = (...v: string[]) => v.map((x, i) => ({ value: x, label: x, sort: i + 1 }));
const def = (d: Partial<EffectiveAttribute> & Pick<EffectiveAttribute, "key" | "type">): EffectiveAttribute => ({
  id: d.key, label: d.key, options: [], is_required: false, variant_axis: false, ...d,
});

const books = [
  def({ key: "age_group", type: "select", label: "Age Group", options: opt("3-5", "6-8") }),
  def({ key: "author", type: "select", label: "Author", options: opt("Umera Ahmed"), allow_new_options: true }),
  def({ key: "pages", type: "number", label: "Pages" }),
  def({ key: "season", type: "select", label: "Season", options: opt("2026-27 Session"), is_required: true }),
];
const costumes = [
  def({ key: "gender", type: "select", label: "Gender", options: opt("Boys", "Girls", "Unisex") }),
  def({ key: "clothing_size", type: "select", label: "Size", options: opt("4-5Y", "6-7Y"), variant_axis: true }),
  def({ key: "colour", type: "select", label: "Colour", options: opt("Red", "Blue"), variant_axis: true, allow_new_options: true }),
];

describe("product attribute validation", () => {
  it("accepts valid values and coerces numbers", () => {
    const r = validateProductAttributes({ age_group: "6-8", pages: "120", season: "2026-27 Session" }, books);
    expect(r.errors).toEqual({});
    expect(r.values).toEqual({ age_group: "6-8", pages: 120, season: "2026-27 Session" });
  });

  it("rejects unknown keys, bad options, bad numbers and missing required values", () => {
    const r = validateProductAttributes({ age_group: "99+", pages: "many", colour: "Red" }, books);
    expect(Object.keys(r.errors).sort()).toEqual(["age_group", "colour", "pages", "season"]);
    expect(r.errors.season).toMatch(/required/);
    expect(r.errors.colour).toMatch(/not an attribute/);
  });

  it("collects new options for admin-addable attributes (e.g. a new author)", () => {
    const r = validateProductAttributes({ author: "Bano Qudsia", season: "2026-27 Session" }, books);
    expect(r.errors).toEqual({});
    expect(r.newOptions).toEqual({ author: ["Bano Qudsia"] });
    expect(withNewOptions(books[1], ["Bano Qudsia", "Umera Ahmed"]).map((o) => o.value)).toEqual(["Umera Ahmed", "Bano Qudsia"]);
  });

  it("ignores variant axes at product level", () => {
    const r = validateProductAttributes({ gender: "Girls" }, costumes);
    expect(r.errors).toEqual({});
    expect(r.values).toEqual({ gender: "Girls" });
  });

  it("drops empty values instead of storing them", () => {
    expect(validateProductAttributes({ age_group: "", pages: null, season: "2026-27 Session" }, books).values).toEqual({ season: "2026-27 Session" });
  });
});

describe("variant option validation", () => {
  it("requires every axis with an allowed value", () => {
    expect(validateVariantOptions({ clothing_size: "6-7Y", colour: "Red" }, costumes).errors).toEqual({});
    const r = validateVariantOptions({ clothing_size: "XXL" }, costumes);
    expect(r.errors.clothing_size).toMatch(/not an allowed option/);
    expect(r.errors.colour).toMatch(/required/);
  });
  it("allows new colours (admin-addable) and rejects non-axis keys", () => {
    const r = validateVariantOptions({ clothing_size: "4-5Y", colour: "Gold", gender: "Boys" }, costumes);
    expect(r.newOptions).toEqual({ colour: ["Gold"] });
    expect(r.errors.gender).toMatch(/not a variant option/);
  });
});

describe("multi-category merge", () => {
  it("unions attributes; required/axis if any category says so", () => {
    const merged = mergeApplicable([
      [def({ key: "gender", type: "select", sort_order: 2 })],
      [def({ key: "gender", type: "select", is_required: true, sort_order: 2 }), def({ key: "age_group", type: "select", sort_order: 1 })],
    ]);
    expect(merged.map((m) => m.key)).toEqual(["age_group", "gender"]);
    expect(merged.find((m) => m.key === "gender")?.is_required).toBe(true);
  });
});

describe("pack pricing display", () => {
  it("shows per-pack and per-unit prices", () => {
    expect(formatPackPrice(600, { sell_unit: "pack", pack_size: 6, unit_label: "sheet" })).toBe("Rs. 600 / pack of 6 (Rs. 100 per sheet)");
    expect(formatPackPrice(1200, { sell_unit: "pack", pack_size: 12, unit_label: "folder" })).toBe("Rs. 1,200 / pack of 12 (Rs. 100 per folder)");
    expect(formatPackPrice(450, { sell_unit: "item" })).toBe("Rs. 450");
    expect(packLabel({ sell_unit: "pack", pack_size: 6 })).toBe("Pack of 6");
    expect(packLabel({ sell_unit: "pack", pack_size: null })).toBe("");
  });
});
