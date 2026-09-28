// Run with: npm test
// Homepage Phase 2: "Shop Deals" (catalog_search only=on_sale), settings columns, profile delivery city.
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";

test("Homepage 2: Shop Deals, header/footer settings, saved delivery city", async () => {
  const db = await makeDb();
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const search = async (p) =>
    (await as(db, "anon", null, "select catalog_search($1::jsonb) as r", [JSON.stringify(p)]))
      .rows[0].r;
  const cat = (slug) => one("select id from categories where slug=$1", [slug]).then((r) => r.id);
  const books = await cat("books"),
    costumes = await cat("character-costumes");
  const [P1, P2, P3, P4] = [1, 2, 3, 4].map((n) => `20000000-0000-0000-0000-00000000000${n}`);
  await db.exec(`insert into products(id,name,slug,price,sale_price,stock_quantity,category_id) values
    ('${P1}','On Sale Book','on-sale-book',1000,800,5,'${books}'),
    ('${P2}','Full Price Book','full-price-book',1000,null,5,'${books}'),
    ('${P3}','Costume With Was Price','costume-was',2600,null,5,'${costumes}'),
    ('${P4}','Costume No Was Price','costume-plain',2600,null,5,'${costumes}')`);
  await db.exec(`insert into product_variants(product_id,name,price,compare_at_price,stock,option_values) values
    ('${P3}','6-7Y / Blue',2400,3000,3,'{"clothing_size":"6-7Y","colour":"Blue"}'),
    ('${P4}','6-7Y / Blue',2400,2000,3,'{"clothing_size":"6-7Y","colour":"Blue"}')`);

  const deals = await search({ only: "on_sale", per_page: 60 });
  const slugs = deals.items.map((i) => i.slug).sort();
  ok(
    JSON.stringify(slugs) === JSON.stringify(["costume-was", "on-sale-book"]),
    `deals = sale price or variant below its was price (${slugs})`,
  );
  const costume = deals.items.find((i) => i.slug === "costume-was");
  ok(Number(costume.variant_was_max) === 3000, "variant was price returned for the card");
  const all = await search({ per_page: 60 });
  ok(all.total === 4, "without on_sale everything is listed");
  ok(
    all.items.find((i) => i.slug === "costume-plain").variant_was_max === null,
    "a lower 'was' price is ignored",
  );
  const inBooks = await search({ category: "books", only: "on_sale" });
  ok(
    inBooks.total === 1 && inBooks.items[0].slug === "on-sale-book",
    "deals combine with a category",
  );

  // Settings: defaults, seeded announcement, constraints
  const st = await one(
    "select theme_preset, announcement_enabled, announcements, pickup_enabled from store_settings where id",
  );
  if (st) {
    ok(
      st.theme_preset === "brand" &&
        st.announcement_enabled === true &&
        st.pickup_enabled === false,
      "safe defaults",
    );
    ok(
      Array.isArray(st.announcements) &&
        st.announcements.length === 1 &&
        /^Welcome to /.test(st.announcements[0].text),
      "starting announcement seeded",
    );
    await throws(
      db.exec("update store_settings set theme_preset='pink' where id"),
      /check constraint/,
      "unknown preset refused",
    );
    await throws(
      db.exec("update store_settings set whatsapp_number='+92 300' where id"),
      /check constraint/,
      "WhatsApp number must be digits",
    );
    await throws(
      db.exec("update store_settings set announcement_interval_seconds=0 where id"),
      /check constraint/,
      "interval 2–60 s",
    );
  }

  // Profile delivery city: own row only
  const A = "aaaaaaaa-0000-0000-0000-000000000001",
    B = "bbbbbbbb-0000-0000-0000-000000000002";
  await db.exec(`insert into auth.users(id,email) values ('${A}','a@x.com'),('${B}','b@x.com')`);
  await db.exec(
    `insert into profiles(id,email) values ('${A}','a@x.com'),('${B}','b@x.com') on conflict (id) do nothing`,
  );
  await as(
    db,
    "authenticated",
    A,
    `update profiles set delivery_method='delivery', delivery_city='Lahore' where id='${A}'`,
  );
  ok(
    (await one(`select delivery_city from profiles where id='${A}'`)).delivery_city === "Lahore",
    "shopper saves their city",
  );
  await as(db, "authenticated", A, `update profiles set delivery_city='Karachi' where id='${B}'`);
  ok(
    (await one(`select delivery_city from profiles where id='${B}'`)).delivery_city === null,
    "can't change someone else's",
  );
  await throws(
    as(db, "authenticated", A, `update profiles set delivery_method='drone' where id='${A}'`),
    /check constraint/,
    "method is delivery or pickup",
  );
});
