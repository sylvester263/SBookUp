import { describe, expect, it } from "vitest";
import { looksLikeVariants, resolveHeaders } from "./headers";
import { ctx } from "./test-fixtures";

describe("header matching", () => {
  it("normalises case, spaces, underscores and line breaks", () => {
    const r = resolveHeaders(
      ["Name", " SALE PRICE ", "Sale\nPrice", "stock_quantity", "Weight (g)"],
      "products",
      ctx.definitions,
    );
    expect(r.columns.map((c) => c.field)).toEqual([
      "name",
      "sale_price",
      null,
      "stock_quantity",
      "weight_grams",
    ]);
    expect(r.duplicates).toEqual(["Sale\nPrice"]);
  });
  it("accepts old and human column names", () => {
    const r = resolveHeaders(
      [
        "Product Name",
        "Category",
        "category_slug",
        "Stock",
        "Image URL",
        "image_url_1",
        "Barcode",
        "Cost",
        "Status",
      ],
      "products",
      ctx.definitions,
    );
    expect(r.columns.map((c) => c.field)).toEqual([
      "name",
      "categories",
      null,
      "stock_quantity",
      "images",
      "image:1",
      "isbn",
      "cost_price",
      "is_active",
    ]);
    expect(r.duplicates).toEqual(["category_slug"]);
  });
  it("maps attribute columns by attr_<key>, key, label, legacy author / publisher, and color = colour", () => {
    const r = resolveHeaders(
      ["attr_paper_size", "Age Group", "author", "Color", "attr_nope", "Size"],
      "products",
      ctx.definitions,
    );
    expect(r.columns.map((c) => c.field)).toEqual([
      "attr:paper_size",
      "attr:age_group",
      "attr:author",
      "attr:colour",
      null,
      null,
    ]);
    expect(r.unknown).toEqual(["attr_nope"]);
    expect(r.ambiguous).toEqual(["Size"]); // paper size or clothing size
  });
  it("variant sheets: option columns, and Size means the variant axis", () => {
    const r = resolveHeaders(
      ["product_sku", "SKU", "Size", "option_colour", "Qty"],
      "variants",
      ctx.definitions,
    );
    expect(r.columns.map((c) => c.field)).toEqual([
      "product_sku",
      "variant_sku",
      "option:clothing_size",
      "option:colour",
      "stock",
    ]);
    expect(r.headerOf["option:clothing_size"]).toBe("Size");
  });
  it("tells a variants sheet from a products sheet", () => {
    expect(looksLikeVariants(["product_sku", "variant_sku", "option_colour"])).toBe(true);
    expect(looksLikeVariants(["sku", "name", "categories"])).toBe(false);
  });
});
