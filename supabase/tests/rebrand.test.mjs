// Run with: npm test
// Rebrand migration: store settings cleaned, homepage text renamed (publisher
// names untouched), private settings admin-only, admin role only for the
// configured email once it is verified.
import fs from "node:fs";
import path from "node:path";
import { test } from "vitest";
import { makeDb, as, ok, throws, REPO } from "./harness.mjs";

const ADMIN_EMAIL = "worldtimes07@gmail.com";
const OLD_ADMIN = "00000000-0000-0000-0000-00000000000a";
const CUSTOMER = "00000000-0000-0000-0000-00000000000c";
const U_PASSWORD = "00000000-0000-0000-0000-0000000000a1";
const U_GOOGLE = "00000000-0000-0000-0000-0000000000a2";
const U_OTHER = "00000000-0000-0000-0000-0000000000a3";

test("Rebrand: settings, homepage text, private settings, admin email", async () => {
  // Migrations up to the one before, so rows with the old name exist first
  const db = await makeDb({ upTo: "20260928130000_homepage_default_sections.sql" });
  await db.exec(`
    update store_settings set announcements = '[{"text":"Welcome to Jahangir''s Sons","href":null},{"text":"Free delivery","href":"/shop"}]';
    insert into homepage_sections (type, title, subtitle, config, sort_order, is_active)
    values ('banner_full', 'Jahangir''s Sons picks', 'Jahangir''s World Times guides',
      '{"banner":{"image":null,"alt":"Jahangir''s Sons store","heading":"Jahangirs Sons"}}', 99, true);
    insert into auth.users(id, email) values ('${OLD_ADMIN}', 'sb@x.com'), ('${CUSTOMER}', 'c@x.com');
    insert into user_roles(user_id, role) values ('${OLD_ADMIN}', 'admin');
  `);
  const sql = fs.readFileSync(
    path.join(REPO, "supabase/migrations/20260929100000_rebrand_schoolbooksexperts.sql"),
    "utf8",
  );
  await db.exec(sql);
  await db.exec(sql); // idempotent

  const s = (await db.query("select * from store_settings")).rows[0];
  ok(s.store_name === "SchoolBooksExperts", `store name (${s.store_name})`);
  ok(s.contact_email === ADMIN_EMAIL, `contact email (${s.contact_email})`);
  ok(
    s.footer_text === "© 2026 SchoolBooksExperts. All Rights Reserved.",
    `footer text (${s.footer_text})`,
  );
  ok(s.order_number_prefix === "SBE", `prefix (${s.order_number_prefix})`);
  ok(s.sender_email === null, "old jahangirssons sender email dropped");
  ok(
    !/jahangir|1968|uniform/i.test(JSON.stringify(s)),
    `no old brand text left: ${JSON.stringify(s)}`,
  );
  ok(s.announcements[1].text === "Free delivery", "other announcements kept");

  const h = (
    await db.query("select title, subtitle, config from homepage_sections where sort_order = 99")
  ).rows[0];
  ok(h.title === "SchoolBooksExperts picks", `section title renamed (${h.title})`);
  ok(h.subtitle === "Jahangir's World Times guides", `publisher name untouched (${h.subtitle})`);
  ok(
    h.config.banner.alt === "SchoolBooksExperts store" &&
      h.config.banner.heading === "SchoolBooksExperts",
    `banner text renamed (${JSON.stringify(h.config)})`,
  );

  // Private settings: admin-only, normalized
  const p = (await db.query("select * from store_private_settings")).rows[0];
  ok(
    JSON.stringify(p.admin_emails) === JSON.stringify([ADMIN_EMAIL]),
    `admin_emails (${p.admin_emails})`,
  );
  ok(
    p.order_notification_email === ADMIN_EMAIL &&
      p.contact_form_email === ADMIN_EMAIL &&
      p.reply_to_email === ADMIN_EMAIL,
    "notification recipients set",
  );
  await throws(
    as(db, "anon", null, "select * from store_private_settings"),
    /permission denied/,
    "visitors cannot read private settings",
  );
  ok(
    (await as(db, "authenticated", CUSTOMER, "select * from store_private_settings")).rows
      .length === 0,
    "customers see no private settings",
  );
  ok(
    (await as(db, "authenticated", OLD_ADMIN, "select * from store_private_settings")).rows
      .length === 1,
    "admins read private settings",
  );
  await as(
    db,
    "authenticated",
    OLD_ADMIN,
    "update store_private_settings set admin_emails = array[' WorldTimes07@Gmail.com ', 'worldtimes07@gmail.com', '']",
  );
  ok(
    JSON.stringify(
      (await db.query("select admin_emails from store_private_settings")).rows[0].admin_emails,
    ) === JSON.stringify([ADMIN_EMAIL]),
    "emails trimmed, lower-cased, de-duplicated",
  );
  await throws(
    as(db, "authenticated", CUSTOMER, "select grant_configured_admin_roles()"),
    /permission denied/,
    "customers cannot run the grant function",
  );

  const roles = async (id) =>
    (await db.query("select role from user_roles where user_id = $1 order by role", [id])).rows.map(
      (r) => r.role,
    );

  // Password sign-up with auto-confirm (no Google, confirmed at sign-up) → NOT admin
  await db.exec(
    `insert into auth.users(id, email, email_confirmed_at, created_at) values ('${U_PASSWORD}', 'WorldTimes07@gmail.com', now(), now())`,
  );
  ok(
    !(await roles(U_PASSWORD)).includes("admin"),
    "auto-confirmed password sign-up is not made admin",
  );
  await db.exec(
    `delete from user_roles where user_id='${U_PASSWORD}'; delete from profiles where id='${U_PASSWORD}'; delete from auth.users where id='${U_PASSWORD}'`,
  );

  // Password sign-up, confirms the email later → admin on confirmation
  await db.exec(
    `insert into auth.users(id, email, created_at) values ('${U_PASSWORD}', '${ADMIN_EMAIL}', now() - interval '10 minutes')`,
  );
  ok(!(await roles(U_PASSWORD)).includes("admin"), "unconfirmed sign-up is not admin yet");
  await db.exec(`update auth.users set email_confirmed_at = now() where id = '${U_PASSWORD}'`);
  ok((await roles(U_PASSWORD)).includes("admin"), "admin after confirming the email");
  await db.exec(
    `delete from user_roles where user_id='${U_PASSWORD}'; delete from profiles where id='${U_PASSWORD}'; delete from auth.users where id='${U_PASSWORD}'`,
  );

  // Google sign-up → admin straight away
  await db.exec(
    `insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data) values ('${U_GOOGLE}', '${ADMIN_EMAIL}', now(), '{"provider":"google","providers":["google"]}')`,
  );
  ok((await roles(U_GOOGLE)).includes("admin"), "Google sign-up with the admin email is admin");

  // Any other email → customer only
  await db.exec(
    `insert into auth.users(id, email, email_confirmed_at, raw_app_meta_data) values ('${U_OTHER}', 'someone@gmail.com', now(), '{"provider":"google"}')`,
  );
  ok(
    JSON.stringify(await roles(U_OTHER)) === JSON.stringify(["customer"]),
    "other emails stay customers",
  );

  // Existing admin untouched
  ok((await roles(OLD_ADMIN)).includes("admin"), "existing admin kept");
});

// The live project was missing the 2026-09-28 migrations when this was first
// run: the rebrand migration must still work on its own, and the later
// migrations must still apply after it.
test("Rebrand: runs before the 2026-09-28 migrations too", async () => {
  const dir = path.join(REPO, "supabase/migrations");
  const db = await makeDb({ upTo: "20260927100000_catalog_storefront.sql" });
  await db.exec(fs.readFileSync(path.join(dir, "20260929100000_rebrand_schoolbooksexperts.sql"), "utf8"));
  const s = (await db.query("select store_name, order_number_prefix, footer_text from store_settings")).rows[0];
  ok(s.store_name === "SchoolBooksExperts" && s.order_number_prefix === "SBE", `settings rebranded (${JSON.stringify(s)})`);
  for (const f of fs.readdirSync(dir).filter((x) => x > "20260927100000_catalog_storefront.sql" && x.endsWith(".sql")).sort()) {
    await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
  }
  const a = (await db.query("select announcements from store_settings")).rows[0].announcements;
  ok(a[0]?.text === "Welcome to SchoolBooksExperts", `later migrations start from the new name (${JSON.stringify(a)})`);
});
