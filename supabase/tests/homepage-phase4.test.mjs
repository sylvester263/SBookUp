// Run with: npm test
// Homepage Phase 4: the default sections seed matches the code's fallback layout,
// validates, is idempotent, and doesn't add a second hero.
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { makeDb, ok, REPO } from "./harness.mjs";
import { DEFAULT_HOME_LAYOUT } from "../../src/lib/homepage-default.ts";
import { validateSection } from "../../src/lib/homepage-sections.ts";

const SEED = "20260928130000_homepage_default_sections.sql";
const seedSql = () => fs.readFileSync(path.join(REPO, "supabase/migrations", SEED), "utf8");
const cols = "seed_key, type, title, subtitle, sort_order, is_active, config";

test("Homepage 4: default sections = code fallback, valid, idempotent", async () => {
  const db = await makeDb();
  const rows = (await db.query(`select ${cols} from homepage_sections order by sort_order`)).rows;
  ok(rows.length === 13, `13 default sections (${rows.length})`);
  // jsonb reorders object keys, so compare with keys sorted
  const canon = (v) =>
    JSON.stringify(v, (_, x) =>
      x && typeof x === "object" && !Array.isArray(x)
        ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
        : x,
    );
  const expected = DEFAULT_HOME_LAYOUT.map((d) => ({
    seed_key: d.seed_key,
    type: d.type,
    title: d.title,
    subtitle: d.subtitle,
    sort_order: d.sort_order,
    is_active: d.is_active,
    config: d.config,
  }));
  rows.forEach((r, i) =>
    ok(
      canon(r) === canon(expected[i]),
      `${r.seed_key} matches DEFAULT_HOME_LAYOUT[${i}] (${expected[i]?.seed_key})\n db:   ${canon(r)}\n code: ${canon(expected[i])}`,
    ),
  );
  for (const r of rows) {
    let err = null;
    try {
      validateSection({ ...r, starts_at: null, ends_at: null });
    } catch (e) {
      err = e.message;
    }
    ok(err === null, `${r.seed_key} config is valid (${err})`);
  }
  ok(rows.find((r) => r.type === "app_banner").is_active === false, "app banner is off by default");
  const order = rows.map((r) => r.type).join(",");
  ok(
    order ===
      "hero_slider,product_carousel,category_circles,banner_full,banner_with_products,banner_pair,banner_with_products,banner_full,price_bar,product_carousel,product_carousel,promo_tiles,app_banner",
    "reference order",
  );
  await db.exec(seedSql());
  ok(
    (await db.query("select count(*)::int n from homepage_sections")).rows[0].n === 13,
    "re-running adds nothing",
  );
});

test("Homepage 4: no second hero when the old banners already made one", async () => {
  const db = await makeDb({ upTo: "20260928129999" });
  await db.exec(
    `insert into homepage_sections(type, config, seed_key) values ('hero_slider', '{"slides": [], "interval_seconds": 5}', 'migrated_banners_hero')`,
  );
  await db.exec(seedSql());
  const heroes = (
    await db.query("select seed_key from homepage_sections where type = 'hero_slider'")
  ).rows;
  ok(
    heroes.length === 1 && heroes[0].seed_key === "migrated_banners_hero",
    "existing hero kept, default hero skipped",
  );
  ok(
    (await db.query("select count(*)::int n from homepage_sections")).rows[0].n === 13,
    "the other 12 defaults added",
  );
});
