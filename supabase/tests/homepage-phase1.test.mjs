// Run with: npm test
// Homepage Phase 1: variant compare-at ("was") price is display-only.
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";

test("Homepage 1.1: variant compare_at_price is stored, readable and never charged", async () => {
  const db = await makeDb();
  const A = "aaaaaaaa-0000-0000-0000-000000000001";
  const P = "20000000-0000-0000-0000-000000000001",
    V = "30000000-0000-0000-0000-000000000001";
  const one = async (sql) => (await db.query(sql)).rows[0];
  await db.exec(`insert into auth.users(id,email) values ('${A}','a@x.com')`);
  const cat = (await one("select id from categories where slug='character-costumes'")).id;
  await db.exec(
    `insert into products(id,name,slug,price,stock_quantity,category_id) values ('${P}','Pilot Costume','pilot',2600,10,'${cat}')`,
  );
  await db.exec(`insert into product_variants(id, product_id, name, price, compare_at_price, stock, option_values) values
    ('${V}', '${P}', '6-7Y / Blue', 2400, 3000, 5, '{"clothing_size":"6-7Y","colour":"Blue"}')`);

  const pub = (
    await as(db, "anon", null, `select compare_at_price from product_variants where id='${V}'`)
  ).rows[0];
  ok(Number(pub.compare_at_price) === 3000, "public can read the was price");

  const q = (
    await as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore','cod',null) as q", [
      JSON.stringify([{ product_id: P, variant_id: V, quantity: 2 }]),
    ])
  ).rows[0].q;
  ok(
    Number(q.subtotal) === 4800,
    `quote charges the variant price, not the was price (${q.subtotal})`,
  );

  await throws(
    db.exec(`update product_variants set compare_at_price = -1 where id='${V}'`),
    /check constraint/,
    "negative was price refused",
  );
  await db.exec(`update product_variants set compare_at_price = null where id='${V}'`);
  ok(
    (await one(`select compare_at_price from product_variants where id='${V}'`))
      .compare_at_price === null,
    "was price can be cleared",
  );
});
