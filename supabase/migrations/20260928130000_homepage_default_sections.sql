-- =====================================================================
-- Homepage Phase 4: default homepage (the reference layout, top to bottom).
-- Every section is editable afterwards in Admin → Homepage. Images are left
-- empty: the storefront shows store-colour placeholders until real ones are
-- uploaded. Idempotent (seed_key); the default hero is skipped when a hero
-- slider already exists (e.g. copied from the old banners).
-- Needs 20260928120000_homepage_sections.sql.
-- =====================================================================

with defaults(seed_key, type, title, subtitle, sort_order, is_active, config) as (values
  ('home_default_hero', 'hero_slider', 'Hero', null, 10, true, $j${
    "interval_seconds": 5,
    "slides": [
      {"image": null, "mobile_image": null, "alt": "", "heading": "Back to School Stationery", "subheading": "Notebooks, sketch books and drafting pads for the new session", "cta": "Shop Now", "link": {"type": "category", "slug": "stationery"}},
      {"image": null, "mobile_image": null, "alt": "", "heading": "Gifts for Every Occasion", "subheading": "Wrapping sheets, gift bags and money folders", "cta": "Shop Now", "link": {"type": "category", "slug": "gifts"}},
      {"image": null, "mobile_image": null, "alt": "", "heading": "Character Costumes", "subheading": "Dress-up favourites for every age", "cta": "Shop Now", "link": {"type": "category", "slug": "character-costumes"}}
    ]}$j$::jsonb),
  ('home_default_new_arrivals', 'product_carousel', 'New Arrivals', null, 20, true,
    '{"source": {"type": "new_arrivals"}, "limit": 12}'::jsonb),
  ('home_default_departments', 'category_circles', 'Shop by Department', null, 30, true,
    '{"category_slugs": ["books", "notebooks", "sketch-books", "drafting-pads", "gift-wrapping-sheets", "gift-bags", "money-folders", "toys-games", "sports-items", "character-costumes"]}'::jsonb),
  ('home_default_books', 'banner_full', 'Books Collection', null, 40, true, $j${
    "banner": {"image": null, "mobile_image": null, "alt": "", "heading": "Books Collection", "subheading": "Classics, readers and more", "cta": "Shop Books", "link": {"type": "category", "slug": "books"}},
    "source": {"type": "category", "slug": "books"}, "limit": 12}$j$::jsonb),
  ('home_default_stationery', 'banner_with_products', 'Stationery', null, 50, true, $j${
    "side": "left",
    "banner": {"image": null, "mobile_image": null, "alt": "", "heading": "Stationery", "subheading": "Everything for the school bag", "cta": "Shop Stationery", "link": {"type": "category", "slug": "stationery"}},
    "source": {"type": "category", "slug": "stationery"}, "limit": 12}$j$::jsonb),
  ('home_default_pair', 'banner_pair', 'Toys & Games | Character Costumes', null, 60, true, $j${
    "banners": [
      {"image": null, "mobile_image": null, "alt": "", "heading": "Toys & Games", "subheading": null, "cta": "Shop Now", "link": {"type": "category", "slug": "toys-games"}},
      {"image": null, "mobile_image": null, "alt": "", "heading": "Character Costumes", "subheading": null, "cta": "Shop Now", "link": {"type": "category", "slug": "character-costumes"}}
    ]}$j$::jsonb),
  ('home_default_gifts', 'banner_with_products', 'Gifts', null, 70, true, $j${
    "side": "right",
    "banner": {"image": null, "mobile_image": null, "alt": "", "heading": "Gifts", "subheading": "Wrap it, bag it, gift it", "cta": "Shop Gifts", "link": {"type": "category", "slug": "gifts"}},
    "source": {"type": "category", "slug": "gifts"}, "limit": 12}$j$::jsonb),
  ('home_default_sports', 'banner_full', 'Sports Items', null, 80, true, $j${
    "banner": {"image": null, "mobile_image": null, "alt": "", "heading": "Sports Items", "subheading": "Bats, balls, rackets and more", "cta": "Shop Sports", "link": {"type": "category", "slug": "sports-items"}},
    "source": {"type": "category", "slug": "sports-items"}, "limit": 12}$j$::jsonb),
  ('home_default_price_bar', 'price_bar', 'Shop by Price', null, 90, true, $j${
    "ranges": [
      {"label": "Under Rs. 500", "min": null, "max": 500},
      {"label": "Rs. 500 – 1,000", "min": 500, "max": 1000},
      {"label": "Rs. 1,000 – 2,500", "min": 1000, "max": 2500},
      {"label": "Rs. 2,500 – 5,000", "min": 2500, "max": 5000},
      {"label": "Rs. 5,000+", "min": 5000, "max": null}
    ]}$j$::jsonb),
  ('home_default_best_sellers', 'product_carousel', 'Best Sellers', null, 100, true,
    '{"source": {"type": "best_sellers"}, "limit": 12}'::jsonb),
  ('home_default_recently_added', 'product_carousel', 'Recently Added', null, 110, true,
    '{"source": {"type": "recently_added"}, "limit": 12}'::jsonb),
  ('home_default_promo_tiles', 'promo_tiles', 'Promotions', null, 120, true, $j${
    "tiles": [
      {"image": null, "alt": "", "title": "Deals & Discounts", "cta": "SHOP DEALS", "color": "#0E7C7B", "link": {"type": "listing", "href": "/shop?on_sale=true"}},
      {"image": null, "alt": "", "title": "Gift Ideas", "cta": "SHOP DEALS", "color": "#B7472A", "link": {"type": "category", "slug": "gifts"}},
      {"image": null, "alt": "", "title": "Web Exclusive", "cta": "SHOP DEALS", "color": "#3D5A98", "link": {"type": "listing", "href": "/shop"}}
    ]}$j$::jsonb),
  ('home_default_app', 'app_banner', 'Download our App', null, 130, false, $j${
    "banner": {"image": null, "mobile_image": null, "alt": "", "heading": "Download our App", "subheading": "Shop faster, track orders and get app-only offers", "cta": null, "link": null}}$j$::jsonb)
)
insert into public.homepage_sections (seed_key, type, title, subtitle, sort_order, is_active, config)
select d.seed_key, d.type, d.title, d.subtitle, d.sort_order, d.is_active, d.config
from defaults d
where d.type <> 'hero_slider'
   or not exists (select 1 from public.homepage_sections h where h.type = 'hero_slider')
on conflict (seed_key) do nothing;
