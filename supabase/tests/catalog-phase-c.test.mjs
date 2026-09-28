// Run with: npm test
// Catalog Phase C: attribute option usage (for the "option in use" warning).
import { test } from "vitest";
import { makeDb, as, ok, throws } from "./harness.mjs";

test("Phase C: attribute_option_usage counts products and variants, staff only", async () => {
  const db = await makeDb();
  const A = "aaaaaaaa-0000-0000-0000-000000000001", MGR = "dddddddd-0000-0000-0000-000000000004";
  await db.exec(`
    insert into auth.users(id,email) values ('${A}','a@x.com'),('${MGR}','m@x.com');
    insert into user_roles(user_id, role) values ('${MGR}','manager');
    insert into products(id,name,slug,price,attributes) values
      ('20000000-0000-0000-0000-000000000001','Bag 1','bag-1',100,'{"colour":"Red","occasion":"Eid"}'),
      ('20000000-0000-0000-0000-000000000002','Bag 2','bag-2',100,'{"colour":"Red"}'),
      ('20000000-0000-0000-0000-000000000003','Kit','kit',100,'{"tags_multi":["A","B"]}');
    insert into product_variants(product_id,name,stock,option_values) values
      ('20000000-0000-0000-0000-000000000003','Blue L',1,'{"colour":"Blue"}');
  `);
  const usage = async (key) => Object.fromEntries((await as(db, "authenticated", MGR, "select * from attribute_option_usage($1)", [key])).rows.map((r) => [r.value, r]));
  const colour = await usage("colour");
  ok(colour.Red.products === 2 && colour.Red.variants === 0, "Red used by 2 products");
  ok(colour.Blue.products === 0 && colour.Blue.variants === 1, "Blue used by 1 variant");
  const multi = await usage("tags_multi");
  ok(multi.A.products === 1 && multi.B.products === 1, "multiselect values counted individually");
  ok(Object.keys(await usage("season")).length === 0, "unused attribute has no usage");
  await throws(as(db, "authenticated", A, "select * from attribute_option_usage('colour')"), /Staff only/, "customers can't query usage");
  await throws(as(db, "anon", null, "select * from attribute_option_usage('colour')"), /permission denied/, "visitors can't query usage");
});
