// Run with: npm test
// Catalog Phase E3: server-side pack / variant pricing (the browser's price is never
// used) and sales_count only counting real sales (cancelled / refunded excluded).
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";

let db;
const one = async (sql, params) => (await db.query(sql, params)).rows[0];
const A = "aaaaaaaa-0000-0000-0000-000000000001", MGR = "dddddddd-0000-0000-0000-000000000004";
const P = (n) => `20000000-0000-0000-0000-00000000000${n}`, V = (n) => `30000000-0000-0000-0000-00000000000${n}`;
const addr = JSON.stringify({ name: "Ali", phone: "+923001234567", street: "1 Mall Rd", city: "Lahore" });
const quote = async (items) => (await as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore','cod',null) as q", [JSON.stringify(items)])).rows[0].q;
const place = async (items) => (await as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null) as r", [JSON.stringify(items), addr])).rows[0].r;
const sales = async (pid) => (await one("select sales_count from products where id=$1", [pid])).sales_count;

test("Phase E: pack and variant prices are decided by the server", async () => {
  db = await makeDb();
  await db.exec(`insert into auth.users(id,email) values ('${A}','a@x.com'),('${MGR}','m@x.com'); insert into user_roles(user_id, role) values ('${MGR}','manager');`);
  const cat = (await one("select id from categories where slug='character-costumes'")).id;
  const wrap = (await one("select id from categories where slug='gift-wrapping-sheets'")).id;
  await db.exec(`insert into products(id,name,slug,price,sale_price,stock_quantity,category_id) values ('${P(1)}','Spider-Man Costume','spidey',2000,1800,0,'${cat}');
    insert into products(id,name,slug,price,sale_price,stock_quantity,sell_unit,pack_size,unit_label,category_id)
      values ('${P(2)}','Floral Wrap','floral-wrap',600,540,10,'pack',6,'sheet','${wrap}');
    insert into product_variants(id,product_id,name,price,price_modifier,stock,option_values,is_active) values
      ('${V(1)}','${P(1)}','6-7Y / Red',2500,0,5,'{"clothing_size":"6-7Y","colour":"Red"}',true),
      ('${V(2)}','${P(1)}','4-5Y / Red',null,-300,5,'{"clothing_size":"4-5Y","colour":"Red"}',true),
      ('${V(3)}','${P(1)}','8-9Y / Red',900,0,5,'{"clothing_size":"8-9Y","colour":"Red"}',false);`);

  // Browser-sent prices / totals are ignored
  const q = await quote([
    { product_id: P(1), variant_id: V(1), quantity: 1, price: 1, unit_price: 1 },
    { product_id: P(1), variant_id: V(2), quantity: 2, price: 1 },
    { product_id: P(2), quantity: 3, price: 1 },
  ]);
  ok(q.lines[0].unit_price == 2500, `variant's own price wins (${q.lines[0].unit_price})`);
  ok(q.lines[1].unit_price == 1500, `no variant price → sale price + modifier (${q.lines[1].unit_price})`);
  ok(q.lines[2].unit_price == 540 && q.lines[2].pack_size === 6, `pack sale price is per pack (${q.lines[2].unit_price})`);
  ok(q.subtotal == 2500 + 3000 + 1620, `subtotal from server prices (${q.subtotal})`);
  await throws(quote([{ product_id: P(1), variant_id: V(3), quantity: 1 }]), /no longer available/, "inactive variant can't be bought");
  await throws(quote([{ product_id: P(2), variant_id: V(1), quantity: 1 }]), /no longer available/, "a variant of another product is rejected");

  const r = await place([{ product_id: P(1), variant_id: V(2), quantity: 2, price: 1 }, { product_id: P(2), quantity: 1, price: 1 }]);
  const o = await one("select subtotal from orders where id=$1", [r.order_id]);
  ok(Number(o.subtotal) === 3540, `placed order uses server prices (${o.subtotal})`);
  ok((await one(`select stock from product_variants where id='${V(2)}'`)).stock === 3, "variant stock reduced, not the product's");

  // sales_count: only confirmed-onwards (or paid) orders, never cancelled/refunded
  const o2 = await place([{ product_id: P(2), quantity: 2 }]);
  ok((await sales(P(2))) === 0, "pending orders don't count");
  await as(db, "authenticated", MGR, `update orders set status='confirmed' where id in ('${r.order_id}','${o2.order_id}')`);
  ok((await sales(P(2))) === 3 && (await sales(P(1))) === 2, "confirmed orders count (packs and variants)");
  await as(db, "authenticated", MGR, `update orders set status='refunded' where id='${o2.order_id}'`);
  ok((await sales(P(2))) === 1, "refunded orders excluded");
  await as(db, "authenticated", MGR, `update orders set status='cancelled' where id='${r.order_id}'`);
  ok((await sales(P(2))) === 0 && (await sales(P(1))) === 0, "cancelled orders excluded");
  await throws(as(db, "authenticated", MGR, `update orders set status='confirmed' where id='${r.order_id}'`), /cannot be re-opened/, "a cancelled order can't be re-opened to inflate counts");
  const o3 = await place([{ product_id: P(1), variant_id: V(1), quantity: 1 }]);
  await as(db, "authenticated", MGR, `update orders set status='delivered' where id='${o3.order_id}'`);
  ok((await sales(P(1))) === 1, "delivered orders count");
});
