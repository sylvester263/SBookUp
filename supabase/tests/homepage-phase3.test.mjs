// Run with: npm test
// Homepage Phase 3: homepage_sections — public sees only live sections, staff
// manage them, banners are copied in once.
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { makeDb, as, ok, throws, REPO } from "./harness.mjs";

const MIGRATION = "20260928120000_homepage_sections.sql";
const sql = () => fs.readFileSync(path.join(REPO, "supabase/migrations", MIGRATION), "utf8");

test("Homepage 3: banners copied into sections once", async () => {
  const db = await makeDb({ upTo: "20260928119999" }); // everything before this migration
  await db.exec(`insert into banners(title, subtitle, image_url, link_url, position, display_order, is_active) values
    ('Back to school', 'New stock', 'https://x/a.jpg', '/shop/stationery', 'hero', 2, true),
    ('Gifts', null, 'https://x/b.jpg', null, 'hero', 1, true),
    ('Old hero', null, 'https://x/c.jpg', null, 'hero', 3, false),
    ('Sale strip', null, 'https://x/d.jpg', '/shop?on_sale=true', 'section', 1, true)`);
  await db.exec(sql());
  await db.exec(sql()); // idempotent
  const rows = (
    await db.query("select type, config, seed_key from homepage_sections order by sort_order")
  ).rows;
  ok(rows.length === 2, `one hero slider + one full banner (${rows.length})`);
  const hero = rows.find((r) => r.type === "hero_slider");
  ok(hero && hero.config.slides.length === 2, "active hero banners only");
  ok(
    hero &&
      hero.config.slides[0].heading === "Gifts" &&
      hero.config.slides[1].link.href === "/shop/stationery",
    "slides in display order with links",
  );
  ok(
    hero && hero.config.slides[0].image.width === 1920 && hero.config.slides[0].alt === "Gifts",
    "recommended size and alt text filled in",
  );
  ok(
    rows.some(
      (r) => r.type === "banner_full" && r.config.banner.link.href === "/shop?on_sale=true",
    ),
    "section banner copied",
  );
  ok((await db.query("select count(*)::int n from banners")).rows[0].n === 4, "banners table kept");
});

test("Homepage 3: public reads live sections only; staff write; customers can't", async () => {
  const db = await makeDb();
  await db.exec("delete from homepage_sections"); // start empty (later migrations seed defaults)
  const A = "aaaaaaaa-0000-0000-0000-000000000001",
    MGR = "dddddddd-0000-0000-0000-000000000004";
  await db.exec(
    `insert into auth.users(id,email) values ('${A}','a@x.com'),('${MGR}','m@x.com'); insert into user_roles(user_id, role) values ('${MGR}','manager');`,
  );
  await as(
    db,
    "authenticated",
    MGR,
    `insert into homepage_sections(type, title, config, sort_order, is_active, starts_at, ends_at) values
    ('price_bar', 'live', '{}', 1, true, null, null),
    ('price_bar', 'off', '{}', 2, false, null, null),
    ('price_bar', 'future', '{}', 3, true, now() + interval '1 day', null),
    ('price_bar', 'ended', '{}', 4, true, now() - interval '2 day', now() - interval '1 day'),
    ('price_bar', 'window', '{}', 5, true, now() - interval '1 day', now() + interval '1 day')`,
  );
  const pub = (
    await as(db, "anon", null, "select title from homepage_sections order by sort_order")
  ).rows.map((r) => r.title);
  ok(
    JSON.stringify(pub) === JSON.stringify(["live", "window"]),
    `anon sees live + in-window only (${pub})`,
  );
  const staff = (
    await as(db, "authenticated", MGR, "select count(*)::int n from homepage_sections")
  ).rows[0].n;
  ok(staff === 5, "staff see every section");
  await throws(
    as(
      db,
      "authenticated",
      A,
      "insert into homepage_sections(type, config) values ('price_bar', '{}')",
    ),
    /row-level security/,
    "customers can't add sections",
  );
  const upd = await as(db, "authenticated", A, "update homepage_sections set title = 'hacked'");
  ok(
    upd.affectedRows === 0 ||
      (await db.query("select count(*)::int n from homepage_sections where title='hacked'")).rows[0]
        .n === 0,
    "customers can't edit sections",
  );
  await throws(
    as(
      db,
      "authenticated",
      MGR,
      "insert into homepage_sections(type, config) values ('carousel_3d', '{}')",
    ),
    /check constraint/,
    "unknown type refused",
  );
  await throws(
    as(
      db,
      "authenticated",
      MGR,
      "insert into homepage_sections(type, config) values ('price_bar', '[]')",
    ),
    /check constraint/,
    "config must be an object",
  );
  await throws(
    as(
      db,
      "authenticated",
      MGR,
      "insert into homepage_sections(type, config, starts_at, ends_at) values ('price_bar', '{}', now(), now() - interval '1 hour')",
    ),
    /check constraint/,
    "end after start",
  );
});
