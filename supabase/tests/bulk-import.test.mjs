// Run with: npm test
// Bulk importer (20261009100000_bulk_import.sql) end to end on an in-memory copy
// of ALL migrations: the real validator builds the payloads, the RPCs write them
// as a staff user. No real data is touched.
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";
import { planProducts } from "../../src/lib/import/validate-products";
import { planVariants } from "../../src/lib/import/validate-variants";
import { productLookupKeys } from "../../src/lib/import/server-helpers";
import { exportProductRows } from "../../src/lib/import/export-rows";
import { resolveHeaders } from "../../src/lib/import/headers";
import { mapRows } from "../../src/lib/import/map-rows";
import { chunkRows } from "../../src/lib/import/run-import";

const MGR = "dddddddd-0000-0000-0000-000000000004";
const CUST = "aaaaaaaa-0000-0000-0000-000000000001";
let db;
const q = async (sql, params) => (await db.query(sql, params)).rows;
const staff = (sql, params) => as(db, "authenticated", MGR, sql, params);

async function context() {
  const categories = await q(
    "select id, slug, name, parent_id, is_active, default_sell_unit, default_pack_size, default_unit_label from categories",
  );
  const definitions = (await q("select * from attribute_definitions")).map((d) => ({
    ...d,
    options: d.options ?? [],
  }));
  const categoryAttributes = await q(
    "select category_id, attribute_id, is_required, is_variant_axis, sort_order from category_attributes",
  );
  return { categories, definitions, categoryAttributes };
}
async function lookup(rows) {
  const r = await staff("select public.import_lookup_products($1::jsonb) as r", [
    JSON.stringify(productLookupKeys(rows)),
  ]);
  return r.rows[0].r;
}
async function writeBatch(plans) {
  const rows = plans
    .filter((p) => p.status !== "error" && p.action !== "skip")
    .map((p) => p.payload);
  const r = await staff("select public.import_products_batch($1::jsonb, $2::jsonb) as r", [
    JSON.stringify(rows),
    "{}",
  ]);
  return r.rows[0].r;
}
const rowsOf = (list) => list.map((values, i) => ({ rowNumber: i + 2, values }));
const opts = { matchBy: "auto", createMissingCategories: false, headerOf: {} };

test("bulk import RPCs: permissions, 1,000 rows, updates, rollback, variants, cost_price", async () => {
  db = await makeDb();
  await db.exec(
    `insert into auth.users(id,email) values ('${MGR}','m@x.com'),('${CUST}','c@x.com'); insert into user_roles(user_id, role) values ('${MGR}','manager');`,
  );
  const ctx = await context();
  const cat = (slug) => ctx.categories.find((c) => c.slug === slug).id;

  // ---- permissions
  await throws(
    as(db, "anon", null, "select public.import_products_batch('[]'::jsonb, '{}'::jsonb)"),
    /permission denied/,
    "anon cannot run the batch import",
  );
  await throws(
    as(db, "anon", null, "select public.import_lookup_products('{}'::jsonb)"),
    /permission denied/,
    "anon cannot run the lookup",
  );
  await throws(
    as(db, "authenticated", CUST, "select public.import_products_batch('[]'::jsonb, '{}'::jsonb)"),
    /Forbidden: staff only/,
    "customers cannot import",
  );
  await throws(
    as(db, "authenticated", CUST, "select public.import_lookup_products('{}'::jsonb)"),
    /Forbidden: staff only/,
    "customers cannot look up (no inactive products / drafts leak)",
  );
  await throws(
    staff("select public.import_products_batch($1::jsonb)", [
      JSON.stringify(Array.from({ length: 201 }, () => ({}))),
    ]),
    /at most 200 rows/,
    "batch size is capped",
  );

  // ---- 1,000 rows: 800 new + 200 updates of existing products, in batches of 100
  await db.exec(`insert into products (name, slug, sku, price, stock_quantity, category_id, cost_price, description, attributes)
    select 'Old ' || g, 'old-' || g, 'OLD-' || g, 100, 1, '${cat("books")}', 50, 'keep me', '{"author":"Umera Ahmed"}'::jsonb from generate_series(1, 200) g`);
  const all = rowsOf([
    ...Array.from({ length: 800 }, (_, i) => ({
      sku: `NEW-${i}`,
      name: `New Book ${i}`,
      categories: i % 2 ? "books" : "gift-wrapping-sheets",
      price: "Rs. 1,250",
      stock_quantity: "5",
      cost_price: "700",
    })),
    ...Array.from({ length: 200 }, (_, i) => ({
      sku: `OLD-${i + 1}`,
      stock_quantity: "9",
      price: "150",
    })),
  ]);
  const t0 = Date.now();
  let created = 0,
    updated = 0,
    slowest = 0;
  for (const batch of chunkRows(all)) {
    const b0 = Date.now();
    const plans = planProducts(batch, ctx, await lookup(batch), opts);
    ok(
      plans.every((p) => p.status !== "error"),
      `batch validates (${plans.flatMap((p) => p.issues.map((i) => i.message)).slice(0, 2)})`,
    );
    const res = await writeBatch(plans);
    created += res.filter((r) => r.action === "created").length;
    updated += res.filter((r) => r.action === "updated").length;
    slowest = Math.max(slowest, Date.now() - b0);
  }
  console.log(
    `1,000 rows in ${Date.now() - t0} ms (slowest batch ${slowest} ms, in-memory PGlite)`,
  );
  ok(created === 800 && updated === 200, `800 created / 200 updated (${created}/${updated})`);
  ok(slowest < 8000, `each batch well inside the time limit (${slowest} ms)`);
  const wrap = (
    await q(
      "select sell_unit, pack_size, unit_label, price, cost_price from products where sku = 'NEW-0'",
    )
  )[0];
  ok(
    wrap.sell_unit === "pack" &&
      wrap.pack_size === 6 &&
      wrap.unit_label === "sheet" &&
      Number(wrap.price) === 1250 &&
      Number(wrap.cost_price) === 700,
    "gift wrap: pack of 6 sheets, Rs. 1,250 per pack, cost saved",
  );
  const old1 = (
    await q(
      "select stock_quantity, price, description, cost_price, attributes, category_id from products where sku = 'OLD-1'",
    )
  )[0];
  ok(old1.stock_quantity === 9 && Number(old1.price) === 150, "update wrote stock and price");
  ok(
    old1.description === "keep me" &&
      Number(old1.cost_price) === 50 &&
      old1.attributes.author === "Umera Ahmed" &&
      old1.category_id === cat("books"),
    "update kept every column that was not in the sheet",
  );
  ok(
    (
      await q(
        "select count(*)::int n from product_categories pc join products p on p.id = pc.product_id where p.sku like 'NEW-%' and pc.is_primary",
      )
    )[0].n === 800,
    "every new product has its primary category link",
  );

  // ---- categories replaced (primary first), CLEAR, attribute merge
  const r1 = rowsOf([
    { sku: "OLD-2", categories: "gift-bags|books", "attr:colour": "red", description: "CLEAR" },
  ]);
  const p1 = planProducts(r1, ctx, await lookup(r1), opts);
  ok(p1[0].status === "ok", `re-categorise row valid (${p1[0].issues.map((i) => i.message)})`);
  await writeBatch(p1);
  const links = await q(
    "select c.slug, pc.is_primary from product_categories pc join categories c on c.id = pc.category_id join products p on p.id = pc.product_id where p.sku = 'OLD-2' order by pc.is_primary desc, c.slug",
  );
  ok(
    JSON.stringify(links) ===
      JSON.stringify([
        { slug: "gift-bags", is_primary: true },
        { slug: "books", is_primary: false },
      ]),
    `categories replaced, first = primary (${JSON.stringify(links)})`,
  );
  const old2 = (
    await q("select category_id, description, attributes from products where sku = 'OLD-2'")
  )[0];
  ok(
    old2.category_id === cat("gift-bags") && old2.description === null,
    "products.category_id follows the primary; CLEAR emptied the description",
  );
  ok(
    old2.attributes.colour === "Red" && old2.attributes.author === "Umera Ahmed",
    "attributes merged (gift-bag colour added, old author kept)",
  );

  // ---- a failed batch rolls back completely and reports the row
  const before = (await q("select count(*)::int n from products"))[0].n;
  const bad = [
    {
      row: 2,
      id: null,
      set: { name: "Rollback A", slug: "rollback-a", sku: "RB-A", price: 1 },
      attributes_set: {},
      attributes_unset: [],
      category_ids: [cat("books")],
    },
    {
      row: 3,
      id: null,
      set: { name: "Rollback B", slug: "rollback-b", sku: "OLD-3", price: 1 },
      attributes_set: {},
      attributes_unset: [],
      category_ids: [cat("books")],
    },
  ];
  let detail = null;
  try {
    await staff("select public.import_products_batch($1::jsonb, $2::jsonb)", [
      JSON.stringify(bad),
      JSON.stringify({ author: ["Rolled Back Author"] }),
    ]);
  } catch (e) {
    detail = JSON.parse(e.detail);
    ok(/import_batch_failed/.test(e.message), "batch error is import_batch_failed");
  }
  ok(
    detail?.length === 1 && detail[0].row === 3 && detail[0].constraint === "products_sku_key",
    `failed row reported with its constraint (${JSON.stringify(detail)})`,
  );
  ok(
    (await q("select count(*)::int n from products"))[0].n === before,
    "nothing from the failed batch was saved (row 2 rolled back too)",
  );
  ok(
    !(await q("select options from attribute_definitions where key = 'author'"))[0].options.some(
      (o) => o.value === "Rolled Back Author",
    ),
    "new attribute options rolled back with the batch",
  );

  // ---- new options: case-insensitive, no duplicates
  await staff("select public.import_products_batch('[]'::jsonb, $1::jsonb)", [
    JSON.stringify({ author: ["umera ahmed", "Bano Qudsia"], age_group: ["Teens"] }),
  ]);
  const authors = (
    await q("select options from attribute_definitions where key = 'author'")
  )[0].options.map((o) => o.value);
  ok(
    authors.filter((a) => a.toLowerCase() === "umera ahmed").length === 1 &&
      authors.includes("Bano Qudsia"),
    `author options: no case duplicate, new one added (${authors})`,
  );
  ok(
    !(await q("select options from attribute_definitions where key = 'age_group'"))[0].options.some(
      (o) => o.value === "Teens",
    ),
    "options are only added where the attribute allows new values",
  );

  // ---- variants (parent created in the same file), upsert by SKU, duplicate SKU on another product
  const pr = rowsOf([
    { sku: "COS-1", name: "Spiderman Costume", categories: "character-costumes", price: "2500" },
  ]);
  const pplans = planProducts(pr, ctx, await lookup(pr), opts);
  await writeBatch(pplans);
  const vr = rowsOf([
    {
      product_sku: "COS-1",
      variant_sku: "COS-1-6-RED",
      "option:clothing_size": "6-7y",
      "option:colour": "red",
      stock: "4",
      compare_at_price: "3000",
    },
    {
      product_sku: "COS-1",
      variant_sku: "COS-1-8-BLUE",
      "option:clothing_size": "8-9Y",
      "option:colour": "Blue",
      stock: "2",
      price: "2700",
    },
  ]);
  const vprods = await lookup(vr);
  const vvars = (
    await staff("select public.import_lookup_variants($1::jsonb) as r", [
      JSON.stringify({
        product_ids: vprods.map((p) => p.id),
        skus: ["COS-1-6-RED", "COS-1-8-BLUE"],
      }),
    ])
  ).rows[0].r;
  const vplans = planVariants(vr, ctx, vprods, vvars, [], { headerOf: {} });
  ok(
    vplans.every((p) => p.status === "ok"),
    `variant rows valid (${vplans.flatMap((p) => p.issues.map((i) => i.message))})`,
  );
  const vres = (
    await staff("select public.import_variants_batch($1::jsonb, '{}'::jsonb) as r", [
      JSON.stringify(vplans.map((p) => p.payload)),
    ])
  ).rows[0].r;
  ok(vres.length === 2 && vres.every((r) => r.action === "created"), "two variants created");
  const v1 = (
    await q(
      "select option_values, stock, price, compare_at_price, name from product_variants where sku = 'COS-1-6-RED'",
    )
  )[0];
  ok(
    v1.option_values.clothing_size === "6-7Y" &&
      v1.option_values.colour === "Red" &&
      v1.price === null &&
      Number(v1.compare_at_price) === 3000 &&
      v1.name === "6-7Y / Red",
    "options stored as the defined values; blank price = product price",
  );
  const again = planVariants(
    rowsOf([{ product_sku: "COS-1", variant_sku: "COS-1-6-RED", stock: "10" }]),
    ctx,
    vprods,
    (
      await staff("select public.import_lookup_variants($1::jsonb) as r", [
        JSON.stringify({ product_ids: vprods.map((p) => p.id), skus: ["COS-1-6-RED"] }),
      ])
    ).rows[0].r,
    [],
    { headerOf: {} },
  );
  await staff("select public.import_variants_batch($1::jsonb, '{}'::jsonb)", [
    JSON.stringify(again.map((p) => p.payload)),
  ]);
  const v1b = (
    await q("select stock, option_values from product_variants where sku = 'COS-1-6-RED'")
  )[0];
  ok(
    v1b.stock === 10 && v1b.option_values.colour === "Red",
    "upsert by variant_sku updated only the stock",
  );
  const otherPid = (await q("select id from products where sku = 'OLD-4'"))[0].id;
  await throws(
    staff("select public.import_variants_batch($1::jsonb, '{}'::jsonb)", [
      JSON.stringify([
        {
          row: 9,
          id: null,
          product_id: otherPid,
          set: { name: "x", sku: "COS-1-6-RED", option_values: { colour: "Red" } },
        },
      ]),
    ]),
    /import_batch_failed/,
    "a variant SKU used by another product fails the batch",
  );

  // ---- cost_price is still hidden from the public API roles
  await throws(
    as(db, "anon", null, "select cost_price from products limit 1"),
    /permission denied/,
    "anon still cannot read cost_price",
  );
  await throws(
    as(db, "authenticated", CUST, "select cost_price from products limit 1"),
    /permission denied/,
    "customers still cannot read cost_price",
  );
  ok(
    (await as(db, "anon", null, "select name, price from products where sku = 'NEW-1'")).rows
      .length === 1,
    "public can still read the imported product's public columns",
  );
  const lk = await lookup(rowsOf([{ sku: "NEW-1" }]));
  ok(lk.length === 1 && !("cost_price" in lk[0]), "lookup never returns cost_price");

  // ---- export → re-import: zero errors, nothing would change
  const exp =
    await q(`select p.*, coalesce((select array_agg(pc.category_id order by pc.is_primary desc, pc.created_at) from product_categories pc where pc.product_id = p.id), '{}') as category_ids
                       from products p where p.sku in ('OLD-1','OLD-2','NEW-0','NEW-1','COS-1')`);
  const sheet = exportProductRows(
    ctx,
    exp.map((p) => ({
      ...p,
      price: Number(p.price),
      sale_price: p.sale_price == null ? null : Number(p.sale_price),
      cost_price: p.cost_price == null ? null : Number(p.cost_price),
      new_arrival_until: p.new_arrival_until
        ? new Date(p.new_arrival_until).toISOString().slice(0, 10)
        : null,
    })),
  );
  const headers = resolveHeaders(sheet.headers, "products", ctx.definitions);
  const reRows = mapRows(
    sheet.rows.map((cells, i) => ({
      rowNumber: i + 2,
      cells: cells.map((c) => (c == null ? "" : String(c))),
    })),
    headers,
  );
  const rePlans = planProducts(reRows, ctx, await lookup(reRows), {
    ...opts,
    headerOf: headers.headerOf,
  });
  ok(
    rePlans.flatMap((p) => p.issues.filter((i) => i.level === "error")).length === 0,
    `export re-imports with 0 errors (${rePlans.flatMap((p) => p.issues.map((i) => i.message))})`,
  );
  ok(
    rePlans.every((p) => p.action === "update" && p.payload.category_ids === null),
    "every exported row matches its product and keeps its categories",
  );
});
