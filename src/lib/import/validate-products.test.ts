import { describe, expect, it } from "vitest";
import { ctx, headerOf, product, row } from "./test-fixtures";
import type { ExistingProduct, MappedRow, MatchBy } from "./types";
import { collectNewOptions, planProducts } from "./validate-products";

const plan = (
  rows: MappedRow[],
  existing: ExistingProduct[] = [],
  opts: { matchBy?: MatchBy; createMissingCategories?: boolean } = {},
) =>
  planProducts(rows, ctx, existing, {
    matchBy: opts.matchBy ?? "auto",
    createMissingCategories: opts.createMissingCategories ?? false,
    headerOf: headerOf([...new Set(rows.flatMap((r) => Object.keys(r.values)))]),
  });
const one = (values: Record<string, string | null>, existing: ExistingProduct[] = [], opts = {}) =>
  plan([row(values, 2)], existing, opts)[0];
const messages = (p: { issues: { message: string }[] }) =>
  p.issues.map((i) => i.message).join("\n");

describe("new products", () => {
  it("multi-category: the first is the primary, attributes inherited from the parent", () => {
    const p = one({
      name: "Peer-e-Kamil",
      categories: "novels|books",
      price: "Rs. 1,250",
      "attr:author": "Umera Ahmed",
      "attr:age_group": "adult",
    });
    expect(p.status).toBe("ok");
    expect(p.action).toBe("create");
    expect(p.payload).toMatchObject({
      id: null,
      category_ids: ["novels", "books"],
      set: {
        name: "Peer-e-Kamil",
        slug: "peer-e-kamil",
        price: 1250,
        sell_unit: "item",
        pack_size: null,
      },
      attributes_set: { author: "Umera Ahmed", age_group: "Adult" }, // case-insensitive → stored value
    });
  });
  it("categories by name, any case, or a Parent > Child path", () => {
    expect(one({ name: "A", categories: "Gift Bags", price: "1" }).categoryIds).toEqual(["bags"]);
    expect(one({ name: "A", categories: "GIFTS > gift bags", price: "1" }).categoryIds).toEqual([
      "bags",
    ]);
  });
  it("unknown category → error with 'did you mean'", () => {
    const p = one({ name: "A", categories: "gift-bag", price: "1" });
    expect(p.status).toBe("error");
    expect(messages(p)).toMatch(/Unknown category "gift-bag"\. Did you mean: gift-bags/);
  });
  it("unknown category with the admin toggle → created first (warning)", () => {
    const p = one({ name: "A", categories: "Party Hats", price: "1" }, [], {
      createMissingCategories: true,
    });
    expect(p.status).toBe("warning");
    expect(p.categoriesToCreate).toEqual(["Party Hats"]);
  });
  it("invalid select option lists the allowed values", () => {
    const p = one({ name: "A", categories: "gift-bags", price: "1", "attr:occasion": "Diwali" });
    expect(p.issues[0]).toMatchObject({ column: "attr_occasion", value: "Diwali", level: "error" });
    expect(p.issues[0].message).toBe(
      '"Diwali" is not an allowed Occasion. Allowed: Birthday, Eid, Wedding',
    );
  });
  it("a new author is added as an option, but different case reuses the existing one", () => {
    const rows = [
      row({ name: "A", categories: "books", price: "1", "attr:author": "Bano Qudsia" }, 2),
      row({ name: "B", categories: "books", price: "1", "attr:author": "umera ahmed" }, 3),
    ];
    const [a, b] = plan(rows);
    expect(a.newOptions).toEqual({ author: ["Bano Qudsia"] });
    expect(b.payload!.attributes_set).toEqual({ author: "Umera Ahmed" });
    expect(collectNewOptions([a, b])).toEqual({ author: ["Bano Qudsia"] });
  });
  it("missing required attribute (inherited rules per category)", () => {
    const p = one({ name: "Notebook", categories: "notebooks", price: "200" });
    expect(messages(p)).toMatch(/Binding Type is required for this category/);
    expect(
      one({
        name: "Notebook",
        categories: "notebooks",
        price: "200",
        "attr:binding_type": "spiral",
      }).status,
    ).toBe("ok");
  });
  it("number and multiselect attributes", () => {
    const p = one({
      name: "N",
      categories: "notebooks",
      price: "1",
      "attr:binding_type": "Spiral",
      "attr:subjects": "five",
    });
    expect(messages(p)).toMatch(/Subjects must be a number/);
    const b = one({ name: "B", categories: "books", price: "1", "attr:languages": "english|URDU" });
    expect(b.payload!.attributes_set).toEqual({ languages: ["English", "Urdu"] });
  });
  it("attribute that doesn't apply to the category, and variant axes in the products sheet", () => {
    expect(
      messages(
        one({
          name: "N",
          categories: "notebooks",
          price: "1",
          "attr:binding_type": "Spiral",
          "attr:author": "X",
        }),
      ),
    ).toMatch(/"Author" doesn't apply to Stationery > Notebooks/);
    const c = one({
      name: "Costume",
      categories: "character-costumes",
      price: "1",
      "attr:colour": "Red",
    });
    expect(c.status).toBe("warning");
    expect(messages(c)).toMatch(/Colour is chosen per variant/);
  });
  it("gift-bag colour IS a product attribute", () => {
    const p = one({
      name: "Eid Bag",
      categories: "gift-bags",
      price: "150",
      "attr:colour": "red",
      "attr:occasion": "eid",
    });
    expect(p.payload!.attributes_set).toEqual({ colour: "Red", occasion: "Eid" });
  });
  it("pack defaults from the category: Gift Wrapping = pack of 6, Money Folders = pack of 12", () => {
    expect(
      one({ name: "Floral Wrap", categories: "gift-wrapping-sheets", price: "600" }).payload!.set,
    ).toMatchObject({ sell_unit: "pack", pack_size: 6, unit_label: "sheet" });
    expect(
      one({ name: "Folder", categories: "money-folders", price: "1200" }).payload!.set,
    ).toMatchObject({ sell_unit: "pack", pack_size: 12, unit_label: "folder" });
    expect(
      one({ name: "Folder 24", categories: "money-folders", price: "2000", pack_size: "24" })
        .payload!.set,
    ).toMatchObject({ pack_size: 24 });
    expect(
      messages(one({ name: "Pens", categories: "stationery", price: "100", sell_unit: "pack" })),
    ).toMatch(/pack_size is required/);
    expect(
      one({ name: "Single", categories: "money-folders", price: "100", sell_unit: "item" }).payload!
        .set,
    ).toMatchObject({ sell_unit: "item", pack_size: null });
  });
  it("required fields for new products, and every problem of the row is reported", () => {
    const p = one({
      name: null,
      categories: null,
      price: "abc",
      stock_quantity: "-1",
      is_active: "maybe",
      new_arrival_until: "soon",
      sell_unit: "box",
    });
    expect(p.status).toBe("error");
    const m = messages(p);
    for (const re of [
      /name is required/,
      /price must be a number/,
      /stock_quantity must be 0 or more/,
      /is_active must be yes or no/,
      /new_arrival_until must be a date/,
      /categories is required/,
    ])
      expect(m).toMatch(re);
    expect(m).not.toMatch(/sell_unit/); // "box" = pack
  });
  it("Excel damage gets a clear message: scientific ISBN / SKU, #N/A", () => {
    const p = one({
      name: "B",
      categories: "books",
      price: "#N/A",
      isbn: "9.78097E+12",
      sku: "9.78E+12",
    });
    expect(p.issues.map((i) => i.column)).toEqual(["price", "sku", "isbn"]);
    expect(messages(p)).toMatch(/Excel error #N\/A/);
    expect(messages(p)).toMatch(
      /ISBN looks like 9\.78097E\+12 — Excel changed this number\. Format the ISBN column as Text/,
    );
  });
  it("Urdu-only names get a stable fallback slug (warning)", () => {
    const p = one({ name: "پیرِ کامل", categories: "books", price: "1" });
    expect(p.status).toBe("warning");
    expect(p.slug).toMatch(/^item-[0-9a-z]{7}$/);
    expect(one({ name: "پیرِ کامل", sku: "UR-1", categories: "books", price: "1" }).slug).toBe(
      "ur-1",
    );
  });
  it("compare_at_price (Shopify meaning) maps onto price / sale_price", () => {
    expect(
      one({ name: "A", categories: "books", price: "800", compare_at_price: "1000" }).payload!.set,
    ).toMatchObject({ price: 1000, sale_price: 800 });
    expect(
      messages(one({ name: "A", categories: "books", price: "800", compare_at_price: "700" })),
    ).toMatch(/must be higher than price/);
    expect(
      messages(
        one({
          name: "A",
          categories: "books",
          price: "800",
          sale_price: "700",
          compare_at_price: "1000",
        }),
      ),
    ).toMatch(/either sale_price or compare_at_price/);
  });
  it("images: | separated, comma inside links kept, folder links rejected", () => {
    const p = one({
      name: "A",
      categories: "books",
      price: "1",
      images: "https://x.test/w_1,h_2/a.jpg | https://drive.google.com/file/d/abc/view",
    });
    expect(p.images).toEqual([
      "https://x.test/w_1,h_2/a.jpg",
      "https://drive.google.com/file/d/abc/view",
    ]);
    expect(
      messages(
        one({
          name: "A",
          categories: "books",
          price: "1",
          images: "https://drive.google.com/drive/folders/xyz",
        }),
      ),
    ).toMatch(/FOLDER link/);
    expect(
      one({
        name: "A",
        categories: "books",
        price: "1",
        "image:1": "https://x.test/1.jpg",
        "image:2": "https://x.test/2.jpg",
      }).images,
    ).toHaveLength(2);
  });
  it("example rows from the template are skipped", () => {
    const p = one({
      sku: "EXAMPLE-BOOKS",
      name: "EXAMPLE – Books item",
      categories: "books",
      price: "500",
    });
    expect(p.status).toBe("skipped");
    expect(p.payload).toBeUndefined();
  });
});

describe("duplicates inside the file", () => {
  it("duplicate SKU: every row involved is told which other rows", () => {
    const ps = plan([
      row({ sku: "A1", name: "X", categories: "books", price: "1" }, 2),
      row({ sku: "B1", name: "Y", categories: "books", price: "1" }, 3),
      row({ sku: "A1", name: "Z", categories: "books", price: "1" }, 7),
    ]);
    expect(ps.map((p) => p.status)).toEqual(["error", "ok", "error"]);
    expect(messages(ps[0])).toBe('SKU "A1" is also used in row 7');
    expect(messages(ps[2])).toBe('SKU "A1" is also used in row 2');
  });
  it("same name without SKU → the second gets a unique slug", () => {
    const ps = plan([
      row({ name: "Pen", categories: "stationery", price: "1" }, 2),
      row({ name: "Pen", categories: "stationery", price: "2" }, 3),
    ]);
    expect(ps.map((p) => p.slug)).toEqual(["pen", "pen-2"]);
  });
  it("two rows updating the same product", () => {
    const ps = plan(
      [row({ sku: "S1", stock_quantity: "1" }, 2), row({ sku: "S1", stock_quantity: "2" }, 3)],
      [product({ id: "p1", slug: "s", sku: "S1" })],
    );
    expect(messages(ps[0])).toMatch(/also used in row 3/);
  });
});

describe("updates (blank = unchanged, CLEAR = empty)", () => {
  const existing = product({
    id: "p1",
    slug: "peer-e-kamil",
    name: "Peer-e-Kamil",
    sku: "PK-001",
    isbn: "978-969-35-0000-1",
    price: 1250,
    sale_price: 999,
    attributes: { author: "Umera Ahmed", publisher: "Ferozsons" },
    images: ["https://cdn.test/a.webp"],
    category_ids: ["novels", "books"],
  });
  it("a stock-only sheet changes only the stock", () => {
    const p = one({ sku: "PK-001", stock_quantity: "3" }, [existing]);
    expect(p).toMatchObject({
      action: "update",
      matchedBy: "sku",
      productId: "p1",
      status: "ok",
      images: null,
    });
    expect(p.payload).toEqual({
      row: 2,
      id: "p1",
      set: { stock_quantity: 3 },
      attributes_set: {},
      attributes_unset: [],
      category_ids: null,
    });
  });
  it("blank cells in a full row keep the current values", () => {
    const p = one(
      {
        sku: "PK-001",
        name: "Peer-e-Kamil",
        description: null,
        isbn: null,
        cost_price: null,
        categories: null,
        "attr:author": null,
        images: null,
      },
      [existing],
    );
    expect(p.payload!.set).toEqual({ name: "Peer-e-Kamil" });
    expect(p.payload!.category_ids).toBeNull();
  });
  it("CLEAR empties clearable values and is refused for required ones", () => {
    const p = one(
      {
        sku: "PK-001",
        sale_price: "CLEAR",
        description: "clear",
        "attr:author": "CLEAR",
        images: "CLEAR",
      },
      [existing],
    );
    expect(p.payload!.set).toEqual({ sale_price: null, description: null });
    expect(p.payload!.attributes_unset).toEqual(["author"]);
    expect(p.images).toEqual([]);
    expect(messages(one({ sku: "PK-001", price: "CLEAR", name: "CLEAR" }, [existing]))).toMatch(
      /price can't be cleared/,
    );
  });
  it("matching: SKU, then ISBN (any hyphens), then slug; the match is shown", () => {
    expect(one({ isbn: "9789693500001", stock_quantity: "1" }, [existing]).matchedBy).toBe("isbn");
    expect(one({ name: "Peer-e-Kamil", stock_quantity: "1" }, [existing]).matchedBy).toBe("slug");
    // A different SKU means a different product, even with the same ISBN.
    const other = one(
      {
        sku: "PK-002",
        isbn: "9789693500001",
        name: "Peer-e-Kamil (2nd)",
        categories: "books",
        price: "1",
      },
      [existing],
    );
    expect(other.action).toBe("create");
    expect(messages(other)).toMatch(/also on "Peer-e-Kamil"/);
  });
  it("match by SKU only: rows without a SKU are errors", () => {
    expect(
      messages(one({ name: "Peer-e-Kamil", stock_quantity: "1" }, [existing], { matchBy: "sku" })),
    ).toMatch(/SKU is empty/);
  });
  it("changing a SKU to one used by another product is refused", () => {
    const others = [existing, product({ id: "p2", slug: "other", sku: "OTHER" })];
    // Auto mode: the SKU itself finds the other product (an update of p2, not a clash).
    expect(one({ isbn: "9789693500001", sku: "OTHER" }, others).productId).toBe("p2");
    const p = one({ isbn: "9789693500001", sku: "OTHER" }, others, { matchBy: "isbn" });
    expect(p.productId).toBe("p1");
    expect(messages(p)).toMatch(/SKU OTHER is already used by "other"/);
  });
  it("new categories replace the old ones (primary first)", () => {
    const p = one({ sku: "PK-001", categories: "books|novels" }, [existing]);
    expect(p.payload!.category_ids).toEqual(["books", "novels"]);
  });
  it("sale price not lower than price is a warning, not an error", () => {
    const p = one({ sku: "PK-001", price: "999", sale_price: "999" }, [existing]);
    expect(p.status).toBe("warning");
  });
});
