// Run with: npm test
// End-to-end run of the bulk import dialog's pipeline (everything except React
// rendering and HTTP) on an in-memory copy of ALL migrations:
//   file bytes → readWorkbook → resolveHeaders → mapRows → lookup RPC → preview
//   (planProducts / planVariants) → runImport → writeProductsBatch /
//   writeVariantsBatch (the exact server-function code) → RPCs as a staff user
//   → images → activity log.
// The sample files are SYNTHETIC, built from the failure cases in IMPORT_AUDIT.md
// (the real /import-samples folder was not provided).
import { test } from "vitest";
import ExcelJS from "exceljs";
import { makeDb, as, ok } from "./harness.mjs";
import { readWorkbook } from "../../src/lib/import/read-workbook";
import { resolveHeaders } from "../../src/lib/import/headers";
import { isBlankRow, mapRows } from "../../src/lib/import/map-rows";
import {
  loadImportContext,
  lookupProducts,
  lookupVariants,
  productLookupKeys,
} from "../../src/lib/import/server-helpers";
import { planProducts } from "../../src/lib/import/validate-products";
import { planVariants } from "../../src/lib/import/validate-variants";
import { runImport } from "../../src/lib/import/run-import";
import { writeProductsBatch, writeVariantsBatch } from "../../src/lib/import/batch-write";
import { buildExportWorkbook, buildTemplateWorkbook } from "../../src/lib/import/xlsx-write";

const MGR = "dddddddd-0000-0000-0000-000000000004";
const PREFIX = "https://test.supabase.co/storage/v1/object/public/product-images/";
let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;

/** Minimal supabase-js stand-in over PGlite, running as the staff user (like PostgREST would). */
function staffClient() {
  const run = (sql, params) => as(db, "authenticated", MGR, sql, params);
  return {
    async rpc(name, args) {
      const keys = Object.keys(args);
      try {
        const r = await run(
          `select public.${name}(${keys.map((k, i) => `${k} => $${i + 1}::jsonb`).join(", ")}) as r`,
          keys.map((k) => JSON.stringify(args[k])),
        );
        return { data: r.rows[0].r, error: null };
      } catch (e) {
        return {
          data: null,
          error: { message: e.message, details: e.detail ?? null, code: e.code },
        };
      }
    },
    from(table) {
      return {
        select(cols) {
          const query = {
            order: () => query,
            then: (res, rej) =>
              run(`select ${cols} from public.${table}`)
                .then((r) => ({ data: r.rows, error: null }))
                .then(res, rej),
          };
          return query;
        },
      };
    },
  };
}

/** What BulkImportDialog does from file pick to the end of the import. */
async function dialog(
  bytes,
  fileName,
  { matchBy = "auto", mode = "valid_only", images = {} } = {},
) {
  const sb = staffClient();
  const ctx = await loadImportContext(sb);
  const wb = readWorkbook(bytes, fileName, "products");
  const prep = (sheet, kind) => {
    if (!sheet) return undefined;
    const headers = resolveHeaders(sheet.headers, kind, ctx.definitions);
    return { sheet, headers, rows: mapRows(sheet.rows, headers).filter((r) => !isBlankRow(r)) };
  };
  const p = prep(wb.products, "products");
  const v = prep(wb.variants, "variants");
  const all = [...(p?.rows ?? []), ...(v?.rows ?? [])];
  const existing = await lookupProducts(sb, productLookupKeys(all));
  const variantSkus = (v?.rows ?? []).map((r) => r.values.variant_sku).filter(Boolean);
  const existingVariants = await lookupVariants(sb, {
    product_ids: existing.map((x) => x.id),
    skus: variantSkus,
  });
  const productPlans = p
    ? planProducts(p.rows, ctx, existing, {
        matchBy,
        createMissingCategories: false,
        headerOf: p.headers.headerOf,
      })
    : [];
  const variantPlans = v
    ? planVariants(v.rows, ctx, existing, existingVariants, productPlans, {
        headerOf: v.headers.headerOf,
      })
    : [];
  const preview = { warnings: wb.warnings, products: p, variants: v, productPlans, variantPlans };
  const run = async () =>
    runImport(
      {
        fileName,
        matchBy,
        mode,
        storagePrefix: PREFIX,
        categoriesToCreate: [],
        products: p && { rows: p.rows, headerOf: p.headers.headerOf, plans: productPlans },
        variants: v && { rows: v.rows, headerOf: v.headers.headerOf, plans: variantPlans },
      },
      {
        createCategories: async () => ({ created: [] }),
        productsBatch: (input) => writeProductsBatch(sb, input),
        variantsBatch: (input) => writeVariantsBatch(sb, input),
        // No network in tests: links listed in `images` succeed, others 404.
        fetchImage: async (url) =>
          images[url]
            ? { ok: true, contentType: "image/png", base64: "aGk=", bytes: 2 }
            : { ok: false, message: "Image not found (404)" },
        storeImage: async (file) => PREFIX + file.name,
        applyImages: async ({ products, variants }) => {
          for (const x of products)
            await as(db, "authenticated", MGR, "update products set images = $1 where id = $2", [
              x.images,
              x.id,
            ]);
          for (const x of variants)
            await as(
              db,
              "authenticated",
              MGR,
              "update product_variants set image_url = $1 where id = $2",
              [x.image_url, x.id],
            );
        },
        finish: (body) =>
          as(
            db,
            "authenticated",
            MGR,
            "insert into activity_logs(admin_id, action, entity_type, new_value) values ($1, 'bulk_import', 'product_import', $2::jsonb)",
            [MGR, JSON.stringify(body)],
          ),
      },
      () => {},
      () => false,
    );
  return { ctx, preview, run };
}
const errorsOf = (plans) =>
  plans.flatMap((x) =>
    x.issues
      .filter((i) => i.level === "error")
      .map((i) => `row ${i.row} ${i.column}: ${i.message}`),
  );
const xlsxBytes = async (wb) => await wb.xlsx.writeBuffer();

test("E2E: template filled in Excel, messy CSV, messy workbook, export round trip", async () => {
  db = await makeDb();
  await db.exec(
    `insert into auth.users(id,email) values ('${MGR}','m@x.com'); insert into user_roles(user_id, role) values ('${MGR}','manager');`,
  );
  await db.exec(`insert into products (name, slug, sku, isbn, price, stock_quantity, category_id, description, cost_price)
                 values ('Peer-e-Kamil', 'peer-e-kamil', 'PK-001', '978-969-00-0000-1', 1250, 4, (select id from categories where slug = 'books'), '<p>Classic</p>', 700);
                 update attribute_definitions set options = '[{"value":"Umera Ahmed","label":"Umera Ahmed","sort":1}]' where key = 'author'`);

  // ---- S1: the downloaded template, filled in (example rows left in), Products + Variants
  {
    const { ctx } = await dialog(
      await xlsxBytes(await buildTemplateWorkbook(await loadImportContext(staffClient()))),
      "template.xlsx",
    );
    const wb = await buildTemplateWorkbook(ctx);
    const ps = wb.getWorksheet("Products");
    const head = ps.getRow(1).values.slice(1);
    const add = (o) => ps.addRow(head.map((h) => o[h] ?? null));
    add({
      sku: "0042",
      name: "Floral Wrapping Sheet",
      categories: "gift-wrapping-sheets",
      price: 600,
      stock_quantity: 20,
      attr_paper_size: "a3",
      images: "https://img.test/wrap.png",
    });
    add({
      sku: "MF-12",
      name: "Money Folder",
      categories: "Money Folders",
      price: "Rs. 1,200",
      stock_quantity: 5,
    });
    add({
      sku: "COS-SPIDEY",
      name: "Spiderman Costume",
      categories: "character-costumes",
      price: 2500,
      attr_gender: "Boys",
    });
    add({
      sku: "UR-1",
      name: "پیرِ کامل (اردو)",
      categories: "books",
      price: 900,
      isbn: "9789690000002",
      attr_author: "umera ahmed",
      images: "https://img.test/missing.png",
    });
    add({
      sku: "BAG-EID",
      name: "Eid Gift Bag",
      categories: "gift-bags",
      price: 150,
      attr_colour: "green",
      attr_occasion: "Eid",
    });
    const vs = wb.getWorksheet("Variants");
    const vhead = vs.getRow(1).values.slice(1);
    for (const [size, colour, stock] of [
      ["6-7Y", "Red", 3],
      ["8-9Y", "red", 2],
    ])
      vs.addRow(
        vhead.map(
          (h) =>
            ({
              product_sku: "COS-SPIDEY",
              variant_sku: `SPIDEY-${size}-${colour}`.toUpperCase(),
              stock,
              option_clothing_size: size,
              option_colour: colour,
            })[h] ?? null,
        ),
      );
    const { preview, run } = await dialog(await xlsxBytes(wb), "my-products.xlsx", {
      images: { "https://img.test/wrap.png": true },
    });
    ok(
      errorsOf(preview.productPlans).length === 0 && errorsOf(preview.variantPlans).length === 0,
      `S1 preview has no errors (${[...errorsOf(preview.productPlans), ...errorsOf(preview.variantPlans)]})`,
    );
    ok(
      preview.productPlans.filter((x) => x.status === "skipped").length >= 9,
      "S1 template example rows are skipped",
    );
    ok(
      preview.variantPlans.filter((x) => x.parentInFile).length === 2,
      "S1 variants point at the new costume in the same file",
    );
    const res = await run();
    ok(
      res.counts.products.created === 5 && res.counts.products.failed === 0,
      `S1 5 products created (${JSON.stringify(res.counts.products)})`,
    );
    ok(
      res.counts.variants.created === 2 && res.counts.variants.failed === 0,
      `S1 2 variants created (${JSON.stringify(res.counts.variants)})`,
    );
    ok(
      res.counts.images.copied === 1 && res.counts.images.failed === 1,
      `S1 one image copied, one failed as a warning (${JSON.stringify(res.counts.images)})`,
    );
    const wrap = (
      await q(
        "select sku, sell_unit, pack_size, unit_label, attributes, images from products where sku = '0042'",
      )
    )[0];
    ok(
      wrap &&
        wrap.sell_unit === "pack" &&
        wrap.pack_size === 6 &&
        wrap.attributes.paper_size === "A3",
      "S1 leading-zero SKU kept, pack of 6, a3 → A3",
    );
    ok(
      wrap.images.length === 1 && wrap.images[0].startsWith(PREFIX),
      "S1 image copied into our storage",
    );
    ok(
      (await q("select pack_size from products where sku = 'MF-12'"))[0].pack_size === 12,
      "S1 Money Folders: pack of 12",
    );
    const urdu = (
      await q("select name, slug, attributes, images from products where sku = 'UR-1'")
    )[0];
    ok(
      urdu.name === "پیرِ کامل (اردو)" &&
        urdu.slug === "ur-1" &&
        urdu.attributes.author === "Umera Ahmed" &&
        urdu.images.length === 0,
      "S1 Urdu name kept, slug from SKU, author matched, failed image left empty",
    );
    ok(
      (await q("select attributes from products where sku = 'BAG-EID'"))[0].attributes.colour ===
        "Green",
      "S1 gift-bag colour green → the defined Green",
    );
    const vrows = await q(
      "select v.option_values from product_variants v join products p on p.id = v.product_id where p.sku = 'COS-SPIDEY' order by v.sku",
    );
    ok(
      vrows.length === 2 && vrows.every((r) => r.option_values.colour === "Red"),
      "S1 variant options stored as defined (red → Red)",
    );
    ok(
      (await q("select count(*)::int n from activity_logs where action = 'bulk_import'"))[0].n ===
        1,
      "S1 one activity-log entry",
    );
  }

  // ---- S2: CSV saved by Excel in ANSI with Excel damage
  {
    const lines = [
      "Name,Category,Price,Sale Price,Stock,ISBN,Status,New Arrival Until",
      'Raja Gidh,books,"Rs. 1,250",999,7,9.78097E+12,Active,10/9/2026',
      "Notebook,notebook,300,,10,,yes,",
      ",,,,,,,",
      "???? ????,books,500,,1,,maybe,",
      "Café Book,books,400,,2,,no,45939",
    ];
    const text = lines.join("\r\n");
    const bytes = Uint8Array.from([...text].map((c) => c.charCodeAt(0) & 0xff)); // Windows-1252
    const { preview, run } = await dialog(bytes.buffer, "excel-export.csv");
    const errs = errorsOf(preview.productPlans);
    ok(
      preview.warnings.some((w) => /CSV UTF-8/.test(w)),
      "S2 ANSI file → warning to save as CSV UTF-8",
    );
    ok(
      errs.some((e) => /^row 2 ISBN: ISBN looks like 9\.78097E\+12/.test(e)),
      `S2 scientific ISBN explained on row 2 (${errs})`,
    );
    ok(
      errs.some((e) =>
        /^row 3 Category: Unknown category "notebook"\. Did you mean: notebooks/.test(e),
      ),
      "S2 unknown category with suggestion on row 3",
    );
    ok(
      errs.some((e) => /^row 5 Status: Status must be yes or no/.test(e)),
      "S2 row numbers stay Excel's after the blank row 4",
    );
    ok(
      preview.productPlans.find((x) => x.row === 5).issues.some((i) => /\?\?\?/.test(i.message)),
      "S2 lost Urdu (????) is flagged",
    );
    const cafe = preview.productPlans.find((x) => x.row === 6);
    ok(
      cafe.status !== "error" &&
        cafe.payload.set.name === "Café Book" &&
        cafe.payload.set.new_arrival_until === "2025-10-09",
      "S2 accents decoded, Excel serial date read",
    );
    const res = await run();
    ok(
      res.counts.products.created === 1 && res.counts.products.skipped === 3,
      `S2 valid rows only: 1 created, 3 skipped (${JSON.stringify(res.counts.products)})`,
    );
  }

  // ---- S3: messy workbook (title row, merged categories, hidden sheet, numeric ISBN, "Color", stock-only update)
  {
    const wb = new ExcelJS.Workbook();
    const hidden = wb.addWorksheet("Old", { state: "hidden" });
    hidden.addRow(["name"]);
    hidden.addRow(["Should not import"]);
    const ws = wb.addWorksheet("Sheet1");
    ws.addRow(["Gift price list — October"]);
    ws.addRow(["Product Name", "Category", "Price", "Color", "Occasion", "ISBN", "Stock"]);
    ws.addRow(["Birthday Bag", "gift-bags", 120, "Blue", "Birthday", null, 4]);
    ws.addRow(["Wedding Bag", null, 180, "Purple", "Diwali", null, 2]);
    ws.addRow(["Peer-e-Kamil", null, null, null, null, 9789690000001, 11]);
    ws.mergeCells("B3:B4");
    const { preview, run } = await dialog(await xlsxBytes(wb), "gifts.xlsx");
    ok(
      preview.warnings.some((w) => /Hidden sheet/.test(w)),
      "S3 hidden sheet ignored with a note",
    );
    const [a, b, c] = preview.productPlans;
    ok(
      a.status === "ok" && a.payload.attributes_set.colour === "Blue",
      `S3 "Color" header → colour attribute (${a.issues.map((i) => i.message)})`,
    );
    ok(
      b.categoryIds.length === 1 &&
        b.issues.some((i) => /"Diwali" is not an allowed Occasion/.test(i.message)),
      "S3 merged category cell filled; bad option reported",
    );
    ok(
      c.action === "update" &&
        c.matchedBy === "isbn" &&
        JSON.stringify(c.payload.set) ===
          JSON.stringify({ name: "Peer-e-Kamil", stock_quantity: 11 }),
      `S3 numeric ISBN matched the existing book; only name/stock sent (${JSON.stringify(c.payload?.set)})`,
    );
    await run();
    const pk = (
      await q(
        "select stock_quantity, description, cost_price, price, isbn from products where sku = 'PK-001'",
      )
    )[0];
    ok(
      pk.stock_quantity === 11 &&
        pk.description === "<p>Classic</p>" &&
        Number(pk.cost_price) === 700 &&
        Number(pk.price) === 1250 &&
        pk.isbn === "978-969-00-0000-1",
      "S3 stock-only update kept description, cost, price and the ISBN's hyphens",
    );
  }

  // ---- S4: export → edit in Excel → re-import
  {
    const sb = staffClient();
    const ctx = await loadImportContext(sb);
    const products = (
      await q(
        `select p.*, coalesce((select array_agg(pc.category_id order by pc.is_primary desc, pc.created_at) from product_categories pc where pc.product_id = p.id), '{}') as category_ids from products p order by name`,
      )
    ).map((p) => ({
      ...p,
      price: Number(p.price),
      sale_price: p.sale_price == null ? null : Number(p.sale_price),
      cost_price: p.cost_price == null ? null : Number(p.cost_price),
      new_arrival_until: p.new_arrival_until
        ? new Date(p.new_arrival_until).toISOString().slice(0, 10)
        : null,
    }));
    const variants = (
      await q(
        `select v.*, p.sku as product_sku, p.slug as product_slug from product_variants v join products p on p.id = v.product_id`,
      )
    ).map((v) => ({
      ...v,
      price: v.price == null ? null : Number(v.price),
      compare_at_price: v.compare_at_price == null ? null : Number(v.compare_at_price),
    }));
    const { wb } = await buildExportWorkbook(ctx, products, variants);
    const untouched = await dialog(await xlsxBytes(wb), "export.xlsx");
    ok(
      errorsOf(untouched.preview.productPlans).length === 0 &&
        errorsOf(untouched.preview.variantPlans).length === 0,
      `S4 export re-imports with 0 errors (${[...errorsOf(untouched.preview.productPlans), ...errorsOf(untouched.preview.variantPlans)]})`,
    );
    // Edit one stock value "in Excel" and upload.
    const ws = wb.getWorksheet("Products");
    const h = ws.getRow(1).values;
    ws.eachRow((row, n) => {
      if (n > 1 && row.getCell(h.indexOf("sku")).value === "PK-001")
        row.getCell(h.indexOf("stock_quantity")).value = 30;
    });
    const before = await q(
      "select sku, name, price, sale_price, cost_price, description, attributes, images, updated_at from products where sku <> 'PK-001' order by sku",
    );
    const edited = await dialog(await xlsxBytes(wb), "export-edited.xlsx");
    const res = await edited.run();
    ok(
      res.counts.products.failed === 0 && res.counts.variants.failed === 0,
      `S4 re-import: nothing failed (${JSON.stringify(res.counts)})`,
    );
    ok(
      (await q("select stock_quantity from products where sku = 'PK-001'"))[0].stock_quantity ===
        30,
      "S4 edited stock saved",
    );
    const after = await q(
      "select sku, name, price, sale_price, cost_price, description, attributes, images, updated_at from products where sku <> 'PK-001' order by sku",
    );
    const strip = (rows) => JSON.stringify(rows.map(({ updated_at, ...r }) => r));
    ok(strip(after) === strip(before), "S4 every other product's data is unchanged");
  }
});
