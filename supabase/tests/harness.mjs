// Loads all migrations from the repo into an in-memory Postgres with Supabase stubs.
import { expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export async function makeDb({ upTo } = {}) {
  const db = new PGlite({ extensions: { pg_trgm } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create schema storage;
    create table storage.buckets (id text primary key, name text, public boolean default false);
    create table storage.objects (id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to anon, authenticated, service_role;
    grant select, insert, update, delete on storage.objects to anon, authenticated, service_role;
    create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  `);
  const dir = path.join(REPO, "supabase/migrations");
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  for (const f of files) {
    if (upTo && f > upTo) break;
    try {
      await db.exec(fs.readFileSync(path.join(dir, f), "utf8"));
    } catch (e) {
      throw new Error(`Migration ${f} failed: ${e.message}`);
    }
  }
  return db;
}

// Run SQL as an API role with a given user id (like PostgREST does).
export async function as(db, role, uid, sql, params = []) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ""}', false);`);
  if (role) await db.exec(`set role ${role}`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec("reset role");
  }
}

// Soft assertions: every check runs and each failure is reported with its message.
export function ok(cond, message) {
  expect.soft(Boolean(cond), message).toBe(true);
}
export async function throws(promise, re, message) {
  try {
    await promise;
    expect.soft(false, `${message} (expected an error, got none)`).toBe(true);
  } catch (e) {
    expect.soft(re.test(e.message), `${message} -> "${e.message}"`).toBe(true);
  }
}
