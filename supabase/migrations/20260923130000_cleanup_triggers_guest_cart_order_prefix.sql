-- =====================================================================
-- Audit clean-up, Priority 4
-- 4.5 Duplicate triggers: migration 20260602193817 re-created triggers under
--     new "trg_*" names without dropping the originals from 20260602191322,
--     so each of these ran twice per row:
--       orders  (order number + updated_at), profiles, addresses, products,
--       categories, bundles (updated_at).
--     Keep the originals, drop the duplicates. (on_auth_user_created was
--     dropped and re-created under the same name, so it already runs once.)
-- 4.4 Guest carts: the "cart_guest" policy let ANY visitor read and change
--     every guest cart row (it only checked session_id is not null). The
--     table is unused by the app (cart lives in the browser), so anonymous
--     access is removed entirely. The table itself is NOT dropped — that
--     waits for the owner's confirmation (Task 3.7).
-- 4.3 Order-number prefix becomes a store setting (and the date part now uses
--     Pakistan time, not UTC). The default 'JSN' keeps
--     numbering exactly as it is today; existing order numbers never change.
-- =====================================================================

-- ---------- 4.5 ----------
drop trigger if exists trg_orders_set_order_number on public.orders;
drop trigger if exists trg_orders_set_updated_at on public.orders;
drop trigger if exists trg_profiles_set_updated_at on public.profiles;
drop trigger if exists trg_addresses_set_updated_at on public.addresses;
drop trigger if exists trg_products_set_updated_at on public.products;
drop trigger if exists trg_categories_set_updated_at on public.categories;
drop trigger if exists trg_bundles_set_updated_at on public.bundles;

-- ---------- 4.4 ----------
drop policy if exists "cart_guest" on public.cart_items;
revoke all on public.cart_items from anon;

-- ---------- 4.3 ----------
alter table public.store_settings
  add column if not exists order_number_prefix text not null default 'JSN';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_order_prefix_format') then
    alter table public.store_settings
      add constraint store_settings_order_prefix_format check (order_number_prefix ~ '^[A-Z0-9]{1,8}$');
  end if;
end $$;

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
    new.order_number := coalesce(nullif(v_prefix, ''), 'JSN') || '-' || to_char(now() at time zone 'Asia/Karachi', 'YYYYMMDD') || '-'
      || lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  return new;
end;
$$;
