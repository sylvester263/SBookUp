// Run with: npm test
// Priority 4 clean-up checks: duplicate triggers, guest carts, order-number prefix.
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";

let db;
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

test("Priority 4: triggers run once, guest carts closed, order prefix setting", async () => {
  db = await makeDb();
  const A = "aaaaaaaa-0000-0000-0000-000000000001";
  const P1 = "20000000-0000-0000-0000-000000000001";
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@x.com');
    insert into products(id,name,slug,price,stock_quantity) values ('${P1}','Maths','maths',100,10);
  `);

  // 4.5 — exactly one trigger per job on each table
  const trig = async (table) =>
    (await db.query(
      `select tgname from pg_trigger t join pg_class c on c.oid = t.tgrelid
       where c.relname = $1 and not t.tgisinternal order by tgname`, [table])).rows.map((r) => r.tgname);
  for (const t of ["profiles", "addresses", "products", "categories", "bundles"]) {
    const names = await trig(t);
    ok(names.filter((n) => /updated_at/.test(n)).length === 1, `${t}: one updated_at trigger (${names.join(", ")})`);
  }
  const orderTrig = await trig("orders");
  ok(orderTrig.filter((n) => /number/.test(n)).length === 1, `orders: one order-number trigger (${orderTrig.join(", ")})`);
  ok(orderTrig.filter((n) => /updated_at/.test(n)).length === 1, "orders: one updated_at trigger");
  ok((await one(`select count(*)::int n from profiles where id='${A}'`)).n === 1, "signup creates exactly one profile");
  ok((await one(`select count(*)::int n from user_roles where user_id='${A}'`)).n === 1, "signup creates exactly one role");

  // 4.3 — order number prefix
  const addr = JSON.stringify({ name: "Ali", phone: "+923001234567", street: "1 Mall Rd", city: "Lahore" });
  const place = async () =>
    (await as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null) as r", [JSON.stringify([{ product_id: P1, quantity: 1 }]), addr])).rows[0].r;
  const first = await place();
  // Default is SBE since the rebrand migration (20260929100000); it was JSN before.
  ok(/^SBE-\d{8}-\d{4}$/.test(first.order_number), `default prefix is SBE (${first.order_number})`);
  await db.exec("update store_settings set order_number_prefix = 'ABC'");
  const second = await place();
  ok(/^ABC-\d{8}-\d{4}$/.test(second.order_number), `new prefix used for new orders (${second.order_number})`);
  ok((await one("select order_number from orders where id=$1", [first.order_id])).order_number === first.order_number, "existing order number not renamed");
  await throws(db.exec("update store_settings set order_number_prefix = 'bad prefix!'"), /check constraint/, "prefix format enforced");

  // 4.4 — guest carts
  await throws(as(db, "anon", null, "select * from cart_items"), /permission denied/, "visitors cannot read cart rows");
  await throws(as(db, "anon", null, "insert into cart_items(session_id, product_id, quantity) values ('x', $1, 1)", [P1]), /permission denied/, "visitors cannot write cart rows");
});
