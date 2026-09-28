// Run with: npm test
// Catalog Phase D: catalog_search — category-specific filters (the Phase 1 filter
// map), price range, multi-category, variant-axis filters, sorting, facets.
import { test } from "vitest";
import { makeDb, as, ok } from "./harness.mjs";

let db;
const id = (n) => `20000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
const search = async (params) => (await as(db, "anon", null, "select catalog_search($1::jsonb) as r", [JSON.stringify(params)])).rows[0].r;
const keys = (r) => r.facets.map((f) => f.key).sort();

test("Phase D: each category page shows only its own filters (filter map)", async () => {
  db = await makeDb();
  const cat = async (slug) => (await db.query("select id from categories where slug=$1", [slug])).rows[0].id;
  await db.exec(`insert into categories(name, slug, parent_id, show_in_nav) values
    ('School Books','school-books',(select id from categories where slug='books'),true),
    ('Board Games','board-games',(select id from categories where slug='toys-games'),true),
    ('Cricket','cricket',(select id from categories where slug='sports-items'),true)`);
  let n = 0;
  const add = async (slug, attrs, extra = {}) => {
    n++;
    const pid = id(n);
    await db.query(
      `insert into products(id,name,slug,price,stock_quantity,attributes,category_id,sell_unit,pack_size,created_at)
       values ($1,$2,$3,$4,10,$5::jsonb,$6,$7,$8, now() - ($9 || ' days')::interval)`,
      [pid, `P${n} ${slug}`, `p${n}`, extra.price ?? 100 * n, JSON.stringify(attrs), await cat(slug), extra.sell_unit ?? "item", extra.pack_size ?? null, String(extra.age ?? n)],
    );
    return pid;
  };
  await add("school-books", { age_group: "6-8", author: "Umera Ahmed", publisher: "Oxford", season: "2026-27 Session" });
  await add("notebooks", { subjects: 5, binding_type: "Spiral" });
  await add("sketch-books", { paper_size: "A4", pages: 60 });
  await add("drafting-pads", { paper_size: "A3", binding_type: "Glued Pad", pages: 40 });
  await add("gift-wrapping-sheets", { paper_size: "A3" }, { sell_unit: "pack", pack_size: 6 });
  await add("gift-bags", { paper_size: "A5", occasion: "Eid", colour: "Red" });
  await add("money-folders", {}, { sell_unit: "pack", pack_size: 12 });
  await add("board-games", { gender: "Unisex", age_group: "9-12" });
  await add("cricket", { age_group: "13+", gender: "Boys" });
  const costume = await add("character-costumes", { gender: "Girls" });
  await db.exec(`insert into product_variants(product_id,name,stock,option_values) values
    ('${costume}','4-5Y Red',3,'{"clothing_size":"4-5Y","colour":"Red"}'),
    ('${costume}','6-7Y Blue',0,'{"clothing_size":"6-7Y","colour":"Blue"}')`);

  const expected = {
    books: ["age_group", "author", "publisher", "season"],
    stationery: [],
    notebooks: ["binding_type", "subjects"],
    "sketch-books": ["pages", "paper_size"],
    "drafting-pads": ["binding_type", "pages", "paper_size"],
    gifts: [],
    "gift-wrapping-sheets": ["paper_size"],
    "gift-bags": ["colour", "occasion", "paper_size"],
    "money-folders": [],
    "toys-games": ["age_group", "gender"],
    "sports-items": ["age_group", "gender"],
    "character-costumes": ["clothing_size", "colour", "gender"],
  };
  for (const [slug, want] of Object.entries(expected)) {
    const r = await search({ category: slug });
    ok(JSON.stringify(keys(r)) === JSON.stringify(want), `${slug}: filters ${JSON.stringify(keys(r))} = ${JSON.stringify(want)}`);
    ok(r.price.min != null, `${slug}: price range present`);
  }
  // Type (sub-category) filter on parents
  ok((await search({ category: "stationery" })).types.map((t) => t.value).join() === "notebooks,sketch-books,drafting-pads", "Stationery Type = Notebooks / Sketch Books / Drafting Pads");
  ok((await search({ category: "gifts" })).types.map((t) => t.value).join() === "gift-wrapping-sheets,gift-bags,money-folders", "Gifts Type = Wrapping Sheets / Gift Bags / Money Folders");
  ok((await search({ category: "books" })).types.map((t) => t.value).join() === "school-books", "Books Type = its sub-categories");
  // /shop: only Category (top-level), price, sort
  const shop = await search({});
  ok(shop.facets.length === 0 && shop.types.length === 6 && shop.total === 10, `/shop: no attribute filters, 6 categories, all products (${shop.total})`);
  // Costumes size/colour come from IN-STOCK variants only
  const cos = await search({ category: "character-costumes" });
  const sizes = cos.facets.find((f) => f.key === "clothing_size").options.map((o) => o.value);
  ok(JSON.stringify(sizes) === '["4-5Y"]', `out-of-stock size hidden (${sizes})`);
  ok((await search({ category: "character-costumes", filters: { clothing_size: ["6-7Y"] } })).total === 0, "filtering by an out-of-stock size finds nothing");
  ok((await search({ category: "character-costumes", filters: { clothing_size: ["4-5Y"], colour: ["Red"] } })).total === 1, "size + colour must match the same in-stock variant");
  ok((await search({ category: "character-costumes", filters: { clothing_size: ["4-5Y"], colour: ["Blue"] } })).total === 0, "size and colour on different variants don't match");
  // Unknown filter keys are ignored (e.g. carried over from another category)
  ok((await search({ category: "notebooks", filters: { colour: ["Red"] } })).total === 1, "filters that don't exist in this category are ignored");
});

test("Phase D: price range, multi-category, facet counts, sorting, search", async () => {
  db = await makeDb();
  const cat = async (slug) => (await db.query("select id from categories where slug=$1", [slug])).rows[0].id;
  const books = await cat("books"), gifts = await cat("gifts");
  const mk = (i, name, price, attrs, catId, extra = "") =>
    db.query(`insert into products(id,name,slug,price,stock_quantity,attributes,category_id,created_at${extra ? "," + extra.split("=")[0] : ""})
              values ($1,$2,$3,$4,5,$5::jsonb,$6, now() - ($7 || ' days')::interval${extra ? "," + extra.split("=")[1] : ""})`,
      [id(i), name, `b${i}`, price, JSON.stringify(attrs), catId, String(i)]);
  await mk(1, "Alpha", 300, { age_group: "6-8", author: "Umera Ahmed" }, books);
  await mk(2, "Beta", 1200, { age_group: "9-12", author: "Umera Ahmed" }, books);
  await mk(3, "Gamma", 700, { age_group: "6-8", author: "Bano Qudsia" }, books, "is_new_arrival=true");
  await db.exec(`update products set sales_count = 50 where id='${id(2)}'; update products set sale_price = 250 where id='${id(1)}'`);
  await db.exec(`insert into product_categories(product_id, category_id) values ('${id(3)}', '${gifts}')`);

  let r = await search({ category: "books" });
  ok(r.total === 3 && r.price.min == 250 && r.price.max == 1200, `price range uses sale price (${r.price.min}-${r.price.max})`);
  r = await search({ category: "books", min_price: 500, max_price: 1000 });
  ok(r.total === 1 && r.items[0].name === "Gamma", "price filter");
  ok(r.price.min == 250 && r.price.max == 1200, "slider range ignores the price filter itself");
  const age = (res) => Object.fromEntries(res.facets.find((f) => f.key === "age_group").options.map((o) => [o.value, o.count]));
  r = await search({ category: "books", filters: { age_group: ["6-8"] } });
  ok(r.total === 2 && age(r)["9-12"] === 1 && age(r)["6-8"] === 2, "a facet's counts ignore its own selection (disjunctive)");
  const authors = r.facets.find((f) => f.key === "author").options.map((o) => `${o.value}:${o.count}`).sort().join();
  ok(authors === "Bano Qudsia:1,Umera Ahmed:1", `other facets narrowed by the selection (${authors})`);
  ok((await search({ category: "books", filters: { age_group: ["6-8", "9-12"] } })).total === 3, "multiple values = OR");
  ok((await search({ category: "gifts" })).items.some((i) => i.name === "Gamma"), "multi-category product listed in its second category");
  const names = async (sort) => (await search({ category: "books", sort })).items.map((i) => i.name).join();
  ok(await names("new_arrivals") === "Gamma,Alpha,Beta", "default sort: flagged new arrivals first, then newest");
  ok(await names("best_sellers") === "Beta,Alpha,Gamma", "best sellers by sales_count");
  ok(await names("price_asc") === "Alpha,Gamma,Beta" && await names("price_desc") === "Beta,Gamma,Alpha", "price sorts use the effective price");
  ok(await names("name") === "Alpha,Beta,Gamma", "name sort");
  ok((await search({ q: "bano" })).total === 1, "search matches attribute values (author)");
  ok((await search({ category: "books", per_page: 2, page: 2 })).items.length === 1, "pagination");
  ok((await search({ only: "best_sellers" })).total === 1, "best-seller section only lists products that sold");
  ok((await search({ category: "no-such-thing" })).not_found === true, "unknown category → not_found");
  await db.exec(`update categories set is_active=false where slug='gifts'`);
  ok((await search({ category: "gifts" })).not_found === true, "hidden category → not_found");
});
