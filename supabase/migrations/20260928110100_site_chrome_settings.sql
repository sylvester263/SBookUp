-- =====================================================================
-- Homepage Phase 2: header, nav and footer settings (all editable in
-- admin → Settings), plus the shopper's saved delivery city.
-- Idempotent. Nothing here changes pricing or orders.
-- =====================================================================

alter table public.store_settings
  -- Colour palette (see src/styles.css): 'brand' (default) or 'teal'
  add column if not exists theme_preset text not null default 'brand',
  -- Announcement bar: [{ "text": "...", "href": "/shop" | null }], rotating
  add column if not exists announcement_enabled boolean not null default true,
  add column if not exists announcements jsonb not null default '[]'::jsonb,
  add column if not exists announcement_interval_seconds integer not null default 5,
  -- Contact details shown in the footer
  add column if not exists support_hours text,
  add column if not exists whatsapp_number text,
  add column if not exists whatsapp_hours text,
  add column if not exists whatsapp_message text,
  -- { "facebook": url, "instagram": url, "youtube": url, "tiktok": url, "x": url }
  add column if not exists social_links jsonb not null default '{}'::jsonb,
  -- "Download the App" badges are hidden until a link is set
  add column if not exists app_store_url text,
  add column if not exists play_store_url text,
  add column if not exists newsletter_heading text,
  add column if not exists newsletter_text text,
  add column if not exists powered_by_text text,
  add column if not exists powered_by_url text,
  -- Store pickup (the "delivery or pickup" choice only offers pickup when on)
  add column if not exists pickup_enabled boolean not null default false,
  add column if not exists pickup_address text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'store_settings_theme_preset_check') then
    alter table public.store_settings add constraint store_settings_theme_preset_check
      check (theme_preset in ('brand', 'teal'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'store_settings_announcements_array') then
    alter table public.store_settings add constraint store_settings_announcements_array
      check (jsonb_typeof(announcements) = 'array' and jsonb_array_length(announcements) <= 10);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'store_settings_announcement_interval_check') then
    alter table public.store_settings add constraint store_settings_announcement_interval_check
      check (announcement_interval_seconds between 2 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'store_settings_social_links_object') then
    alter table public.store_settings add constraint store_settings_social_links_object
      check (jsonb_typeof(social_links) = 'object');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'store_settings_whatsapp_digits') then
    alter table public.store_settings add constraint store_settings_whatsapp_digits
      check (whatsapp_number is null or whatsapp_number ~ '^[0-9]{10,15}$');
  end if;
end $$;

-- Starting announcement (only when none are set yet)
update public.store_settings
   set announcements = jsonb_build_array(jsonb_build_object('text', 'Welcome to ' || store_name, 'href', null))
 where announcements = '[]'::jsonb;

-- The shopper's chosen delivery city / zone (also kept in the browser for guests)
alter table public.profiles
  add column if not exists delivery_method text,
  add column if not exists delivery_city text,
  add column if not exists delivery_zone_id uuid references public.shipping_zones(id) on delete set null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_delivery_method_check') then
    alter table public.profiles add constraint profiles_delivery_method_check
      check (delivery_method is null or delivery_method in ('delivery', 'pickup'));
  end if;
end $$;
