import { describe, expect, it } from "vitest";
import { ctx, headerOf, product, row } from "./test-fixtures";
import type { ExistingVariant, MappedRow, ProductPlan } from "./types";
import { planProducts } from "./validate-products";
import { planVariants } from "./validate-variants";

const costume = product({
  id: "c1",
  slug: "spiderman-costume",
  sku: "COS-SPIDEY",
  category_ids: ["costumes"],
});
const noSku = product({ id: "c2", slug: "batman-costume", sku: null, category_ids: ["costumes"] });
const book = product({ id: "b1", slug: "book", sku: "BK-1", category_ids: ["books"] });
const variant = (
  v: Partial<ExistingVariant> & { id: string; product_id: string },
): ExistingVariant => ({
  sku: null,
  name: "x",
  option_values: {},
  price: null,
  compare_at_price: null,
  stock: 0,
  image_url: null,
  is_active: true,
  ...v,
});
const existingVariants = [
  variant({
    id: "v1",
    product_id: "c1",
    sku: "SPIDEY-6-RED",
    option_values: { clothing_size: "6-7Y", colour: "Red" },
  }),
  variant({
    id: "v2",
    product_id: "c1",
    sku: null,
    option_values: { clothing_size: "4-5Y", colour: "Gold" },
  }), // Gold since deactivated
];
const plan = (rows: MappedRow[], productPlans: ProductPlan[] = []) =>
  planVariants(rows, ctx, [costume, noSku, book], existingVariants, productPlans, {
    headerOf: headerOf([...new Set(rows.flatMap((r) => Object.keys(r.values)))]),
  });
const messages = (p: { issues: { message: string }[] }) =>
  p.issues.map((i) => i.message).join("\n");

describe("variants sheet", () => {
  it("new variant: options matched case-insensitively, name from the options, blank price = product price", () => {
    const [p] = plan([
      row({
        product_sku: "COS-SPIDEY",
        variant_sku: "SPIDEY-8-BLUE",
        "option:clothing_size": "8-9y",
        "option:colour": "blue",
        stock: "4",
        price: null,
      }),
    ]);
    expect(p.status).toBe("ok");
    expect(p.action).toBe("create");
    expect(p.payload).toMatchObject({
      id: null,
      product_id: "c1",
      set: {
        option_values: { clothing_size: "8-9Y", colour: "Blue" },
        name: "8-9Y / Blue",
        sku: "SPIDEY-8-BLUE",
        stock: 4,
      },
    });
    expect(p.payload!.set).not.toHaveProperty("price");
  });
  it("upsert by variant_sku, otherwise by product + options", () => {
    const [bySku, byCombo] = plan([
      row({ product_sku: "COS-SPIDEY", variant_sku: "SPIDEY-6-RED", stock: "9" }, 2),
      row(
        {
          product_sku: "COS-SPIDEY",
          "option:clothing_size": "4-5Y",
          "option:colour": "Gold",
          stock: "1",
        },
        3,
      ),
    ]);
    expect(bySku).toMatchObject({ action: "update", payload: { id: "v1", set: { stock: 9 } } });
    expect(byCombo).toMatchObject({ action: "update", status: "ok", payload: { id: "v2" } }); // deactivated option still accepted as stored
  });
  it("products without a SKU are found by product_slug even when product_sku is an empty column (export round trip)", () => {
    const [p] = plan([
      row({
        product_sku: null,
        product_slug: "batman-costume",
        "option:clothing_size": "6-7Y",
        "option:colour": "Red",
      }),
    ]);
    expect(p.status).toBe("ok");
    expect(p.payload!.product_id).toBe("c2");
  });
  it("errors: unknown product, invalid option, missing option, product without variant options, SKU of another product", () => {
    const ps = plan([
      row({ product_sku: "NOPE", "option:colour": "Red" }, 2),
      row({ product_sku: "COS-SPIDEY", "option:clothing_size": "XXL", "option:colour": "Red" }, 3),
      row({ product_sku: "COS-SPIDEY", "option:clothing_size": "6-7Y" }, 4),
      row({ product_sku: "BK-1", "option:colour": "Red" }, 5),
      row(
        {
          product_sku: "COS-SPIDEY",
          variant_sku: "SPIDEY-6-RED",
          "option:clothing_size": "4-5Y",
          "option:colour": "Blue",
        },
        6,
      ),
    ]);
    expect(messages(ps[0])).toMatch(/Product "NOPE" not found/);
    expect(messages(ps[1])).toMatch(/"XXL" is not an allowed Size/);
    expect(messages(ps[2])).toMatch(/Colour is required for each variant/);
    expect(messages(ps[3])).toMatch(/have no variant options such as size or colour/);
    expect(ps[4].status).toBe("ok"); // same product's SKU = update of v1 with new options
    const other = planVariants(
      [row({ product_sku: "BK-1", variant_sku: "SPIDEY-6-RED" }, 7)],
      ctx,
      [costume, book],
      existingVariants,
      [],
      { headerOf: {} },
    );
    expect(messages(other[0])).toMatch(/already used by a variant of "spiderman-costume"/);
  });
  it("duplicates in the file", () => {
    const ps = plan([
      row(
        {
          product_sku: "COS-SPIDEY",
          variant_sku: "V-1",
          "option:clothing_size": "8-9Y",
          "option:colour": "Red",
        },
        2,
      ),
      row(
        {
          product_sku: "COS-SPIDEY",
          variant_sku: "V-1",
          "option:clothing_size": "8-9Y",
          "option:colour": "Blue",
        },
        3,
      ),
      row({ product_sku: "COS-SPIDEY", "option:clothing_size": "8-9Y", "option:colour": "Red" }, 4),
    ]);
    expect(messages(ps[0])).toMatch(/variant_sku "V-1" is also in row 3/);
    expect(messages(ps[0])).toMatch(/same product \+ options combination is also in row 4/);
  });
  it("parent created by the Products sheet of the same file", () => {
    const products = planProducts(
      [
        row(
          { sku: "COS-NEW", name: "Superman", categories: "character-costumes", price: "2500" },
          2,
        ),
      ],
      ctx,
      [],
      {
        matchBy: "auto",
        createMissingCategories: false,
        headerOf: {},
      },
    );
    const [p] = plan(
      [row({ product_sku: "COS-NEW", "option:clothing_size": "6-7Y", "option:colour": "Red" }, 2)],
      products,
    );
    expect(p).toMatchObject({ status: "ok", parentInFile: true, action: "create" });
    expect(p.payload!.product_id).toBeNull(); // resolved on the server after the products are saved
  });
});
