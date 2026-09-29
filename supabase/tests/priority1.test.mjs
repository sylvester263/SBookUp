import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";
const count = async (sql, params) => (await db.query(sql, params)).rows[0].n;

let db;

test("Priority 1: secure orders, cost price, review moderation", async () => {
db = await makeDb();
// These suites cover bundle behaviour, so school features are switched on (Catalog Phase A hides them by default).
await db.exec("update store_settings set school_features_enabled = true");
const A = "aaaaaaaa-0000-0000-0000-000000000001", B = "bbbbbbbb-0000-0000-0000-000000000002";
const ADMIN = "cccccccc-0000-0000-0000-000000000003", MGR = "dddddddd-0000-0000-0000-000000000004";
const P1 = "20000000-0000-0000-0000-000000000001", P2 = "20000000-0000-0000-0000-000000000002";
const BUNDLE = "40000000-0000-0000-0000-000000000001", SB = "50000000-0000-0000-0000-000000000001";
await db.exec(`
  insert into auth.users(id,email) values ('${A}','a@x.com'),('${B}','b@x.com'),('${ADMIN}','admin@x.com'),('${MGR}','m@x.com');
  insert into user_roles(user_id, role) values ('${ADMIN}','admin'),('${MGR}','manager');
  update store_settings set tax_rate = 10;
  insert into categories(id,name,slug) values ('11111111-1111-1111-1111-111111111111','Test Books','test-books');
  insert into products(id,name,slug,price,sale_price,cost_price,stock_quantity,weight_grams,category_id) values
    ('${P1}','Maths 5','maths-5',1000,800,500,10,500,'11111111-1111-1111-1111-111111111111'),
    ('${P2}','English 5','english-5',600,null,300,2,500,null),
    ('20000000-0000-0000-0000-000000000003','Hidden','hidden',100,null,50,5,0,null);
  update products set is_active=false where slug='hidden';
  insert into product_variants(id,product_id,name,price_modifier,stock) values ('30000000-0000-0000-0000-000000000001','${P1}','Hardcover',200,1);
  insert into bundles(id,name,slug,total_price,discounted_price) values ('${BUNDLE}','Class 5 set','c5',1600,1300);
  insert into bundle_items(bundle_id,product_id,quantity) values ('${BUNDLE}','${P1}',1),('${BUNDLE}','${P2}',1);
  insert into school_bundles(id, school_id, class_id, bundle_name, total_price)
    select '${SB}', s.id, c.id, 'Full list', 1500 from schools s join school_classes c on c.school_id=s.id
    where s.slug='allied-school' and c.class_name='Class 5';
  insert into school_bundle_items(bundle_id, product_id, item_type, quantity) values ('${SB}','${P1}','book',2);
  insert into shipping_zones(name,cities,base_rate,per_kg_rate,estimated_days) values ('Lahore','{Lahore}',200,100,2);
  insert into shipping_zones(name,cities,base_rate,per_kg_rate,estimated_days,created_at) values ('Rest of PK','{}',400,100,5, now() - interval '1 day');
  insert into coupons(code,type,value) values ('TENOFF','percentage',10),('FREESHIP','free_shipping',0);
  insert into coupons(code,type,value,valid_until) values ('OLD','fixed',100, now() - interval '1 day');
  insert into coupons(code,type,value,max_uses,uses_count) values ('USEDUP','fixed',100,5,5);
`);
const addr = JSON.stringify({ name: "Ali", phone: "+923001234567", street: "1 Mall Rd", city: "Lahore" });
const J = (x) => JSON.stringify(x);

console.log("1.3 cost_price");
await throws(as(db, "anon", null, "select cost_price from products"), /permission denied/, "anon cannot read cost_price");
await throws(as(db, "authenticated", A, "select * from products"), /permission denied/, "customer select * is refused");
await throws(as(db, "authenticated", ADMIN, "select cost_price from products"), /permission denied/, "staff can't read cost_price via API either (server uses service role)");
ok((await as(db, "anon", null, "select id,name,price,sale_price,stock_quantity from products")).rows.length === 2, "anon reads public columns (active products only)");
ok((await as(db, "service_role", null, "select cost_price from products where slug='maths-5'")).rows[0].cost_price == 500, "service role reads cost_price");
await as(db, "authenticated", ADMIN, "update products set cost_price = 450, description='x' where slug='maths-5'");
ok((await db.query("select cost_price from products where slug='maths-5'")).rows[0].cost_price == 450, "staff can still update cost_price");

console.log("1.2 direct order inserts");
await throws(as(db, "authenticated", A, `insert into orders(order_number,user_id,status,payment_status,total,shipping_address) values ('', '${A}', 'delivered','paid', 1, '{}')`), /row-level security|only be created/, "customer cannot insert an order directly");

console.log("1.1 quote_order / place_order");
const items = J([{ product_id: P1, quantity: 2, price: 1 }, { bundle_id: BUNDLE, quantity: 1 }]);
const q = (await as(db, "authenticated", A, "select quote_order($1::jsonb, 'Lahore', 'cod', null) as q", [items])).rows[0].q;
// subtotal 2*800 + 1300 = 2900; weight 2*500 + 500+500 = 2000g -> 200 + 2*100 = 400; COD 150; tax 10% of 2900 = 290
ok(q.subtotal == 2900, `subtotal 2900 from DB prices (client price 1 ignored): ${q.subtotal}`);
ok(q.delivery_fee == 400 && q.cod_fee == 150 && q.shipping == 550, `shipping 200 + 2kg*100 + COD 150: ${q.delivery_fee}+${q.cod_fee}`);
ok(q.tax == 290 && q.total == 3740, `tax 290, total 3740: ${q.tax}/${q.total}`);
ok(await count("select count(*)::int n from orders") === 0, "quote saved nothing");
const q2 = (await as(db, "authenticated", A, "select quote_order($1::jsonb, 'Karachi', 'bank_transfer', 'tenoff') as q", [items])).rows[0].q;
ok(q2.discount == 290 && q2.delivery_fee == 600 && q2.cod_fee == 0 && q2.tax == 261, `10% coupon, fallback zone, no COD: disc ${q2.discount} ship ${q2.delivery_fee} tax ${q2.tax}`);
const q3 = (await as(db, "authenticated", A, "select quote_order($1::jsonb, 'Lahore', 'cod', 'OLD') as q", [items])).rows[0].q;
ok(q3.coupon_error === "Coupon expired" && q3.discount == 0, "quote reports expired coupon");
const q4 = (await as(db, "authenticated", A, "select quote_order($1::jsonb, 'Lahore', 'cod', 'FREESHIP') as q", [items])).rows[0].q;
ok(q4.delivery_fee == 0 && q4.cod_fee == 150, "free-shipping coupon zeroes delivery (COD fee stays)");

await throws(as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod','USEDUP')", [items, addr]), /usage limit reached/, "used-up coupon blocks order");
await throws(as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod','OLD')", [items, addr]), /Coupon expired/, "expired coupon blocks order");
await throws(as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null)", [J([{ product_id: P2, quantity: 3 }]), addr]), /Not enough stock for "English 5": only 2 left/, "stock check names the item");
await throws(as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null)", [J([{ product_id: P2, quantity: 1 }, { bundle_id: BUNDLE, quantity: 2 }]), addr]), /English 5/, "stock check adds up bundle components");
await throws(as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null)", [J([{ product_id: "20000000-0000-0000-0000-000000000003", quantity: 1 }]), addr]), /no longer available/, "inactive product refused");
await throws(as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'stripe',null)", [items, addr]), /Unsupported payment/, "unsupported payment method refused");
await throws(as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null)", [items, J({ name: "x" })]), /incomplete/, "incomplete address refused");
await throws(as(db, "anon", null, "select place_order($1::jsonb,$2::jsonb,'cod',null)", [items, addr]), /permission denied/, "anon cannot place orders");
await throws(as(db, "authenticated", A, "select _compute_order($1::jsonb,'Lahore','cod',null)", [items]), /permission denied/, "internal pricing function not callable");
ok(await count("select count(*)::int n from orders") === 0, "failed attempts left no orders behind");

const r = (await as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod','tenoff','leave at gate') as r", [items, addr])).rows[0].r;
ok(/^SBE-\d{8}-\d{4}$/.test(r.order_number), `order number ${r.order_number}`);
const o = (await db.query("select * from orders where id=$1", [r.order_id])).rows[0];
ok(o.subtotal == 2900 && o.discount_amount == 290 && o.total == 3421 && o.status === "pending" && o.payment_status === "pending" && o.user_id === A, `order saved with server totals (total ${o.total})`);
ok(await count("select count(*)::int n from order_items where order_id=$1", [r.order_id]) === 2, "order items saved in the same transaction");
const st = Object.fromEntries((await db.query("select slug, stock_quantity from products")).rows.map((x) => [x.slug, x.stock_quantity]));
ok(st["maths-5"] === 7 && st["english-5"] === 1, `stock reduced once: maths 10-2-1=${st["maths-5"]}, english 2-1=${st["english-5"]}`);
ok((await db.query("select uses_count from coupons where code='TENOFF'")).rows[0].uses_count === 1, "coupon usage count increased");
const r2 = (await as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null) as r", [J([{ product_id: P1, variant_id: "30000000-0000-0000-0000-000000000001", quantity: 1 }, { school_bundle_id: SB, quantity: 1 }]), addr])).rows[0].r;
const lines = (await db.query("select name_snapshot, price_snapshot from order_items where order_id=$1 order by price_snapshot", [r2.order_id])).rows;
ok(lines[0].price_snapshot == 1000 && lines[1].price_snapshot == 1500, `variant 800+200 and school bundle 1500 (${lines.map((l) => l.name_snapshot).join(" | ")})`);
ok((await db.query("select stock from product_variants")).rows[0].stock === 0 && (await db.query("select stock_quantity from products where slug='maths-5'")).rows[0].stock_quantity === 5, "variant stock and school-bundle components reduced");

console.log("1.2 order updates");
await as(db, "authenticated", A, `update orders set status='delivered', total=1 where id='${r.order_id}'`);
ok((await db.query("select status from orders where id=$1", [r.order_id])).rows[0].status === "pending", "customer update has no effect");
await as(db, "authenticated", A, `delete from order_items where order_id='${r.order_id}'`);
ok(await count("select count(*)::int n from order_items where order_id=$1", [r.order_id]) === 2, "customer cannot delete order items");
await as(db, "authenticated", MGR, `update orders set status='delivered' where id='${r.order_id}'`);
ok((await db.query("select status from orders where id=$1", [r.order_id])).rows[0].status === "delivered", "manager can update order status");
ok((await as(db, "authenticated", A, "select id from orders")).rows.length === 2 && (await as(db, "authenticated", B, "select id from orders")).rows.length === 0, "customers see only their own orders");

console.log("1.4 reviews");
await as(db, "authenticated", B, `insert into reviews(product_id,user_id,rating,status,is_approved,is_verified_purchase) values ('${P1}','${B}',5,'approved',true,true)`);
let rv = (await db.query(`select * from reviews where user_id='${B}'`)).rows[0];
ok(rv.status === "pending" && !rv.is_approved && !rv.is_verified_purchase, "self-approval on insert ignored");
await as(db, "authenticated", B, `update reviews set status='approved', is_approved=true, is_verified_purchase=true where user_id='${B}'`);
rv = (await db.query(`select * from reviews where user_id='${B}'`)).rows[0];
ok(rv.status === "pending" && !rv.is_approved && !rv.is_verified_purchase, "self-approval on update ignored");
await as(db, "authenticated", A, `insert into reviews(product_id,user_id,rating) values ('${P1}','${A}',4)`);
ok((await db.query(`select is_verified_purchase v from reviews where user_id='${A}'`)).rows[0].v === true, "verified purchase worked out from the delivered order");
await as(db, "authenticated", MGR, `update reviews set status='approved' where user_id='${A}'`);
ok((await db.query(`select is_approved from reviews where user_id='${A}'`)).rows[0].is_approved === true, "staff approval works and syncs is_approved");
ok((await as(db, "anon", null, "select id from reviews")).rows.length === 1, "public sees only the approved review");
await as(db, "authenticated", A, `update reviews set body='changed' where user_id='${A}'`);
ok((await db.query(`select status from reviews where user_id='${A}'`)).rows[0].status === "pending", "customer edit sends review back to pending");
await throws(as(db, "authenticated", A, `select user_has_delivered_product('${B}','${P1}')`), /permission denied/, "can't probe other users' purchases");

});
