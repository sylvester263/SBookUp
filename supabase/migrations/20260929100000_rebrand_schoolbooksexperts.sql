-- =====================================================================
-- Rebrand: Jahangir's Sons -> SchoolBooksExperts, plus the admin email.
-- Idempotent. Old migrations are NOT edited; this one runs after them, so
-- fresh installs end up with the same clean values as the live project.
--
--  1. store_settings: new public text columns (legal_name, footer_text,
--     invoice_header) and the rebranded values (name, email, SEO, sender,
--     announcements, WhatsApp message, order-number prefix SBE).
--     Existing orders keep their JSN- numbers: only NEW orders use SBE-.
--  2. Homepage sections / banners: the old store name is replaced in their
--     text. Only the store name ("Jahangir's Sons" and spellings of it) is
--     matched, so publisher / author names such as "Jahangir's World Times"
--     are untouched. Products are not touched at all.
--  3. store_private_settings (admin-only, NOT readable by the public, unlike
--     store_settings): admin_emails and the notification recipients.
--  4. Admin access for the emails in admin_emails:
--     - grant_configured_admin_roles(): gives 'admin' to existing accounts
--       with a verified email in the list (run once below).
--     - trigger on auth.users: gives 'admin' when such an account is created
--       or verifies its email later. No account or password is created here.
--     Existing admins / managers are never removed.
-- =====================================================================

-- ---------- 1. store_settings ----------
alter table public.store_settings
  add column if not exists legal_name text,
  add column if not exists footer_text text,
  add column if not exists invoice_header text;

-- Defaults for fresh rows (the 2026-06 migration's defaults named the old store)
alter table public.store_settings alter column store_name set default 'SchoolBooksExperts';
alter table public.store_settings alter column order_number_prefix set default 'SBE';

update public.store_settings set
  store_name       = 'SchoolBooksExperts',
  legal_name       = 'SchoolBooksExperts',
  contact_email    = 'worldtimes07@gmail.com',
  meta_title       = 'SchoolBooksExperts — Books, Stationery, Gifts, Toys & More in Pakistan',
  meta_description = 'Shop books, stationery, gifts, toys & games, sports items and character costumes online at SchoolBooksExperts. Delivery across Pakistan.',
  sender_name      = 'SchoolBooksExperts',
  -- The old orders@jahangirssons.com sender is dropped; the real "from"
  -- address is EMAIL_FROM on the server (it must be a verified domain).
  sender_email     = case when sender_email ilike '%jahangir%' then null else sender_email end,
  footer_text      = '© 2026 SchoolBooksExperts. All Rights Reserved.',
  invoice_header   = 'SchoolBooksExperts',
  order_number_prefix = 'SBE'
where id = true;

-- Same as 20260923130000, but the fallback (only used if the setting is ever
-- missing) is SBE instead of JSN. Existing order numbers are never changed.
create or replace function public.set_order_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_prefix text;
begin
  if new.order_number is null or new.order_number = '' then
    select order_number_prefix into v_prefix from public.store_settings where id = true;
    new.order_number := coalesce(nullif(v_prefix, ''), 'SBE') || '-' || to_char(now() at time zone 'Asia/Karachi', 'YYYYMMDD') || '-'
      || lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;

-- Bank text: swap the old store name.
update public.store_settings set
  bank_account_title = regexp_replace(bank_account_title, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi'),
  bank_instructions  = regexp_replace(bank_instructions, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi')
where id = true;

-- Announcement bar / WhatsApp / newsletter text (columns from the 2026-09-28
-- header/footer migration) and homepage sections. Skipped when those aren't
-- applied yet: they then start from the new store name anyway.
do $do$
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'store_settings' and column_name = 'announcements') then
    execute $sql$
      update public.store_settings set
        announcements = (
          select coalesce(jsonb_agg(
            case when a->>'text' ~* 'jahangir|1968'
              then jsonb_set(a, '{text}', to_jsonb('Welcome to SchoolBooksExperts — books, stationery, gifts, toys and more'::text))
              else a end order by ord), '[]'::jsonb)
          from jsonb_array_elements(announcements) with ordinality as t(a, ord)
        )
      where id = true and announcements::text ~* 'jahangir|1968'
    $sql$;
    execute $sql$
      update public.store_settings set
        whatsapp_message   = regexp_replace(whatsapp_message, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi'),
        newsletter_heading = regexp_replace(newsletter_heading, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi'),
        newsletter_text    = regexp_replace(newsletter_text, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi'),
        powered_by_text    = regexp_replace(powered_by_text, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi')
      where id = true
    $sql$;
  end if;

  -- ---------- 2. homepage sections / banners ----------
  if to_regclass('public.homepage_sections') is not null then
    execute $sql$
      update public.homepage_sections set
        title    = regexp_replace(title, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi'),
        subtitle = regexp_replace(subtitle, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi'),
        config   = regexp_replace(config::text, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi')::jsonb
      where coalesce(title, '') || coalesce(subtitle, '') || config::text ~* 'Jahangir[’'']?s?\s+Sons'
    $sql$;
  end if;
end
$do$;

update public.banners set
  title    = regexp_replace(title, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi'),
  subtitle = regexp_replace(subtitle, 'Jahangir[’'']?s?\s+Sons', 'SchoolBooksExperts', 'gi')
where coalesce(title, '') || coalesce(subtitle, '') ~* 'Jahangir[’'']?s?\s+Sons';

-- ---------- 3. private (admin-only) settings ----------
create table if not exists public.store_private_settings (
  id boolean primary key default true,
  -- Accounts with these emails get the 'admin' role (see section 4)
  admin_emails text[] not null default '{}',
  -- New-order alerts, contact-form messages, reply-to on customer emails
  order_notification_email text,
  contact_form_email text,
  reply_to_email text,
  updated_at timestamptz not null default now(),
  constraint store_private_settings_singleton check (id = true)
);

revoke all on public.store_private_settings from public, anon, authenticated;
grant select, insert, update on public.store_private_settings to authenticated;
grant all on public.store_private_settings to service_role;
alter table public.store_private_settings enable row level security;

drop policy if exists "store_private_settings_admin" on public.store_private_settings;
create policy "store_private_settings_admin" on public.store_private_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

-- Emails are stored trimmed, lower-case and without duplicates
create or replace function public.store_private_settings_normalize()
returns trigger language plpgsql set search_path = public as $$
begin
  new.admin_emails := coalesce(array(
    select distinct lower(btrim(e)) from unnest(coalesce(new.admin_emails, '{}')) as e
     where btrim(coalesce(e, '')) <> '' order by 1
  ), '{}');
  new.order_notification_email := nullif(lower(btrim(new.order_notification_email)), '');
  new.contact_form_email := nullif(lower(btrim(new.contact_form_email)), '');
  new.reply_to_email := nullif(lower(btrim(new.reply_to_email)), '');
  new.updated_at := now();
  return new;
end; $$;

drop trigger if exists store_private_settings_normalize on public.store_private_settings;
create trigger store_private_settings_normalize before insert or update on public.store_private_settings
  for each row execute function public.store_private_settings_normalize();

insert into public.store_private_settings (id, admin_emails, order_notification_email, contact_form_email, reply_to_email)
values (true, array['worldtimes07@gmail.com'], 'worldtimes07@gmail.com', 'worldtimes07@gmail.com', 'worldtimes07@gmail.com')
on conflict (id) do update set
  admin_emails = (select array_agg(distinct e) from unnest(public.store_private_settings.admin_emails || excluded.admin_emails) as e),
  order_notification_email = excluded.order_notification_email,
  contact_form_email = excluded.contact_form_email,
  reply_to_email = excluded.reply_to_email;

-- ---------- 4. admin access for admin_emails ----------
-- An email counts as verified when the user signed in with Google, or
-- confirmed the email AFTER signing up (the confirmation link / code).
-- An email that was confirmed at the very moment of sign-up without Google
-- (the project's "Confirm email" switch is off) does NOT count, so nobody can
-- register the admin address with a password and become admin without
-- owning the mailbox.
create or replace function public.auth_email_verified(
  _confirmed_at timestamptz, _created_at timestamptz, _app_meta jsonb
) returns boolean language sql immutable set search_path = public as $$
  select _confirmed_at is not null and (
    coalesce(_app_meta->>'provider', '') = 'google'
    or coalesce(_app_meta->'providers', '[]'::jsonb) ? 'google'
    or _confirmed_at > coalesce(_created_at, _confirmed_at) + interval '5 seconds'
  );
$$;

create or replace function public.is_configured_admin_email(_email text)
returns boolean language sql stable security definer set search_path = public as $$
  select _email is not null and exists (
    select 1 from public.store_private_settings
     where id = true and lower(btrim(_email)) = any(admin_emails)
  );
$$;

-- Gives 'admin' to every existing account whose verified email is listed.
-- Returns how many roles were added. Never removes anything.
create or replace function public.grant_configured_admin_roles()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  insert into public.user_roles (user_id, role)
  select u.id, 'admin'::public.app_role
    from auth.users u
   where public.is_configured_admin_email(u.email)
     and public.auth_email_verified(u.email_confirmed_at, u.created_at, u.raw_app_meta_data)
  on conflict (user_id, role) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end; $$;

create or replace function public.handle_admin_email_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.is_configured_admin_email(new.email)
     and public.auth_email_verified(new.email_confirmed_at, new.created_at, new.raw_app_meta_data) then
    insert into public.user_roles (user_id, role) values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;
  return new;
end; $$;

revoke execute on function public.is_configured_admin_email(text) from public, anon, authenticated;
revoke execute on function public.grant_configured_admin_roles() from public, anon, authenticated;
revoke execute on function public.handle_admin_email_user() from public, anon, authenticated;
grant execute on function public.grant_configured_admin_roles() to service_role;

-- Independent of on_auth_user_created (profile + 'customer' role): both are
-- AFTER triggers, so the auth.users row exists whichever runs first.
drop trigger if exists on_auth_user_admin_email on auth.users;
create trigger on_auth_user_admin_email
  after insert or update of email, email_confirmed_at, raw_app_meta_data on auth.users
  for each row execute function public.handle_admin_email_user();

select public.grant_configured_admin_roles();
