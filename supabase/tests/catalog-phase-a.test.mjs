// Run with: npm test
// Catalog Phase A: school features hidden by default; bundle lines rejected while hidden.
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";

let db;

test("Phase A: school_features_enabled flag controls bundle lines", async () => {
  db = await makeDb();
  const A = "aaaaaaaa-0000-0000-0000-000000000001";
  const P1 = "20000000-0000-0000-0000-000000000001";
  const BUNDLE = "40000000-0000-0000-0000-000000000001";
  const SB = "50000000-0000-0000-0000-000000000001";
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@x.com');
    insert into products(id,name,slug,price,stock_quantity) values ('${P1}','Maths','maths',500,50);
    insert into bundles(id,name,slug,total_price,discounted_price) values ('${BUNDLE}','Set','set',1000,900);
    insert into bundle_items(bundle_id,product_id,quantity) values ('${BUNDLE}','${P1}',1);
    insert into school_bundles(id, school_id, class_id, bundle_name, total_price)
      select '${SB}', s.id, c.id, 'List', 1500 from schools s join school_classes c on c.school_id=s.id
      where s.slug='allied-school' and c.class_name='Class 5';
    insert into school_bundle_items(bundle_id, product_id, item_type, quantity) values ('${SB}','${P1}','book',2);
  `);
  const addr = JSON.stringify({ name: "Ali", phone: "+923001234567", street: "1 Mall Rd", city: "Lahore" });
  const quote = (items) => as(db, "authenticated", A, "select quote_order($1::jsonb,'Lahore','cod',null) as q", [JSON.stringify(items)]);
  const place = (items) => as(db, "authenticated", A, "select place_order($1::jsonb,$2::jsonb,'cod',null) as r", [JSON.stringify(items), addr]);
  const lines = async (items) => (await as(db, "anon", null, "select cart_lines($1::jsonb) as r", [JSON.stringify(items)])).rows[0].r;

  // Default: hidden
  ok((await db.query("select school_features_enabled from store_settings")).rows[0].school_features_enabled === false, "flag defaults to FALSE");
  await throws(quote([{ bundle_id: BUNDLE, quantity: 1 }]), /Bundles are no longer available/, "quote rejects bundle line while hidden");
  await throws(quote([{ school_bundle_id: SB, quantity: 1 }]), /School bundles are no longer available/, "quote rejects school bundle line while hidden");
  await throws(place([{ product_id: P1, quantity: 1 }, { bundle_id: BUNDLE, quantity: 1 }]), /no longer available/, "place_order rejects a cart containing a bundle");
  ok((await db.query("select count(*)::int n from orders")).rows[0].n === 0, "no order created");
  const cl = await lines([{ product_id: P1, quantity: 1 }, { bundle_id: BUNDLE, quantity: 1 }, { school_bundle_id: SB, quantity: 1 }]);
  ok(cl[0].available_for_sale && !cl[1].available_for_sale && !cl[2].available_for_sale, "cart check marks bundles unavailable, products fine");
  const q = (await quote([{ product_id: P1, quantity: 2 }])).rows[0].q;
  ok(q.subtotal == 1000, "normal products still price normally");

  // Switched on: exactly as before
  await db.exec("update store_settings set school_features_enabled = true");
  const q2 = (await quote([{ bundle_id: BUNDLE, quantity: 1 }, { school_bundle_id: SB, quantity: 1 }])).rows[0].q;
  ok(q2.subtotal == 2400, `bundles price again when enabled (${q2.subtotal})`);
  const cl2 = await lines([{ bundle_id: BUNDLE, quantity: 1 }, { school_bundle_id: SB, quantity: 1 }]);
  ok(cl2[0].available_for_sale && cl2[1].available_for_sale, "cart check allows bundles when enabled");
  const r = (await place([{ school_bundle_id: SB, quantity: 1 }])).rows[0].r;
  ok(!!r.order_number, "school bundle order placed when enabled");

  // Nothing dropped
  for (const t of ["bundles", "bundle_items", "schools", "school_classes", "school_bundles", "school_bundle_items"]) {
    ok((await db.query(`select count(*)::int n from ${t}`)).rows[0].n > 0, `${t} data kept`);
  }
});
