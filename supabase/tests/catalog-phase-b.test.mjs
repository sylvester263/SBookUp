// Run with: npm test
// Catalog Phase B: category tree, multi-category, attributes, packs, variants, sales_count.
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { makeDb, as, ok, throws, REPO } from "./harness.mjs";

const PHASE_B = "20260925100000_catalog_data_model.sql";
const phaseBSql = () => fs.readFileSync(path.join(REPO, "supabase/migrations", PHASE_B), "utf8");
let db;
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const catId = async (slug) => (await one("select id from categories where slug=$1", [slug]))?.id;

test("Phase B: existing categories untouched by the seed; migration re-runnable", async () => {
  db = await makeDb({ upTo: "20260924999999" }); // everything before Phase B
  await db.exec(`insert into categories(name, slug, display_order) values ('My Notebooks', 'notebooks', 99), ('Party Essentials', 'party-essentials', 5)`);
  await db.exec(phaseBSql());
  const nb = await one("select name, parent_id, display_order from categories where slug='notebooks'");
  ok(nb.name === "My Notebooks" && nb.parent_id === null && nb.display_order === 99, "pre-existing 'notebooks' left as-is (mapping step decides)");
  ok(!!(await catId("party-essentials")), "unrelated existing category kept");
  ok(!!(await catId("sketch-books")) && !!(await catId("gift-bags")), "new seed categories created");
  await db.exec(phaseBSql()); // idempotent
  ok((await one("select count(*)::int n from categories where slug in ('books','stationery','gifts','toys-games','sports-items','character-costumes')")).n === 6, "re-running creates no duplicates");
  ok((await one("select count(*)::int n from attribute_definitions")).n === 12, "12 attributes, no duplicates");
});

test("Phase B: tree, multi-category, attributes, packs, variants, sales", async () => {
  db = await makeDb();
  await db.exec("update store_settings set school_features_enabled = true");
  const A = "aaaaaaaa-0000-0000-0000-000000000001", MGR = "dddddddd-0000-0000-0000-000000000004";
  const P1 = "20000000-0000-0000-0000-000000000001", P2 = "20000000-0000-0000-0000-000000000002", P3 = "20000000-0000-0000-0000-000000000003";
  const V1 = "30000000-0000-0000-0000-000000000001";
  await db.exec(`insert into auth.users(id,email) values ('${A}','a@x.com'),('${MGR}','m@x.com'); insert into user_roles(user_id, role) values ('${MGR}','manager');`);

  // ---- B1 tree
  const stationery = await catId("stationery"), notebooks = await catId("notebooks"), gifts = await catId("gifts");
  ok((await one("select parent_id from categories where slug='notebooks'")).parent_id === stationery, "Notebooks under Stationery");
  ok((await one("select parent_id from categories where slug='money-folders'")).parent_id === gifts, "Money Folders under Gifts");
  const top = (await db.query("select slug from categories where parent_id is null and show_in_nav order by display_order")).rows.map((r) => r.slug);
  ok(JSON.stringify(top) === JSON.stringify(["books", "stationery", "gifts", "toys-games", "sports-items", "character-costumes"]), `six areas in nav order (${top})`);
  const wrap = await one("select default_sell_unit, default_pack_size, default_unit_label from categories where slug='gift-wrapping-sheets'");
  ok(wrap.default_sell_unit === "pack" && wrap.default_pack_size === 6 && wrap.default_unit_label === "sheet", "Gift Wrapping Sheets default: pack of 6 sheets");
  ok((await one("select default_pack_size from categories where slug='money-folders'")).default_pack_size === 12, "Money Folders default: pack of 12");
  const desc = (await db.query("select * from category_descendants($1)", [stationery])).rows.length;
  ok(desc === 4, `Stationery subtree = itself + 3 children (${desc})`);

  // ---- B2 multi-category
  await db.exec(`insert into products(id,name,slug,price,stock_quantity,category_id) values ('${P1}','Spiral Notebook','spiral-nb',300,20,'${notebooks}')`);
  ok((await one(`select count(*)::int n from product_categories where product_id='${P1}' and category_id='${notebooks}' and is_primary`)).n === 1, "legacy category_id write creates the primary link");
  await as(db, "authenticated", MGR, `insert into product_categories(product_id, category_id) values ('${P1}', '${gifts}')`);
  const inStationery = (await db.query("select * from category_product_ids($1)", [stationery])).rows.map((r) => r.category_product_ids);
  const inGifts = (await db.query("select * from category_product_ids($1)", [gifts])).rows.map((r) => r.category_product_ids);
  ok(inStationery.includes(P1) && inGifts.includes(P1), "product listed in both categories and under parent");
  await as(db, "authenticated", MGR, `update product_categories set is_primary = true where product_id='${P1}' and category_id='${gifts}'`);
  ok((await one(`select category_id from products where id='${P1}'`)).category_id === gifts, "switching primary updates products.category_id");
  ok((await one(`select count(*)::int n from product_categories where product_id='${P1}' and is_primary`)).n === 1, "exactly one primary after switch");
  await as(db, "authenticated", MGR, `delete from product_categories where product_id='${P1}' and category_id='${gifts}'`);
  ok((await one(`select category_id from products where id='${P1}'`)).category_id === notebooks, "deleting the primary promotes the remaining category");
  await throws(as(db, "authenticated", A, `insert into product_categories(product_id, category_id) values ('${P1}', '${gifts}')`), /row-level security/, "customers cannot change product categories");
  ok((await as(db, "anon", null, `select * from product_categories where product_id='${P1}'`)).rows.length === 1, "public can read category links");

  // ---- B3 attributes
  const setOf = async (slug) => (await db.query("select key, inherited, is_variant_axis, is_required from category_attribute_set($1)", [await catId(slug)])).rows;
  const nbAttrs = (await setOf("notebooks")).map((r) => r.key).sort();
  ok(JSON.stringify(nbAttrs) === JSON.stringify(["binding_type", "subjects"]), `Notebooks attributes (${nbAttrs})`);
  const costume = await setOf("character-costumes");
  ok(costume.filter((r) => r.is_variant_axis).map((r) => r.key).sort().join() === "clothing_size,colour", "Costumes: size + colour are variant axes");
  // inheritance: a new child of Books gets Books' attributes
  await db.exec(`insert into categories(name, slug, parent_id) values ('Novels', 'novels', '${await catId("books")}')`);
  const novels = await setOf("novels");
  ok(novels.length === 4 && novels.every((r) => r.inherited), "child category inherits parent attributes (read-only/inherited)");
  ok((await one("select help_text from attribute_definitions where key='subjects'")).help_text === "20-page partition per subject", "Subjects note stored");
  // author/publisher single source of truth
  await db.exec(`insert into products(id,name,slug,price,stock_quantity,author) values ('${P2}','Novel','novel',900,5,'Umera Ahmed')`);
  ok((await one(`select attributes->>'author' a from products where id='${P2}'`)).a === "Umera Ahmed", "legacy author column copied into attributes");
  await db.exec(`update products set attributes = attributes || '{"author":"Bano Qudsia"}' where id='${P2}'`);
  ok((await one(`select author from products where id='${P2}'`)).author === "Bano Qudsia", "attributes drive the author column (mirror)");
  ok((await as(db, "anon", null, `select attributes, sell_unit, pack_size, sales_count, is_new_arrival from products where id='${P2}'`)).rows.length === 1, "new product columns are publicly readable");
  await throws(as(db, "anon", null, "select cost_price from products"), /permission denied/, "cost_price still hidden");

  // ---- B4 packs
  await db.exec(`insert into products(id,name,slug,price,stock_quantity,sell_unit,pack_size,unit_label,category_id)
                 values ('${P3}','Floral Wrap','floral-wrap',600,10,'pack',6,'sheet','${await catId("gift-wrapping-sheets")}')`);
  await throws(db.exec(`update products set pack_size = null where id='${P3}'`), /check constraint/, "a pack needs a pack size");
  const q = (await as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore','cod',null) as q", [JSON.stringify([{ product_id: P3, quantity: 2 }])])).rows[0].q;
  ok(q.subtotal == 1200 && q.lines[0].pack_size === 6 && q.lines[0].sell_unit === "pack" && q.lines[0].name === "Floral Wrap (pack of 6)", "quote: price per pack, quantity counts packs");
  await throws(as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore','cod',null)", [JSON.stringify([{ product_id: P3, quantity: 11 }])]), /only 10 left/, "stock counted in packs");
  const addr = JSON.stringify({ name: "Ali", phone: "+923001234567", street: "1 Mall Rd", city: "Lahore" });
  const r = (await as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null) as r", [JSON.stringify([{ product_id: P3, quantity: 2 }]), addr])).rows[0].r;
  const line = await one("select sell_unit, pack_size, price_snapshot, name_snapshot from order_items where order_id=$1", [r.order_id]);
  ok(line.sell_unit === "pack" && line.pack_size === 6 && Number(line.price_snapshot) === 600, "order line snapshots the pack");
  ok((await one(`select stock_quantity from products where id='${P3}'`)).stock_quantity === 8, "stock reduced by packs");
  const cl = (await as(db, "anon", null, "select cart_lines($1::jsonb) as r", [JSON.stringify([{ product_id: P3, quantity: 1 }])])).rows[0].r;
  ok(cl[0].pack_size === 6 && cl[0].sell_unit === "pack", "cart check reports pack info");

  // ---- B5 variants
  await db.exec(`insert into product_variants(id, product_id, name, price, stock, option_values) values
    ('${V1}', '${P1}', '6-7Y / Red', 1500, 3, '{"clothing_size":"6-7Y","colour":"Red"}')`);
  await throws(db.exec(`insert into product_variants(product_id, name, stock, option_values) values ('${P1}', 'dup', 1, '{"colour":"Red","clothing_size":"6-7Y"}')`), /duplicate key/, "option combination unique per product");
  const vq = (await as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore','cod',null) as q", [JSON.stringify([{ product_id: P1, variant_id: V1, quantity: 2 }])])).rows[0].q;
  ok(vq.subtotal == 3000 && vq.lines[0].variant_options.colour === "Red", "variant price used and options on the line");
  await throws(as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore','cod',null)", [JSON.stringify([{ product_id: P1, variant_id: V1, quantity: 4 }])]), /only 3 left/, "variant stock enforced");

  // ---- B6 sales_count
  const place = async (items) => (await as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null) as r", [JSON.stringify(items), addr])).rows[0].r;
  const o1 = await place([{ product_id: P2, quantity: 2 }]);
  const o2 = await place([{ product_id: P2, quantity: 1 }]);
  ok((await one(`select sales_count from products where id='${P2}'`)).sales_count === 0, "pending orders don't count");
  await as(db, "authenticated", MGR, `update orders set status='confirmed' where id='${o1.order_id}'`);
  await as(db, "authenticated", MGR, `update orders set status='confirmed' where id='${o2.order_id}'`);
  ok((await one(`select sales_count from products where id='${P2}'`)).sales_count === 3, "confirmed orders counted by trigger");
  await as(db, "authenticated", MGR, `update orders set status='cancelled' where id='${o2.order_id}'`);
  ok((await one(`select sales_count from products where id='${P2}'`)).sales_count === 2, "cancelled orders excluded");
  await db.exec(`update orders set created_at = now() - interval '120 days' where id='${o1.order_id}'`);
  await db.exec("select refresh_product_sales_counts()");
  ok((await one(`select sales_count from products where id='${P2}'`)).sales_count === 0, "only the last 90 days count (scheduled refresh)");
  await throws(as(db, "authenticated", A, "select refresh_product_sales_counts()"), /permission denied/, "customers can't run the refresh");
  ok((await one(`select is_new_arrival, new_arrival_until from products where id='${P2}'`)).is_new_arrival === false, "new-arrival flag defaults off");
});
