// Run with: npm test
// Priority 2 behaviour tests. Run: node supabase/tests/priority2.test.mjs
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

let db;

test("Priority 2: profiles, cancel/restock, coupons, cart check, manager role", async () => {
db = await makeDb();
// These suites cover bundle behaviour, so school features are switched on (Catalog Phase A hides them by default).
await db.exec("update store_settings set school_features_enabled = true");
const A = "aaaaaaaa-0000-0000-0000-000000000001", B = "bbbbbbbb-0000-0000-0000-000000000002";
const ADMIN = "cccccccc-0000-0000-0000-000000000003", MGR = "dddddddd-0000-0000-0000-000000000004";
const P1 = "20000000-0000-0000-0000-000000000001", P2 = "20000000-0000-0000-0000-000000000002";
const BUNDLE = "40000000-0000-0000-0000-000000000001";
await db.exec(`
  insert into auth.users(id,email) values ('${A}','a@x.com'),('${B}','b@x.com'),('${ADMIN}','admin@x.com'),('${MGR}','m@x.com');
  update profiles set name = 'Ali' where id = '${A}';
  insert into user_roles(user_id, role) values ('${ADMIN}','admin'),('${MGR}','manager');
  insert into products(id,name,slug,price,stock_quantity) values ('${P1}','Maths 5','maths-5',800,10),('${P2}','English 5','english-5',600,3);
  insert into bundles(id,name,slug,total_price,discounted_price) values ('${BUNDLE}','Class 5 set','c5',1400,1200);
  insert into bundle_items(bundle_id,product_id,quantity) values ('${BUNDLE}','${P1}',1),('${BUNDLE}','${P2}',1);
  insert into coupons(code,type,value,max_uses) values ('ONCE','fixed',100,1);
`);
const addr = JSON.stringify({ name: "Ali", phone: "+923001234567", street: "1 Mall Rd", city: "Lahore" });
const place = async (uid, items, coupon = null) =>
  (await as(db, "authenticated", uid, "select place_order($1::jsonb,$2::jsonb,'cod',$3) as r", [JSON.stringify(items), addr, coupon])).rows[0].r;
const stock = async () => Object.fromEntries((await db.query("select slug, stock_quantity from products")).rows.map((x) => [x.slug, x.stock_quantity]));

console.log("2.1 staff read profiles");
ok((await as(db, "authenticated", ADMIN, "select id from profiles")).rows.length === 4, "admin sees all profiles");
ok((await as(db, "authenticated", MGR, "select id from profiles")).rows.length === 4, "manager sees all profiles");
ok((await as(db, "authenticated", A, "select id from profiles")).rows.length === 1, "customer sees only own profile");
await as(db, "authenticated", MGR, `update profiles set name='hacked' where id='${A}'`);
ok((await one(`select name from profiles where id='${A}'`)).name === "Ali", "staff got no write access to other profiles");

console.log("2.2 / 2.3 cancel, restock, coupon");
const o1 = await place(A, [{ product_id: P1, quantity: 2 }, { bundle_id: BUNDLE, quantity: 1 }], "ONCE");
let s = await stock();
ok(s["maths-5"] === 7 && s["english-5"] === 2, "stock taken on order");
ok((await one("select uses_count from coupons where code='ONCE'")).uses_count === 1, "coupon counted");
await throws(place(B, [{ product_id: P1, quantity: 1 }], "ONCE"), /usage limit/, "single-use coupon exhausted");
await throws(as(db, "authenticated", B, "select cancel_my_order($1)", [o1.order_id]), /Order not found/, "cannot cancel someone else's order");
const res = (await as(db, "authenticated", A, "select cancel_my_order($1) as r", [o1.order_id])).rows[0].r;
ok(res.status === "cancelled", "customer cancel works");
s = await stock();
ok(s["maths-5"] === 10 && s["english-5"] === 3, `stock returned incl. bundle contents (${s["maths-5"]}, ${s["english-5"]})`);
ok((await one("select uses_count from coupons where code='ONCE'")).uses_count === 0, "coupon use released");
ok((await one("select count(*)::int n from activity_logs where action='customer_cancelled'")).n === 1, "cancel logged");
await throws(as(db, "authenticated", A, "select cancel_my_order($1)", [o1.order_id]), /already cancelled/, "second cancel refused");
await throws(as(db, "authenticated", MGR, `update orders set status='pending' where id='${o1.order_id}'`), /cannot be re-opened/, "cancelled+restocked order can't be re-opened");

const o2 = await place(A, [{ product_id: P1, quantity: 1 }]);
await as(db, "authenticated", MGR, `update orders set status='shipped' where id='${o2.order_id}'`);
await throws(as(db, "authenticated", A, "select cancel_my_order($1)", [o2.order_id]), /already shipped/, "shipped order can't be cancelled by customer");
await as(db, "authenticated", ADMIN, `update orders set status='cancelled' where id='${o2.order_id}'`);
ok((await stock())["maths-5"] === 10, "admin cancel also restocks");
await as(db, "authenticated", ADMIN, `update orders set status='cancelled', notes='x' where id='${o2.order_id}'`);
ok((await stock())["maths-5"] === 10, "no double restock");

const o3 = await place(A, [{ product_id: P2, quantity: 1 }]);
await as(db, "authenticated", ADMIN, `update orders set payment_status='paid' where id='${o3.order_id}'`);
await throws(as(db, "authenticated", A, "select cancel_my_order($1)", [o3.order_id]), /already been paid/, "paid order needs staff to cancel");

// Legacy order (placed before this fix): coupon use was never counted
await db.exec(`insert into orders(order_number,user_id,status,total,shipping_address,coupon_code,coupon_counted) values ('OLD-1','${A}','pending',100,'{}','ONCE',false)`);
const legacy = (await one("select id from orders where order_number='OLD-1'")).id;
await db.exec(`update coupons set uses_count = 1 where code='ONCE'`);
await as(db, "authenticated", A, "select cancel_my_order($1)", [legacy]);
ok((await one("select uses_count from coupons where code='ONCE'")).uses_count === 1, "legacy order cancel does not lower coupon count");

console.log("2.4 cart_lines");
const cl = (await as(db, "anon", null, "select cart_lines($1::jsonb) as r", [JSON.stringify([{ product_id: P2, quantity: 5 }, { bundle_id: BUNDLE, quantity: 1 }, { product_id: "20000000-0000-0000-0000-000000000099", quantity: 1 }, { product_id: "not-a-uuid", quantity: 1 }])])).rows[0].r;
ok(cl[0].available === 2 && cl[0].unit_price == 600, `product available = stock (${cl[0].available})`);
ok(cl[1].available === 2 && cl[1].unit_price == 1200, `bundle available = min component stock (${cl[1].available})`);
ok(cl[2].available_for_sale === false && cl[3].available_for_sale === false, "unknown/garbage lines flagged, no error");

console.log("2.6 manager access");
const sid = (await one("select id from schools limit 1")).id;
await as(db, "authenticated", MGR, `update schools set city='Karachi' where id='${sid}'`);
ok((await one(`select city from schools where id='${sid}'`)).city === "Karachi", "manager can edit schools");
await as(db, "authenticated", MGR, `insert into school_classes(school_id,class_name) values ('${sid}','Class 11')`);
ok((await one(`select count(*)::int n from school_classes where class_name='Class 11'`)).n === 1, "manager can add classes");
ok((await as(db, "authenticated", MGR, "select id from activity_logs")).rows.length > 0, "manager can read activity log");
ok((await as(db, "authenticated", A, "select id from activity_logs")).rows.length === 0, "customer cannot read activity log");
await as(db, "authenticated", MGR, "update store_settings set tax_rate = 50");
ok(Number((await one("select tax_rate from store_settings")).tax_rate) === 0, "manager cannot change store settings");
await as(db, "authenticated", ADMIN, "update store_settings set tax_rate = 5");
ok(Number((await one("select tax_rate from store_settings")).tax_rate) === 5, "admin can change store settings");
await throws(as(db, "authenticated", MGR, "insert into shipping_zones(name,base_rate) values ('x',1)"), /row-level security/, "manager cannot add shipping zones");
await throws(as(db, "authenticated", MGR, `insert into user_roles(user_id,role) values ('${A}','admin')`), /row-level security|permission denied/, "manager cannot grant roles");
await throws(as(db, "authenticated", ADMIN, "delete from activity_logs"), /permission denied/, "activity log cannot be deleted through the API");

});
