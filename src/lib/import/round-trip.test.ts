// Export → (Excel) → re-import must give zero errors and change nothing.
import { describe, expect, it } from "vitest";
import {
  exportProductRows,
  productAttributeKeys,
  type ExportProduct,
  type ExportVariant,
} from "./export-rows";
import { resolveHeaders } from "./headers";
import { isBlankRow, mapRows } from "./map-rows";
import { readWorkbook } from "./read-workbook";
import { ctx } from "./test-fixtures";
import type { ExistingProduct, ExistingVariant } from "./types";
import { planProducts } from "./validate-products";
import { planVariants } from "./validate-variants";
import { buildErrorReportWorkbook, buildExportWorkbook, buildTemplateWorkbook } from "./xlsx-write";

const base: Omit<ExportProduct, "name" | "slug" | "category_ids"> = {
  sku: null,
  isbn: null,
  brand: null,
  edition: null,
  description: null,
  price: 100,
  sale_price: null,
  cost_price: null,
  stock_quantity: 0,
  low_stock_threshold: 5,
  weight_grams: null,
  sell_unit: "item",
  pack_size: null,
  unit_label: null,
  is_active: true,
  is_featured: false,
  is_new_arrival: false,
  new_arrival_until: null,
  tags: [],
  images: [],
  attributes: {},
};
// Includes every awkward case found in the audit.
const products: (ExportProduct & { id: string })[] = [
  {
    ...base,
    id: "p1",
    name: "Peer-e-Kamil",
    slug: "peer-e-kamil",
    sku: "00123",
    isbn: "9789690000001",
    price: 1250,
    sale_price: 999,
    cost_price: 700,
    description: "<p>Novel</p>\nLine 2",
    category_ids: ["novels", "books"],
    attributes: { author: "Umera Ahmed", languages: ["English", "Urdu"] },
    images: ["https://cdn.test/a.webp", "https://cdn.test/b.webp"],
    tags: ["urdu", "novel"],
    new_arrival_until: "2026-12-31",
    is_new_arrival: true,
  },
  {
    ...base,
    id: "p2",
    name: "پیرِ کامل",
    slug: "item-0abc123",
    category_ids: ["books"],
    is_active: false,
  },
  {
    ...base,
    id: "p3",
    name: "Eid Bag",
    slug: "eid-bag",
    sku: "BAG-1",
    category_ids: ["bags"],
    attributes: { colour: "Red", occasion: "Eid" },
  },
  {
    ...base,
    id: "p4",
    name: "Floral Wrap",
    slug: "floral-wrap",
    sku: "WRAP-1",
    price: 600,
    sell_unit: "pack",
    pack_size: 6,
    unit_label: "sheet",
    category_ids: ["wrap"],
  },
  { ...base, id: "p5", name: "Orphan", slug: "orphan", category_ids: [] },
  {
    ...base,
    id: "p6",
    name: "Odd",
    slug: "odd",
    sku: "ODD",
    price: 100,
    sale_price: 100,
    isbn: "ISBN 12",
    category_ids: ["notebooks"],
    attributes: { author: "Kept from old category", binding_type: "Spiral" },
  },
  {
    ...base,
    id: "p7",
    name: "Gold bag",
    slug: "gold-bag",
    sku: "BAG-2",
    category_ids: ["bags"],
    attributes: { colour: "Gold" },
  }, // deactivated option
  {
    ...base,
    id: "p8",
    name: "Same ISBN A",
    slug: "same-isbn-a",
    isbn: "9780000000002",
    category_ids: ["books"],
  },
  {
    ...base,
    id: "p9",
    name: "Same ISBN B",
    slug: "same-isbn-b",
    isbn: "9780000000002",
    category_ids: ["books"],
  },
];
const variants: ExportVariant[] = [
  {
    product_sku: null,
    product_slug: "batman",
    sku: null,
    name: "6-7Y / Red",
    price: null,
    compare_at_price: 2500,
    stock: 3,
    is_active: true,
    image_url: null,
    option_values: { clothing_size: "6-7Y", colour: "Red" },
  },
];
const existing: ExistingProduct[] = [
  ...products.map(
    ({
      id,
      name,
      slug,
      sku,
      isbn,
      price,
      sale_price,
      sell_unit,
      pack_size,
      unit_label,
      attributes,
      images,
      category_ids,
    }) => ({
      id,
      name,
      slug,
      sku,
      isbn,
      price,
      sale_price,
      sell_unit,
      pack_size,
      unit_label,
      attributes: attributes ?? {},
      images: images ?? [],
      category_ids,
    }),
  ),
  {
    id: "c2",
    name: "Batman",
    slug: "batman",
    sku: null,
    isbn: null,
    price: 2000,
    sale_price: null,
    sell_unit: "item",
    pack_size: null,
    unit_label: null,
    attributes: {},
    images: [],
    category_ids: ["costumes"],
  },
];
const existingVariants: ExistingVariant[] = [
  {
    id: "v1",
    product_id: "c2",
    sku: null,
    name: "6-7Y / Red",
    option_values: { clothing_size: "6-7Y", colour: "Red" },
    price: null,
    compare_at_price: 2500,
    stock: 3,
    image_url: null,
    is_active: true,
  },
];

describe("export → re-import", () => {
  it("gift-bag colour is exported (product attribute in that category)", () => {
    expect(productAttributeKeys(ctx)).toContain("colour");
    const sheet = exportProductRows(ctx, products);
    const row = sheet.rows[2];
    expect(row[sheet.headers.indexOf("attr_colour")]).toBe("Red");
  });

  it("an exported .xlsx imports again with zero errors and no changes", async () => {
    const { wb } = await buildExportWorkbook(ctx, products, variants);
    const data = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const read = readWorkbook(data, "export.xlsx");

    const ph = resolveHeaders(read.products!.headers, "products", ctx.definitions);
    expect(ph.unknown).toEqual([]);
    const pRows = mapRows(read.products!.rows, ph).filter((r) => !isBlankRow(r));
    const plans = planProducts(pRows, ctx, existing, {
      matchBy: "auto",
      createMissingCategories: false,
      headerOf: ph.headerOf,
    });
    const errors = plans.flatMap((p) => p.issues.filter((i) => i.level === "error"));
    expect(errors).toEqual([]);
    expect(plans.every((p) => p.action === "update")).toBe(true);
    expect(plans.map((p) => p.productId)).toEqual(products.map((p) => p.id));
    // Leading zero SKU and the full ISBN survived Excel.
    expect(pRows[0].values.sku).toBe("00123");
    expect(pRows[0].values.isbn).toBe("9789690000001");
    // Nothing that would change data: same values, same categories, same images.
    for (const p of plans) {
      expect(p.payload!.category_ids).toBeNull();
      expect(p.payload!.attributes_unset).toEqual([]);
      expect(p.images === null || p.images.join("|") === p.existingImages.join("|")).toBe(true);
    }
    expect(plans[0].payload!.attributes_set).toEqual({});
    expect(plans[0].payload!.set).toMatchObject({
      price: 1250,
      sale_price: 999,
      cost_price: 700,
      description: "<p>Novel</p>\nLine 2",
      new_arrival_until: "2026-12-31",
      tags: ["urdu", "novel"],
    });

    const vh = resolveHeaders(read.variants!.headers, "variants", ctx.definitions);
    const vRows = mapRows(read.variants!.rows, vh);
    const vPlans = planVariants(vRows, ctx, existing, existingVariants, plans, {
      headerOf: vh.headerOf,
    });
    expect(vPlans.flatMap((p) => p.issues.filter((i) => i.level === "error"))).toEqual([]);
    expect(vPlans[0]).toMatchObject({ action: "update", payload: { id: "v1", product_id: "c2" } });
  });

  it("the template has Products / Variants / Instructions sheets, Text-formatted codes and dropdowns", async () => {
    const wb = await buildTemplateWorkbook(ctx);
    expect(wb.worksheets.map((w) => w.name)).toEqual([
      "Products",
      "Variants",
      "Instructions",
      "Lists",
    ]);
    const ws = wb.getWorksheet("Products")!;
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers.slice(0, 4)).toEqual(["sku", "name", "slug", "categories"]);
    expect(headers).toContain("attr_colour");
    expect(ws.getColumn(1).numFmt).toBe("@");
    expect(ws.getColumn(headers.indexOf("isbn") + 1).numFmt).toBe("@");
    // One example row per active category; the importer skips them.
    const data = (await wb.xlsx.writeBuffer()) as ArrayBuffer;
    const read = readWorkbook(data, "template.xlsx");
    expect(read.products!.rows).toHaveLength(
      ctx.categories.filter((c) => c.is_active !== false).length,
    );
    const h = resolveHeaders(read.products!.headers, "products", ctx.definitions);
    const plans = planProducts(mapRows(read.products!.rows, h), ctx, [], {
      matchBy: "auto",
      createMissingCategories: false,
      headerOf: h.headerOf,
    });
    expect(plans.every((p) => p.status === "skipped")).toBe(true);
    expect(
      Object.keys(
        (ws as unknown as { dataValidations: { model: Record<string, unknown> } }).dataValidations
          .model,
      ).length,
    ).toBeGreaterThan(3);
  });

  it("the error report keeps the original row and adds errors / warnings columns", async () => {
    const wb = await buildErrorReportWorkbook([
      {
        name: "Products",
        headers: ["sku", "name", "price"],
        textColumns: [1],
        rows: [
          {
            rowNumber: 7,
            cells: ["00123", "Pen", "abc"],
            issues: [
              {
                row: 7,
                column: "price",
                value: "abc",
                message: 'price must be a number (got "abc")',
                level: "error",
              },
            ],
          },
        ],
      },
    ]);
    const ws = wb.getWorksheet("Products")!;
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual([
      "sku",
      "name",
      "price",
      "errors",
      "warnings",
      "row in your file",
    ]);
    expect((ws.getRow(2).values as unknown[]).slice(1)).toEqual([
      "00123",
      "Pen",
      "abc",
      'price: price must be a number (got "abc")',
      "",
      7,
    ]);
    expect(ws.getCell("C2").note).toMatch(/must be a number/);
  });
});
