-- =====================================================================
-- Catalog Phase B: data model
--  B1 category tree columns + seed of the six product areas (new slugs only;
--     categories that already exist are NOT modified — see the mapping step)
--  B2 product_categories (multi-category, one primary) kept in sync with
--     products.category_id (kept for backward compatibility)
--  B3 attribute_definitions + category_attributes (inherited by children) +
--     products.attributes jsonb; author/publisher columns mirror attributes
--  B4 pack pricing (sell_unit / pack_size, category defaults)
--  B5 variant option_values + image
--  B6 sales_count (last 90 days, revenue orders only) + new-arrival flags
-- Everything is idempotent (IF NOT EXISTS / ON CONFLICT / CREATE OR REPLACE).
-- =====================================================================

-- ---------------------------------------------------------------- B1
alter table public.categories
  add column if not exists show_in_nav boolean not null default false,
  add column if not exists show_on_home boolean not null default false,
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists default_sell_unit text not null default 'item',
  add column if not exists default_pack_size integer,
  add column if not exists default_unit_label text;
-- categories.display_order is the category sort order (existing column, reused).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'categories_default_sell_unit_check') then
    alter table public.categories add constraint categories_default_sell_unit_check
      check (default_sell_unit in ('item', 'pack') and (default_pack_size is null or default_pack_size >= 2));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'categories_not_own_parent') then
    alter table public.categories add constraint categories_not_own_parent check (parent_id is null or parent_id <> id);
  end if;
end $$;
create index if not exists categories_nav_idx on public.categories (parent_id, display_order) where is_active;

-- Seed: insert only when the slug does not exist yet.
insert into public.categories (name, slug, display_order, show_in_nav, show_on_home, is_active) values
  ('Books', 'books', 10, true, true, true),
  ('Stationery', 'stationery', 20, true, true, true),
  ('Gifts', 'gifts', 30, true, true, true),
  ('Toys & Games', 'toys-games', 40, true, true, true),
  ('Sports Items', 'sports-items', 50, true, true, true),
  ('Character Costumes', 'character-costumes', 60, true, true, true)
on conflict (slug) do nothing;

insert into public.categories (name, slug, parent_id, display_order, show_in_nav, default_sell_unit, default_pack_size, default_unit_label, is_active)
select v.name, v.slug, p.id, v.ord, true, v.unit, v.pack, v.label, true
from (values
  ('Notebooks', 'notebooks', 'stationery', 10, 'item', null::int, null::text),
  ('Sketch Books', 'sketch-books', 'stationery', 20, 'item', null, null),
  ('Drafting Pads', 'drafting-pads', 'stationery', 30, 'item', null, null),
  ('Gift Wrapping Sheets', 'gift-wrapping-sheets', 'gifts', 10, 'pack', 6, 'sheet'),
  ('Gift Bags', 'gift-bags', 'gifts', 20, 'item', null, null),
  ('Money Folders', 'money-folders', 'gifts', 30, 'pack', 12, 'folder')
) as v(name, slug, parent_slug, ord, unit, pack, label)
join public.categories p on p.slug = v.parent_slug
on conflict (slug) do nothing;

-- Descendants (including itself) and ancestors (including itself)
create or replace function public.category_descendants(p_category_id uuid)
returns setof uuid language sql stable set search_path = public as $$
  with recursive t(id) as (
    select p_category_id
    union
    select c.id from public.categories c join t on c.parent_id = t.id
  ) select id from t;
$$;
create or replace function public.category_ancestors(p_category_id uuid)
returns table (id uuid, depth integer) language sql stable set search_path = public as $$
  with recursive t(id, parent_id, depth) as (
    select c.id, c.parent_id, 0 from public.categories c where c.id = p_category_id
    union all
    select c.id, c.parent_id, t.depth + 1 from public.categories c join t on c.id = t.parent_id where t.depth < 20
  ) select t.id, t.depth from t;
$$;
grant execute on function public.category_descendants(uuid) to anon, authenticated, service_role;
grant execute on function public.category_ancestors(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- B2
create table if not exists public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);
create unique index if not exists product_categories_one_primary on public.product_categories (product_id) where is_primary;
create index if not exists product_categories_category_idx on public.product_categories (category_id, product_id);
alter table public.product_categories enable row level security;
grant select on public.product_categories to anon, authenticated;
grant insert, update, delete on public.product_categories to authenticated;
grant all on public.product_categories to service_role;
drop policy if exists "product_categories_public_read" on public.product_categories;
create policy "product_categories_public_read" on public.product_categories for select to anon, authenticated using (true);
drop policy if exists "product_categories_staff_write" on public.product_categories;
create policy "product_categories_staff_write" on public.product_categories for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

-- Backfill: existing products.category_id becomes the primary category.
insert into public.product_categories (product_id, category_id, is_primary)
select id, category_id, true from public.products where category_id is not null
on conflict (product_id, category_id) do update set is_primary = true;

-- Sync 1: product_categories -> products.category_id (+ keep exactly one primary)
create or replace function public.product_categories_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_pid uuid := coalesce(new.product_id, old.product_id);
  v_primary uuid;
begin
  -- Only the outermost change recomputes (nested trigger work is mid-flight).
  if pg_trigger_depth() > 1 then return null; end if;
  select category_id into v_primary from public.product_categories where product_id = v_pid and is_primary;
  if v_primary is null then
    -- promote the oldest remaining category, if any
    select category_id into v_primary from public.product_categories where product_id = v_pid order by created_at, category_id limit 1;
    if v_primary is not null then
      update public.product_categories set is_primary = true where product_id = v_pid and category_id = v_primary;
    end if;
  end if;
  update public.products set category_id = v_primary where id = v_pid and category_id is distinct from v_primary;
  return null;
end; $$;
revoke all on function public.product_categories_sync() from public, anon, authenticated;
drop trigger if exists trg_product_categories_sync on public.product_categories;
create trigger trg_product_categories_sync after insert or update or delete on public.product_categories
  for each row execute function public.product_categories_sync();

-- Before a new primary is set, clear the old one (so the unique index never blocks a switch)
create or replace function public.product_categories_single_primary()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.is_primary then
    update public.product_categories set is_primary = false
      where product_id = new.product_id and category_id <> new.category_id and is_primary;
  end if;
  return new;
end; $$;
revoke all on function public.product_categories_single_primary() from public, anon, authenticated;
drop trigger if exists trg_product_categories_single_primary on public.product_categories;
create trigger trg_product_categories_single_primary before insert or update of is_primary on public.product_categories
  for each row execute function public.product_categories_single_primary();

-- Sync 2: legacy writes to products.category_id -> product_categories primary
create or replace function public.products_category_sync()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_next uuid;
begin
  if pg_trigger_depth() > 1 then return null; end if;
  if tg_op = 'INSERT' or new.category_id is distinct from old.category_id then
    -- Legacy single-category writers replace the old primary category.
    if tg_op = 'UPDATE' and old.category_id is not null then
      delete from public.product_categories
      where product_id = new.id and category_id = old.category_id and is_primary;
    end if;
    if new.category_id is not null then
      insert into public.product_categories (product_id, category_id, is_primary)
      values (new.id, new.category_id, true)
      on conflict (product_id, category_id) do update set is_primary = true;
    else
      select category_id into v_next from public.product_categories
      where product_id = new.id order by created_at, category_id limit 1;
      if v_next is not null then
        update public.product_categories set is_primary = true where product_id = new.id and category_id = v_next;
        update public.products set category_id = v_next where id = new.id;
      end if;
    end if;
  end if;
  return null;
end; $$;
revoke all on function public.products_category_sync() from public, anon, authenticated;
drop trigger if exists trg_products_category_sync on public.products;
create trigger trg_products_category_sync after insert or update of category_id on public.products
  for each row execute function public.products_category_sync();

-- Product ids listed under a category = the category and all of its descendants.
create or replace function public.category_product_ids(p_category_id uuid)
returns setof uuid language sql stable set search_path = public as $$
  select distinct pc.product_id from public.product_categories pc
  where pc.category_id in (select public.category_descendants(p_category_id));
$$;
grant execute on function public.category_product_ids(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- B3
create table if not exists public.attribute_definitions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]{0,39}$'),
  label text not null,
  type text not null check (type in ('select', 'multiselect', 'number', 'text')),
  unit text,
  help_text text,
  options jsonb not null default '[]'::jsonb check (jsonb_typeof(options) = 'array'),
  allow_new_options boolean not null default false,
  is_filterable boolean not null default true,
  is_variant_axis boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.category_attributes (
  category_id uuid not null references public.categories(id) on delete cascade,
  attribute_id uuid not null references public.attribute_definitions(id) on delete cascade,
  is_required boolean not null default false,
  is_variant_axis boolean not null default false,
  sort_order integer not null default 0,
  primary key (category_id, attribute_id)
);
drop trigger if exists attribute_definitions_updated_at on public.attribute_definitions;
create trigger attribute_definitions_updated_at before update on public.attribute_definitions
  for each row execute function public.set_updated_at();

alter table public.attribute_definitions enable row level security;
alter table public.category_attributes enable row level security;
grant select on public.attribute_definitions, public.category_attributes to anon, authenticated;
grant insert, update, delete on public.attribute_definitions, public.category_attributes to authenticated;
grant all on public.attribute_definitions, public.category_attributes to service_role;
drop policy if exists "attribute_definitions_public_read" on public.attribute_definitions;
create policy "attribute_definitions_public_read" on public.attribute_definitions for select to anon, authenticated
  using (is_active or public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));
drop policy if exists "attribute_definitions_staff_write" on public.attribute_definitions;
create policy "attribute_definitions_staff_write" on public.attribute_definitions for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));
drop policy if exists "category_attributes_public_read" on public.category_attributes;
create policy "category_attributes_public_read" on public.category_attributes for select to anon, authenticated using (true);
drop policy if exists "category_attributes_staff_write" on public.category_attributes;
create policy "category_attributes_staff_write" on public.category_attributes for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

alter table public.products add column if not exists attributes jsonb not null default '{}'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_attributes_object') then
    alter table public.products add constraint products_attributes_object check (jsonb_typeof(attributes) = 'object');
  end if;
end $$;
create index if not exists products_attributes_gin on public.products using gin (attributes jsonb_path_ops);

-- Seed attribute definitions (options are defaults, editable in admin)
create or replace function pg_temp.opts(variadic vals text[]) returns jsonb language sql as $$
  select coalesce(jsonb_agg(jsonb_build_object('value', v, 'label', v, 'sort', i) order by i), '[]'::jsonb)
  from unnest(vals) with ordinality as t(v, i);
$$;
insert into public.attribute_definitions (key, label, type, unit, help_text, options, allow_new_options, is_filterable, is_variant_axis, sort_order) values
  ('age_group', 'Age Group', 'select', null, null, pg_temp.opts('0-2','3-5','6-8','9-12','13+','Adult'), false, true, false, 10),
  ('gender', 'Gender', 'select', null, null, pg_temp.opts('Boys','Girls','Unisex'), false, true, false, 20),
  ('binding_type', 'Binding Type', 'select', null, null, pg_temp.opts('Spiral','Stitched','Perfect Bound','Hardbound','Glued Pad'), false, true, false, 30),
  ('paper_size', 'Size', 'select', null, null, pg_temp.opts('A3','A4','A5','B5','Letter'), false, true, false, 40),
  ('clothing_size', 'Size', 'select', null, null, pg_temp.opts('2-3Y','4-5Y','6-7Y','8-9Y','10-12Y','S','M','L','XL'), false, true, true, 41),
  ('colour', 'Colour', 'select', null, null, pg_temp.opts('Red','Blue','Green','Yellow','Black','White','Pink','Purple','Multi'), true, true, true, 50),
  ('pages', 'Pages', 'number', 'pages', null, '[]'::jsonb, false, true, false, 60),
  ('author', 'Author', 'select', null, 'Searchable; new names can be added.', '[]'::jsonb, true, true, false, 70),
  ('publisher', 'Publisher', 'select', null, 'Searchable; new names can be added.', '[]'::jsonb, true, true, false, 80),
  ('season', 'Season', 'select', null, 'Meaning to be confirmed by the client.', pg_temp.opts('2026-27 Session','Latest Edition'), false, true, false, 90),
  ('occasion', 'Occasion', 'select', null, null, pg_temp.opts('Birthday','Wedding','Eid','Christmas','General'), false, true, false, 100),
  ('subjects', 'Subjects', 'number', 'subjects', '20-page partition per subject', '[]'::jsonb, false, true, false, 110)
on conflict (key) do nothing;

-- Author / publisher: existing column values become attribute values + options
update public.products set attributes = attributes
  || case when nullif(trim(author), '') is not null and not attributes ? 'author' then jsonb_build_object('author', trim(author)) else '{}'::jsonb end
  || case when nullif(trim(publisher), '') is not null and not attributes ? 'publisher' then jsonb_build_object('publisher', trim(publisher)) else '{}'::jsonb end
where (nullif(trim(author), '') is not null and not attributes ? 'author')
   or (nullif(trim(publisher), '') is not null and not attributes ? 'publisher');

update public.attribute_definitions d set options = (
  select coalesce(jsonb_agg(o order by (o->>'sort')::int, o->>'label'), '[]'::jsonb) from (
    select jsonb_build_object('value', v, 'label', v, 'sort', row_number() over (order by lower(v))) as o
    from (
      select distinct trim(p.attributes->>d.key) as v from public.products p
      where nullif(trim(p.attributes->>d.key), '') is not null
      union
      select e->>'value' from jsonb_array_elements(d.options) e
    ) s where v is not null
  ) x
) where d.key in ('author', 'publisher');

-- Single source of truth: products.attributes. The author / publisher columns are
-- kept as read-only mirrors (search, old queries). A legacy write to the column
-- is copied into attributes first.
create or replace function public.products_attribute_mirror()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if new.author is distinct from old.author and new.attributes->'author' is not distinct from old.attributes->'author' then
      new.attributes := case when nullif(trim(new.author), '') is null then new.attributes - 'author'
                             else new.attributes || jsonb_build_object('author', trim(new.author)) end;
    end if;
    if new.publisher is distinct from old.publisher and new.attributes->'publisher' is not distinct from old.attributes->'publisher' then
      new.attributes := case when nullif(trim(new.publisher), '') is null then new.attributes - 'publisher'
                             else new.attributes || jsonb_build_object('publisher', trim(new.publisher)) end;
    end if;
  else
    if nullif(trim(new.author), '') is not null and not new.attributes ? 'author' then
      new.attributes := new.attributes || jsonb_build_object('author', trim(new.author));
    end if;
    if nullif(trim(new.publisher), '') is not null and not new.attributes ? 'publisher' then
      new.attributes := new.attributes || jsonb_build_object('publisher', trim(new.publisher));
    end if;
  end if;
  new.author := nullif(new.attributes->>'author', '');
  new.publisher := nullif(new.attributes->>'publisher', '');
  return new;
end; $$;
drop trigger if exists trg_products_attribute_mirror on public.products;
create trigger trg_products_attribute_mirror before insert or update on public.products
  for each row execute function public.products_attribute_mirror();

-- Category → attribute assignments (children inherit parents' attributes)
insert into public.category_attributes (category_id, attribute_id, is_required, is_variant_axis, sort_order)
select c.id, a.id, false, v.axis, v.ord
from (values
  ('books', 'age_group', false, 10), ('books', 'author', false, 20), ('books', 'publisher', false, 30), ('books', 'season', false, 40),
  ('notebooks', 'subjects', false, 10), ('notebooks', 'binding_type', false, 20),
  ('sketch-books', 'paper_size', false, 10), ('sketch-books', 'pages', false, 20),
  ('drafting-pads', 'paper_size', false, 10), ('drafting-pads', 'binding_type', false, 20), ('drafting-pads', 'pages', false, 30),
  ('gift-wrapping-sheets', 'paper_size', false, 10),
  ('gift-bags', 'paper_size', false, 10), ('gift-bags', 'occasion', false, 20), ('gift-bags', 'colour', false, 30),
  ('toys-games', 'gender', false, 10), ('toys-games', 'age_group', false, 20),
  ('sports-items', 'age_group', false, 10), ('sports-items', 'gender', false, 20),
  ('character-costumes', 'gender', false, 10), ('character-costumes', 'clothing_size', true, 20), ('character-costumes', 'colour', true, 30)
) as v(cat_slug, attr_key, axis, ord)
join public.categories c on c.slug = v.cat_slug
join public.attribute_definitions a on a.key = v.attr_key
on conflict (category_id, attribute_id) do nothing;

-- Effective attributes of a category = own + all ancestors'. The closest
-- category's settings win when an attribute is assigned at several levels.
create or replace function public.category_attribute_set(p_category_id uuid)
returns table (attribute_id uuid, key text, is_required boolean, is_variant_axis boolean, sort_order integer, inherited boolean)
language sql stable set search_path = public as $$
  select distinct on (ca.attribute_id) ca.attribute_id, d.key, ca.is_required, ca.is_variant_axis,
         ca.sort_order + a.depth * 1000, a.depth > 0
  from public.category_ancestors(p_category_id) a
  join public.category_attributes ca on ca.category_id = a.id
  join public.attribute_definitions d on d.id = ca.attribute_id and d.is_active
  order by ca.attribute_id, a.depth;
$$;
grant execute on function public.category_attribute_set(uuid) to anon, authenticated, service_role;

-- ---------------------------------------------------------------- B4
alter table public.products
  add column if not exists sell_unit text not null default 'item',
  add column if not exists pack_size integer,
  add column if not exists unit_label text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'products_sell_unit_check') then
    alter table public.products add constraint products_sell_unit_check
      check (sell_unit in ('item', 'pack') and (sell_unit = 'item' or coalesce(pack_size, 0) >= 2) and (pack_size is null or pack_size >= 2));
  end if;
end $$;
alter table public.order_items
  add column if not exists sell_unit text,
  add column if not exists pack_size integer,
  add column if not exists variant_options jsonb;

-- ---------------------------------------------------------------- B5
alter table public.product_variants
  add column if not exists option_values jsonb not null default '{}'::jsonb,
  add column if not exists image_url text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'product_variants_option_values_object') then
    alter table public.product_variants add constraint product_variants_option_values_object check (jsonb_typeof(option_values) = 'object');
  end if;
end $$;
create unique index if not exists product_variants_unique_options on public.product_variants (product_id, option_values)
  where option_values <> '{}'::jsonb;
create index if not exists product_variants_options_gin on public.product_variants using gin (option_values jsonb_path_ops);

-- ---------------------------------------------------------------- B6
alter table public.products
  add column if not exists sales_count integer not null default 0,
  add column if not exists is_new_arrival boolean not null default false,
  add column if not exists new_arrival_until date;
create index if not exists products_sales_count_idx on public.products (sales_count desc) where is_active;
create index if not exists products_created_idx on public.products (created_at desc) where is_active;

-- Units sold in the last 90 days, counting only revenue orders (same rule as
-- src/lib/sales.ts: confirmed/processing/shipped/delivered or paid; never
-- cancelled/refunded). Bundle / school-bundle lines count their contents.
create or replace function public.refresh_product_sales_counts(p_product_ids uuid[] default null)
returns integer language plpgsql security definer set search_path = public as $$
declare v_rows integer;
begin
  with rev as (
    select o.id from public.orders o
    where o.created_at >= now() - interval '90 days'
      and o.status not in ('cancelled', 'refunded')
      and (o.status in ('confirmed', 'processing', 'shipped', 'delivered') or o.payment_status = 'paid')
  ), units as (
    select oi.product_id, oi.quantity::bigint as q from public.order_items oi join rev on rev.id = oi.order_id
      where oi.product_id is not null
    union all
    select bi.product_id, bi.quantity::bigint * oi.quantity from public.order_items oi join rev on rev.id = oi.order_id
      join public.bundle_items bi on bi.bundle_id = oi.bundle_id
    union all
    select sbi.product_id, sbi.quantity::bigint * oi.quantity from public.order_items oi join rev on rev.id = oi.order_id
      join public.school_bundle_items sbi on sbi.bundle_id = oi.school_bundle_id
  ), totals as (
    select product_id, sum(q)::int as n from units group by product_id
  )
  update public.products p set sales_count = coalesce(t.n, 0)
  from public.products p2 left join totals t on t.product_id = p2.id
  where p.id = p2.id
    and (p_product_ids is null or p.id = any(p_product_ids))
    and p.sales_count is distinct from coalesce(t.n, 0);
  get diagnostics v_rows = row_count;
  return v_rows;
end; $$;
revoke all on function public.refresh_product_sales_counts(uuid[]) from public, anon, authenticated;
grant execute on function public.refresh_product_sales_counts(uuid[]) to service_role;

create or replace function public.orders_refresh_sales_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_ids uuid[];
begin
  select array_agg(distinct pid) into v_ids from (
    select oi.product_id as pid from public.order_items oi where oi.order_id = new.id and oi.product_id is not null
    union select bi.product_id from public.order_items oi join public.bundle_items bi on bi.bundle_id = oi.bundle_id where oi.order_id = new.id
    union select sbi.product_id from public.order_items oi join public.school_bundle_items sbi on sbi.bundle_id = oi.school_bundle_id where oi.order_id = new.id
  ) s;
  if v_ids is not null then
    perform public.refresh_product_sales_counts(v_ids);
  end if;
  return null;
end; $$;
revoke all on function public.orders_refresh_sales_count() from public, anon, authenticated;
drop trigger if exists trg_orders_refresh_sales_count on public.orders;
create trigger trg_orders_refresh_sales_count after update of status, payment_status on public.orders
  for each row when (old.status is distinct from new.status or old.payment_status is distinct from new.payment_status)
  execute function public.orders_refresh_sales_count();

select public.refresh_product_sales_counts();

-- New public columns must be added to the column-level SELECT grant from
-- 20260923100200 (cost_price stays hidden).
grant select (attributes, sell_unit, pack_size, unit_label, sales_count, is_new_arrival, new_arrival_until)
  on public.products to anon, authenticated;

-- ---------------------------------------------------------------- pricing
-- quote_order / place_order / cart_lines understand packs and variant options.
-- Bodies are the 20260924100000 (_compute_order, cart_lines) and
-- 20260923100000 (place_order) versions plus the pack / option additions.
create or replace function public._compute_order(
  p_items jsonb,
  p_city text,
  p_payment_method text,
  p_coupon_code text
) returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c_cod_fee constant numeric := 150;       -- COD handling fee (was hard-coded in the app)
  c_default_shipping constant numeric := 250; -- used when no shipping zone exists
  v_item jsonb;
  v_qty integer;
  v_pid uuid; v_vid uuid; v_bid uuid; v_sbid uuid;
  v_ids integer;
  v_name text;
  v_unit numeric;
  v_weight numeric := 0;
  v_subtotal numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_need_p jsonb := '{}'::jsonb;   -- product_id -> units needed
  v_need_v jsonb := '{}'::jsonb;   -- variant_id -> units needed
  p record; v record; b record; comp record;
  v_key text;
  v_zone record;
  v_delivery numeric;
  v_cod numeric;
  v_discount numeric := 0;
  v_coupon record;
  v_coupon_code text := nullif(upper(trim(coalesce(p_coupon_code, ''))), '');
  v_coupon_error text;
  v_free_shipping boolean := false;
  v_coupon_type text;
  v_tax_rate numeric;
  v_tax numeric;
  v_settings record;
  v_line_weight numeric;
  v_sell_unit text; v_pack integer; v_unit_label text; v_vopts jsonb;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Too many items in one order (max 100 lines)';
  end if;
  if p_payment_method is null or p_payment_method not in ('cod', 'bank_transfer', 'jazzcash', 'easypaisa') then
    raise exception 'Unsupported payment method';
  end if;

  -- Payment methods can be switched on/off in store settings (3.1)
  select * into v_settings from public.store_settings where id = true;
  if (p_payment_method = 'cod' and not coalesce(v_settings.enable_cod, true))
     or (p_payment_method = 'bank_transfer' and not coalesce(v_settings.enable_bank_transfer, true))
     or (p_payment_method = 'jazzcash' and not coalesce(v_settings.enable_jazzcash, false))
     or (p_payment_method = 'easypaisa' and not coalesce(v_settings.enable_easypaisa, false)) then
    raise exception 'This payment method is not available';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(v_item->>'quantity', '')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Invalid quantity in cart';
    end if;
    v_pid  := nullif(v_item->>'product_id', '')::uuid;
    v_vid  := nullif(v_item->>'variant_id', '')::uuid;
    v_bid  := nullif(v_item->>'bundle_id', '')::uuid;
    v_sbid := nullif(v_item->>'school_bundle_id', '')::uuid;
    v_sell_unit := 'item'; v_pack := null; v_unit_label := null; v_vopts := null;
    v_ids := (v_pid is not null)::int + (v_bid is not null)::int + (v_sbid is not null)::int;
    if v_ids <> 1 or (v_vid is not null and v_pid is null) then
      raise exception 'Invalid cart line';
    end if;

    if v_pid is not null then
      select id, name, price, sale_price, weight_grams, is_active, sell_unit, pack_size, unit_label into p
      from public.products where id = v_pid;
      if not found or not p.is_active then
        raise exception 'An item in your cart is no longer available';
      end if;
      v_unit := case when p.sale_price is not null and p.sale_price < p.price then p.sale_price else p.price end;
      v_name := p.name;
      v_line_weight := coalesce(p.weight_grams, 0);
      -- Pack pricing: price and stock are per pack; quantity counts packs.
      v_sell_unit := coalesce(p.sell_unit, 'item');
      v_pack := case when p.sell_unit = 'pack' then p.pack_size end;
      v_unit_label := p.unit_label;
      if v_vid is not null then
        select id, name, price_modifier, price, is_active, weight_grams, option_values into v
        from public.product_variants where id = v_vid and product_id = v_pid;
        if not found or not v.is_active then
          raise exception '"%" option is no longer available', p.name;
        end if;
        -- A variant's own price wins; otherwise product price + modifier (3.4)
        v_unit := coalesce(v.price, v_unit + v.price_modifier);
        v_line_weight := coalesce(v.weight_grams, p.weight_grams, 0);
        v_name := p.name || ' — ' || v.name;
        v_vopts := nullif(v.option_values, '{}'::jsonb);
        v_need_v := jsonb_set(v_need_v, array[v_vid::text], to_jsonb(coalesce((v_need_v->>v_vid::text)::int, 0) + v_qty));
      else
        v_need_p := jsonb_set(v_need_p, array[v_pid::text], to_jsonb(coalesce((v_need_p->>v_pid::text)::int, 0) + v_qty));
      end if;
      v_weight := v_weight + v_line_weight * v_qty;

    elsif v_bid is not null then
      if not coalesce(v_settings.school_features_enabled, false) then
        raise exception 'Bundles are no longer available. Please remove them from your cart.';
      end if;
      select id, name, total_price, discounted_price, is_active into b
      from public.bundles where id = v_bid;
      if not found or not b.is_active then
        raise exception 'A bundle in your cart is no longer available';
      end if;
      v_unit := case when b.discounted_price > 0 then b.discounted_price else b.total_price end;
      v_name := b.name;
      if not exists (select 1 from public.bundle_items where bundle_id = v_bid) then
        raise exception 'Bundle "%" has no items', b.name;
      end if;
      for comp in
        select bi.product_id, bi.quantity, pr.weight_grams
        from public.bundle_items bi join public.products pr on pr.id = bi.product_id
        where bi.bundle_id = v_bid
      loop
        v_need_p := jsonb_set(v_need_p, array[comp.product_id::text],
          to_jsonb(coalesce((v_need_p->>comp.product_id::text)::int, 0) + comp.quantity * v_qty));
        v_weight := v_weight + coalesce(comp.weight_grams, 0) * comp.quantity * v_qty;
      end loop;

    else
      if not coalesce(v_settings.school_features_enabled, false) then
        raise exception 'School bundles are no longer available. Please remove them from your cart.';
      end if;
      select sb.id, sb.bundle_name, sb.total_price, sb.is_active, s.name as school_name, c.class_name into b
      from public.school_bundles sb
      join public.schools s on s.id = sb.school_id
      join public.school_classes c on c.id = sb.class_id
      where sb.id = v_sbid;
      if not found or not b.is_active then
        raise exception 'A school bundle in your cart is no longer available';
      end if;
      v_unit := b.total_price;
      v_name := b.school_name || ' — ' || b.class_name || ' (' || b.bundle_name || ')';
      if not exists (select 1 from public.school_bundle_items where bundle_id = v_sbid) then
        raise exception 'School bundle "%" has no items', v_name;
      end if;
      for comp in
        select sbi.product_id, sbi.quantity, pr.weight_grams
        from public.school_bundle_items sbi join public.products pr on pr.id = sbi.product_id
        where sbi.bundle_id = v_sbid
      loop
        v_need_p := jsonb_set(v_need_p, array[comp.product_id::text],
          to_jsonb(coalesce((v_need_p->>comp.product_id::text)::int, 0) + comp.quantity * v_qty));
        v_weight := v_weight + coalesce(comp.weight_grams, 0) * comp.quantity * v_qty;
      end loop;
    end if;

    if v_pack is not null then
      v_name := v_name || ' (pack of ' || v_pack || ')';
    end if;

    if v_unit is null or v_unit < 0 then
      raise exception 'Price missing for "%"', v_name;
    end if;

    v_subtotal := v_subtotal + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_pid, 'variant_id', v_vid, 'bundle_id', v_bid, 'school_bundle_id', v_sbid,
      'name', v_name, 'unit_price', v_unit, 'quantity', v_qty, 'subtotal', v_unit * v_qty,
      'sell_unit', v_sell_unit, 'pack_size', v_pack, 'unit_label', v_unit_label, 'variant_options', v_vopts
    );
  end loop;

  -- Stock check (totals across all lines, including bundle components)
  for v_key in select jsonb_object_keys(v_need_p) loop
    select name, stock_quantity into p from public.products where id = v_key::uuid;
    if p.stock_quantity < (v_need_p->>v_key)::int then
      if p.stock_quantity <= 0 then
        raise exception '"%" is out of stock', p.name;
      end if;
      raise exception 'Not enough stock for "%": only % left', p.name, p.stock_quantity;
    end if;
  end loop;
  for v_key in select jsonb_object_keys(v_need_v) loop
    select pv.stock, pr.name || ' — ' || pv.name as name into v
    from public.product_variants pv join public.products pr on pr.id = pv.product_id
    where pv.id = v_key::uuid;
    if v.stock < (v_need_v->>v_key)::int then
      if v.stock <= 0 then
        raise exception '"%" is out of stock', v.name;
      end if;
      raise exception 'Not enough stock for "%": only % left', v.name, v.stock;
    end if;
  end loop;

  -- Shipping zone: matched by city on the server (client never picks the zone)
  select * into v_zone from public.shipping_zones z
  where z.is_active
    and exists (select 1 from unnest(z.cities) c where lower(trim(c)) = lower(trim(coalesce(p_city, ''))))
  order by z.created_at limit 1;
  if not found then
    select * into v_zone from public.shipping_zones z where z.is_active order by z.created_at limit 1;
  end if;
  if v_zone.id is null then
    v_delivery := c_default_shipping;
  else
    v_delivery := v_zone.base_rate + round((v_weight / 1000.0) * v_zone.per_kg_rate);
  end if;

  -- Coupon
  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where upper(code) = v_coupon_code;
    if not found or not v_coupon.is_active then
      v_coupon_error := 'Invalid coupon code';
    elsif v_coupon.valid_from is not null and v_coupon.valid_from > now() then
      v_coupon_error := 'Coupon is not active yet';
    elsif v_coupon.valid_until is not null and v_coupon.valid_until < now() then
      v_coupon_error := 'Coupon expired';
    elsif v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then
      v_coupon_error := 'Coupon usage limit reached';
    elsif v_coupon.min_order_amount > v_subtotal then
      v_coupon_error := format('Minimum order for this coupon is PKR %s', v_coupon.min_order_amount);
    else
      v_coupon_type := v_coupon.type::text;
      if v_coupon.type = 'percentage' then
        v_discount := least(v_subtotal, round(v_subtotal * v_coupon.value / 100));
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_subtotal, v_coupon.value);
      else
        v_free_shipping := true;
      end if;
    end if;
  end if;
  -- Zone free-delivery threshold (3.5): applies to the discounted subtotal.
  if v_zone.free_shipping_threshold is not null and (v_subtotal - v_discount) >= v_zone.free_shipping_threshold then
    v_free_shipping := true;
  end if;
  if v_free_shipping then
    v_delivery := 0;
  end if;

  v_cod := case when p_payment_method = 'cod' then c_cod_fee else 0 end;

  v_tax_rate := coalesce(v_settings.tax_rate, 0);
  v_tax := case when v_tax_rate > 0 then round((v_subtotal - v_discount) * v_tax_rate / 100) else 0 end;

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_delivery,
    'cod_fee', v_cod,
    'shipping', v_delivery + v_cod,
    'tax_rate', v_tax_rate,
    'tax', v_tax,
    'total', greatest(0, v_subtotal - v_discount + v_delivery + v_cod + v_tax),
    'coupon_code', case when v_coupon_error is null then v_coupon_code end,
    'coupon_type', v_coupon_type,
    'coupon_error', v_coupon_error,
    'free_shipping', v_free_shipping,
    'zone_name', coalesce(v_zone.name, 'Standard'),
    'free_shipping_threshold', v_zone.free_shipping_threshold,
    'eta_days', coalesce(v_zone.estimated_days, 5),
    'weight_grams', v_weight,
    'need_products', v_need_p,
    'need_variants', v_need_v
  );
end;
$$;
revoke all on function public._compute_order(jsonb, text, text, text) from public, anon, authenticated;

create or replace function public.place_order(
  p_items jsonb,
  p_shipping_address jsonb,
  p_payment_method text,
  p_coupon_code text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_addr jsonb;
  v_q jsonb;
  v_order_id uuid;
  v_order_number text;
  v_line jsonb;
  v_key text;
  v_prev integer;
  v_thr integer;
  v_new integer;
begin
  if v_uid is null then
    raise exception 'Please sign in to place an order';
  end if;

  -- Keep only known address fields
  v_addr := jsonb_strip_nulls(jsonb_build_object(
    'name',        nullif(trim(p_shipping_address->>'name'), ''),
    'phone',       nullif(trim(p_shipping_address->>'phone'), ''),
    'street',      nullif(trim(p_shipping_address->>'street'), ''),
    'city',        nullif(trim(p_shipping_address->>'city'), ''),
    'province',    nullif(trim(p_shipping_address->>'province'), ''),
    'postal_code', nullif(trim(p_shipping_address->>'postal_code'), '')
  ));
  if v_addr->>'name' is null or v_addr->>'phone' is null or v_addr->>'street' is null or v_addr->>'city' is null then
    raise exception 'Shipping address is incomplete';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'Order notes are too long (max 500 characters)';
  end if;

  -- Lock every product / variant row this order touches (stable order avoids deadlocks)
  perform 1 from public.products where id in (
    select nullif(e->>'product_id', '')::uuid from jsonb_array_elements(p_items) e where nullif(e->>'variant_id', '') is null
    union
    select bi.product_id from public.bundle_items bi
      where bi.bundle_id in (select nullif(e->>'bundle_id', '')::uuid from jsonb_array_elements(p_items) e)
    union
    select sbi.product_id from public.school_bundle_items sbi
      where sbi.bundle_id in (select nullif(e->>'school_bundle_id', '')::uuid from jsonb_array_elements(p_items) e)
  ) order by id for update;
  perform 1 from public.product_variants where id in (
    select nullif(e->>'variant_id', '')::uuid from jsonb_array_elements(p_items) e
  ) order by id for update;
  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    perform 1 from public.coupons where upper(code) = upper(trim(p_coupon_code)) for update;
  end if;

  -- Price everything from the database (raises on stock / availability problems)
  v_q := public._compute_order(p_items, v_addr->>'city', p_payment_method, p_coupon_code);
  if v_q->>'coupon_error' is not null then
    raise exception '%', v_q->>'coupon_error';
  end if;

  insert into public.orders (
    order_number, user_id, status, payment_status, payment_method,
    subtotal, shipping_cost, discount_amount, tax_amount, total,
    coupon_code, shipping_address, notes
  ) values (
    '', v_uid, 'pending', 'pending', p_payment_method::public.payment_method,
    (v_q->>'subtotal')::numeric, (v_q->>'shipping')::numeric, (v_q->>'discount')::numeric,
    (v_q->>'tax')::numeric, (v_q->>'total')::numeric,
    v_q->>'coupon_code', v_addr, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id, order_number into v_order_id, v_order_number;

  for v_line in select * from jsonb_array_elements(v_q->'lines') loop
    insert into public.order_items (
      order_id, product_id, variant_id, bundle_id, school_bundle_id,
      name_snapshot, price_snapshot, quantity, subtotal,
      sell_unit, pack_size, variant_options
    ) values (
      v_order_id,
      nullif(v_line->>'product_id', '')::uuid,
      nullif(v_line->>'variant_id', '')::uuid,
      nullif(v_line->>'bundle_id', '')::uuid,
      nullif(v_line->>'school_bundle_id', '')::uuid,
      v_line->>'name', (v_line->>'unit_price')::numeric, (v_line->>'quantity')::int, (v_line->>'subtotal')::numeric,
      v_line->>'sell_unit', nullif(v_line->>'pack_size', '')::int, v_line->'variant_options'
    );
  end loop;

  -- Reduce stock (rows are already locked and checked)
  for v_key in select jsonb_object_keys(v_q->'need_products') loop
    select stock_quantity, low_stock_threshold into v_prev, v_thr from public.products where id = v_key::uuid;
    v_new := v_prev - (v_q->'need_products'->>v_key)::int;
    update public.products set stock_quantity = v_new where id = v_key::uuid;
    if v_prev > coalesce(v_thr, 5) and v_new <= coalesce(v_thr, 5) then
      insert into public.activity_logs (action, entity_type, entity_id, old_value, new_value)
      values ('low_stock_alert', 'product', v_key::uuid,
              jsonb_build_object('stock', v_prev),
              jsonb_build_object('stock', v_new, 'threshold', coalesce(v_thr, 5)));
    end if;
  end loop;
  for v_key in select jsonb_object_keys(v_q->'need_variants') loop
    update public.product_variants
      set stock = stock - (v_q->'need_variants'->>v_key)::int
      where id = v_key::uuid;
  end loop;

  if v_q->>'coupon_code' is not null then
    update public.coupons set uses_count = uses_count + 1 where upper(code) = v_q->>'coupon_code';
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total', (v_q->>'total')::numeric);
end;
$$;
revoke all on function public.place_order(jsonb, jsonb, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text, text, text) to authenticated, service_role;

create or replace function public.cart_lines(p_items jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_idx integer := 0;
  v_out jsonb := '[]'::jsonb;
  v_pid uuid; v_vid uuid; v_bid uuid; v_sbid uuid;
  v_name text; v_unit numeric; v_avail integer; v_ok boolean;
  p record; v record; b record;
  v_school boolean;
  v_sell_unit text; v_pack integer;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return v_out;
  end if;
  select coalesce(school_features_enabled, false) into v_school from public.store_settings where id = true;
  v_school := coalesce(v_school, false);
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := null; v_vid := null; v_bid := null; v_sbid := null;
    v_name := null; v_unit := null; v_avail := 0; v_ok := false; v_sell_unit := 'item'; v_pack := null;
    begin
      v_pid  := nullif(v_item->>'product_id', '')::uuid;
      v_vid  := nullif(v_item->>'variant_id', '')::uuid;
      v_bid  := nullif(v_item->>'bundle_id', '')::uuid;
      v_sbid := nullif(v_item->>'school_bundle_id', '')::uuid;
    exception when others then
      v_pid := null; v_vid := null; v_bid := null; v_sbid := null;
    end;

    if v_pid is not null then
      select name, price, sale_price, stock_quantity, is_active, sell_unit, pack_size into p from public.products where id = v_pid;
      if found and p.is_active then
        v_ok := true;
        v_sell_unit := coalesce(p.sell_unit, 'item');
        v_pack := case when p.sell_unit = 'pack' then p.pack_size end;
        v_name := p.name;
        v_unit := case when p.sale_price is not null and p.sale_price < p.price then p.sale_price else p.price end;
        v_avail := greatest(0, p.stock_quantity);
        if v_vid is not null then
          select name, price_modifier, price, stock, is_active into v from public.product_variants where id = v_vid and product_id = v_pid;
          if found and v.is_active then
            v_name := p.name || ' — ' || v.name;
            v_unit := coalesce(v.price, v_unit + v.price_modifier);
            v_avail := greatest(0, v.stock);
          else
            v_ok := false;
          end if;
        end if;
      end if;
    elsif v_bid is not null and v_school then
      select name, total_price, discounted_price, is_active into b from public.bundles where id = v_bid;
      if found and b.is_active then
        v_ok := true;
        v_name := b.name;
        v_unit := case when b.discounted_price > 0 then b.discounted_price else b.total_price end;
        select coalesce(min(floor(pr.stock_quantity::numeric / s.q)), 0)::int into v_avail
        from (select product_id, sum(quantity) q from public.bundle_items where bundle_id = v_bid group by product_id) s
        join public.products pr on pr.id = s.product_id;
        v_avail := greatest(0, coalesce(v_avail, 0));
      end if;
    elsif v_sbid is not null and v_school then
      select bundle_name, total_price, is_active into b from public.school_bundles where id = v_sbid;
      if found and b.is_active then
        v_ok := true;
        v_name := b.bundle_name;
        v_unit := b.total_price;
        select coalesce(min(floor(pr.stock_quantity::numeric / s.q)), 0)::int into v_avail
        from (select product_id, sum(quantity) q from public.school_bundle_items where bundle_id = v_sbid group by product_id) s
        join public.products pr on pr.id = s.product_id;
        v_avail := greatest(0, coalesce(v_avail, 0));
      end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'index', v_idx, 'available_for_sale', v_ok, 'name', v_name,
      'unit_price', v_unit, 'available', case when v_ok then v_avail else 0 end,
      'sell_unit', v_sell_unit, 'pack_size', v_pack
    );
    v_idx := v_idx + 1;
  end loop;
  return v_out;
end;
$$;
revoke all on function public.cart_lines(jsonb) from public;
grant execute on function public.cart_lines(jsonb) to anon, authenticated, service_role;
