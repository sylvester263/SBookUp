// Run with: npm test
// Priority 3 behaviour tests. Run: node supabase/tests/priority3.test.mjs
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

let db;

test("Priority 3: variants, free delivery, school bundles, payment proof", async () => {
db = await makeDb();
// These suites cover bundle behaviour, so school features are switched on (Catalog Phase A hides them by default).
await db.exec("update store_settings set school_features_enabled = true");
const A = "aaaaaaaa-0000-0000-0000-000000000001", B = "bbbbbbbb-0000-0000-0000-000000000002";
const MGR = "dddddddd-0000-0000-0000-000000000004";
const P1 = "20000000-0000-0000-0000-000000000001", V1 = "30000000-0000-0000-0000-000000000001", V2 = "30000000-0000-0000-0000-000000000002";
const SB = "50000000-0000-0000-0000-000000000001";
await db.exec(`
  insert into auth.users(id,email) values ('${A}','a@x.com'),('${B}','b@x.com'),('${MGR}','m@x.com');
  insert into user_roles(user_id, role) values ('${MGR}','manager');
  insert into products(id,name,slug,price,stock_quantity,weight_grams) values ('${P1}','Atlas','atlas',1000,20,1000);
  insert into product_variants(id,product_id,name,price_modifier,price,stock,weight_grams) values
    ('${V1}','${P1}','Hardcover',0,1500,5,2000),
    ('${V2}','${P1}','Old',100,null,5,null);
  insert into shipping_zones(name,cities,base_rate,per_kg_rate,free_shipping_threshold) values ('Lahore','{Lahore}',200,0,5000);
  insert into school_bundles(id, school_id, class_id, bundle_name, total_price)
    select '${SB}', s.id, c.id, 'Full list', 2500 from schools s join school_classes c on c.school_id=s.id
    where s.slug='allied-school' and c.class_name='Class 5';
  insert into school_bundle_items(bundle_id, product_id, item_type, quantity) values ('${SB}','${P1}','book',3);
`);
const addr = JSON.stringify({ name: "Ali", phone: "+923001234567", street: "1 Mall Rd", city: "Lahore" });
const quote = async (items, pay = "cod") => (await as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore',$2,null) as q", [JSON.stringify(items), pay])).rows[0].q;
const place = async (uid, items, pay = "cod") => (await as(db, "authenticated", uid, "select place_order($1::jsonb,$2::jsonb,$3,null) as r", [JSON.stringify(items), addr, pay])).rows[0].r;

console.log("3.4 variants");
let q = await quote([{ product_id: P1, variant_id: V1, quantity: 1 }]);
ok(q.subtotal == 1500, `variant own price overrides product price (${q.subtotal})`);
q = await quote([{ product_id: P1, variant_id: V2, quantity: 1 }]);
ok(q.subtotal == 1100, `variant without own price = product + modifier (${q.subtotal})`);
q = await quote([{ product_id: P1, variant_id: V1, quantity: 2 }]);
ok(q.weight_grams == 4000, `variant weight used (${q.weight_grams}g)`);
await db.exec(`update product_variants set is_active=false where id='${V2}'`);
await throws(quote([{ product_id: P1, variant_id: V2, quantity: 1 }]), /no longer available/, "inactive variant refused");
const cl = (await as(db, "anon", null, "select cart_lines($1::jsonb) as r", [JSON.stringify([{ product_id: P1, variant_id: V1, quantity: 1 }, { product_id: P1, variant_id: V2, quantity: 1 }])])).rows[0].r;
ok(cl[0].unit_price == 1500 && cl[0].available === 5 && cl[1].available_for_sale === false, "cart_lines uses variant price/stock/active");

console.log("3.5 free-delivery threshold");
q = await quote([{ product_id: P1, quantity: 4 }]);
ok(q.delivery_fee == 200 && !q.free_shipping, "below threshold pays delivery");
q = await quote([{ product_id: P1, quantity: 5 }]);
ok(q.delivery_fee == 0 && q.free_shipping && q.cod_fee == 150, "at threshold delivery is free (COD fee stays)");

console.log("3.6 school bundle as one line");
q = await quote([{ school_bundle_id: SB, quantity: 1 }]);
ok(q.subtotal == 2500 && q.lines.length === 1, "school bundle priced at bundle price, one line");
const sbo = await place(A, [{ school_bundle_id: SB, quantity: 1 }]);
ok((await one("select stock_quantity from products where id=$1", [P1])).stock_quantity === 17, "every item in the school bundle reduces stock");

console.log("3.1 payment switches + proof");
await throws(quote([{ product_id: P1, quantity: 1 }], "jazzcash"), /not available/, "JazzCash off by default");
await throws(place(A, [{ product_id: P1, quantity: 1 }], "easypaisa"), /not available/, "EasyPaisa off by default");
await db.exec("update store_settings set enable_cod = false");
await throws(place(A, [{ product_id: P1, quantity: 1 }], "cod"), /not available/, "disabled COD refused");
await db.exec("update store_settings set enable_cod = true");
const bt = await place(A, [{ product_id: P1, quantity: 1 }], "bank_transfer");
const path = `${A}/${bt.order_id}/proof.webp`;
await throws(as(db, "authenticated", B, "select attach_payment_proof($1,$2)", [bt.order_id, `${B}/${bt.order_id}/x.webp`]), /Order not found/, "cannot attach proof to another customer's order");
await throws(as(db, "authenticated", A, "select attach_payment_proof($1,$2)", [bt.order_id, `${B}/${bt.order_id}/x.webp`]), /Invalid file path/, "proof must be in own folder");
await throws(as(db, "authenticated", A, "select attach_payment_proof($1,$2)", [sbo.order_id, `${A}/${sbo.order_id}/x.webp`]), /only needed for bank transfer/, "COD orders don't take proofs");
await as(db, "authenticated", A, "select attach_payment_proof($1,$2)", [bt.order_id, path]);
const o = await one("select payment_status, payment_proof_path from orders where id=$1", [bt.order_id]);
ok(o.payment_status === "pending_verification" && o.payment_proof_path === path, "proof attached, status pending_verification");
await as(db, "authenticated", MGR, `update orders set payment_status='paid' where id='${bt.order_id}'`);
ok((await one("select payment_status from orders where id=$1", [bt.order_id])).payment_status === "paid", "staff mark paid");
await throws(as(db, "authenticated", A, "select attach_payment_proof($1,$2)", [bt.order_id, path]), /no longer needs/, "no proof after paid");

console.log("storage policies");
await db.exec(`insert into storage.objects(bucket_id,name) values ('payment-proofs','${path}')`);
ok((await as(db, "authenticated", A, "select name from storage.objects where bucket_id='payment-proofs'")).rows.length === 1, "owner can read own proof");
ok((await as(db, "authenticated", B, "select name from storage.objects where bucket_id='payment-proofs'")).rows.length === 0, "other customers cannot read it");
ok((await as(db, "authenticated", MGR, "select name from storage.objects where bucket_id='payment-proofs'")).rows.length === 1, "staff can read it");
ok((await one("select public from storage.buckets where id='payment-proofs'")).public === false, "bucket is private");

console.log("3.2 / 3.3 tables");
ok((await as(db, "authenticated", A, "select id from newsletter_campaigns")).rows.length === 0, "customers see no campaigns");
await as(db, "authenticated", MGR, `insert into newsletter_campaigns(subject, body, sent_by) values ('Hi','Body','${MGR}')`);
ok((await as(db, "authenticated", MGR, "select id from newsletter_campaigns")).rows.length === 1, "staff can log campaigns");

});
