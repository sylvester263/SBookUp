-- =====================================================================
-- Homepage Phase 3: section builder.
--  * homepage_sections: every homepage block (hero slider, product carousel,
--    category circles, banners, promo tiles, price bar, app banner), in
--    order, with on/off and optional schedule. `config` holds the
--    type-specific settings (validated by the admin server functions,
--    src/lib/homepage-sections.ts).
--  * Public read: active sections within their schedule. Staff (admin or
--    manager) manage them.
--  * Existing banners are copied into sections once (hero banners -> one
--    hero_slider; section / sidebar banners -> banner_full). The banners
--    table is kept until the owner confirms it can go.
-- Idempotent.
-- =====================================================================

create table if not exists public.homepage_sections (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  title text,
  subtitle text,
  config jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  starts_at timestamptz,
  ends_at timestamptz,
  -- Set on sections created by migrations / seeds, so re-running never duplicates them
  seed_key text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'homepage_sections_type_check') then
    alter table public.homepage_sections add constraint homepage_sections_type_check check (type in (
      'hero_slider', 'product_carousel', 'category_circles', 'banner_full', 'banner_with_products',
      'banner_pair', 'promo_tiles', 'price_bar', 'app_banner'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'homepage_sections_config_object') then
    alter table public.homepage_sections add constraint homepage_sections_config_object check (jsonb_typeof(config) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'homepage_sections_schedule_check') then
    alter table public.homepage_sections add constraint homepage_sections_schedule_check
      check (starts_at is null or ends_at is null or ends_at > starts_at);
  end if;
end $$;

create index if not exists homepage_sections_order_idx on public.homepage_sections (sort_order, created_at);

drop trigger if exists homepage_sections_updated_at on public.homepage_sections;
create trigger homepage_sections_updated_at before update on public.homepage_sections
  for each row execute function public.set_updated_at();

grant select on public.homepage_sections to anon, authenticated;
grant insert, update, delete on public.homepage_sections to authenticated;
grant all on public.homepage_sections to service_role;
alter table public.homepage_sections enable row level security;

drop policy if exists "homepage_sections_public_read" on public.homepage_sections;
create policy "homepage_sections_public_read" on public.homepage_sections for select to anon, authenticated
  using (is_active and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));

drop policy if exists "homepage_sections_staff_all" on public.homepage_sections;
create policy "homepage_sections_staff_all" on public.homepage_sections for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

-- ---------------------------------------------------------------- banners -> sections (once)
-- Image sizes aren't stored on banners, so the recommended size for the type is used.
insert into public.homepage_sections (type, title, config, sort_order, is_active, seed_key)
select 'hero_slider', null,
       jsonb_build_object(
         'interval_seconds', 5,
         'slides', jsonb_agg(jsonb_build_object(
           'image', jsonb_build_object('src', b.image_url, 'width', 1920, 'height', 700),
           'mobile_image', null,
           'alt', coalesce(nullif(b.title, ''), 'Banner'),
           'heading', nullif(b.title, ''),
           'subheading', nullif(b.subtitle, ''),
           'cta', case when b.link_url is not null then 'Shop Now' end,
           'link', case when b.link_url is not null then jsonb_build_object('type', 'url', 'href', b.link_url) end
         ) order by b.display_order, b.created_at)),
       0, true, 'migrated_banners_hero'
from public.banners b
where b.position = 'hero' and b.is_active and b.image_url is not null and b.image_url <> ''
  and (b.valid_until is null or b.valid_until > now())
having count(*) > 0
on conflict (seed_key) do nothing;

insert into public.homepage_sections (type, title, config, sort_order, is_active, starts_at, ends_at, seed_key)
select 'banner_full', null,
       jsonb_build_object(
         'banner', jsonb_build_object(
           'image', jsonb_build_object('src', b.image_url, 'width', 1600, 'height', 300),
           'mobile_image', null,
           'alt', coalesce(nullif(b.title, ''), 'Banner'),
           'heading', nullif(b.title, ''),
           'subheading', nullif(b.subtitle, ''),
           'cta', case when b.link_url is not null then 'Shop Now' end,
           'link', case when b.link_url is not null then jsonb_build_object('type', 'url', 'href', b.link_url) end),
         'source', null),
       100 + b.display_order, b.is_active,
       b.valid_from, case when b.valid_until > coalesce(b.valid_from, '-infinity') then b.valid_until end,
       'migrated_banner_' || b.id
from public.banners b
where b.position in ('section', 'sidebar') and b.image_url is not null and b.image_url <> ''
on conflict (seed_key) do nothing;
