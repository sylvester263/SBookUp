# Catalog expansion — progress

Legend: `[x]` done · `[~]` partial · `[!]` blocked · `[ ]` not started

Resume rule: read this file first and continue from the first task that is not `[x]`.

Branch: `feat/catalog-expansion` (based on `fix/audit-priority-1`, which holds all audit fixes). Nothing has been applied to Supabase and nothing has been deployed.

Checks: `npm run typecheck`, `npx eslint src`, `npm test`, `npm run build`.
Start the dev server from `...\Desktop\schoolbooksexperts` (capital D).

## Phase A — hide school features (feature flag)

Migration: `20260924100000_school_features_flag.sql`

- [x] A1 `store_settings.school_features_enabled` (boolean, default **FALSE**). Admin → Settings → Store Info has a toggle, "Show school features on the store"; the Settings page is admin-only. Files: migration, `src/lib/admin.functions.ts` (schema), `src/routes/_admin/admin.settings.tsx`, `src/integrations/supabase/types.ts`.
- [x] A2 While the flag is FALSE:
  - **Navigation:** the "Shop by School" / "Schools" links (desktop nav, "Shop by Departments" mega panel, mobile drawer, footer) are hidden. A single helper, `isSchoolFeatureHref()`, filters any link to `/schools`, `/bundle(s)` or `#bundles`, so future links are covered too.
  - **Homepage:** the School Book Bundles section and "Find Books by School" are hidden. Hero slides and DB banners whose link points at school features are dropped.
  - **Product page:** the "part of a bundle" promo is hidden. **FAQ:** the class-list/bundles answer is hidden. Breadcrumbs never linked to school pages, so no change was needed there.
  - **Routes:** `/schools`, `/schools/$slug` and `/bundle/$slug` return **404** via a `beforeLoad` guard (`requireSchoolFeatures`), verified on the dev server. A 404 isn't indexed, and none of these URLs are in the sitemap while hidden.
  - **Search:** suggestions no longer return bundles; the search results page and listing pages never included bundles; related bundles only exist on the (now 404) bundle page. **Sitemap:** `/schools`, school pages and bundles are excluded.
  - **Cart:** `useHiddenBundlePurge()` removes bundle / school-bundle lines once settings load and shows "…is no longer available and was removed from your cart" (a banner on Cart, a toast on Checkout).
  - **DB:** `quote_order` / `place_order` raise "Bundles are no longer available…" for bundle lines, and `cart_lines` marks them unavailable.
  - **Admin:** Schools, School Bundles and Bundles moved into a collapsible sidebar group, "School features (hidden on store)". The label drops "(hidden on store)" when the flag is on. The group auto-opens when you're on one of those pages. These screens stay available to staff (admins and managers), as before.
  - Files: `src/lib/feature-flags.ts`, `src/lib/use-hidden-bundle-purge.ts`, `src/components/layout/site-chrome.tsx`, `src/components/home/HomePage.tsx`, `src/routes/{schools,schools.$slug,bundle.$slug,product.$slug,faq,cart,checkout}.tsx`, `src/lib/site.functions.ts`, `src/lib/sitemap.ts`, `src/components/admin/AdminShell.tsx`.
- [x] A3 Tested both states.
  - `supabase/tests/catalog-phase-a.test.mjs`: off = quote/place/cart reject bundles, products unaffected, no order created; on = bundles and school bundles price and order again; all school data still present.
  - `src/lib/feature-flags.test.ts`: flag parsing, link detection, 404 guard, cart-line purge rule. `src/lib/sitemap.test.ts` covers both states.
  - Dev server with the flag off (the dev environment can't reach Supabase, so settings fall back to OFF): `/` 200 with no school links or sections; `/schools`, `/schools/x`, `/bundle/x` 404; FAQ entry hidden; sitemap has no school URLs; `/admin/schools` still loads.
  - The flag ON state was verified by tests only, not in a browser (needs the migration applied).
  - The older P1–P3 suites use bundles, so they now switch the flag on in their setup.
- [x] A4 Nothing dropped: no tables, rows, routes or components removed (the DB test confirms the data is still there).

Checks after Phase A: typecheck **0 errors**; build passes; `npm test` 12 files / 32 tests pass; lint has no new non-formatting issues.

## Phase B — data model

Migration: `20260925100000_catalog_data_model.sql` (idempotent; tested by running it twice).

- [x] B1 Category tree.
  - New columns: `show_in_nav`, `show_on_home`, `seo_title`, `seo_description`, `default_sell_unit`, `default_pack_size`, `default_unit_label`. `parent_id`, `slug` (unique), `image_url`, `description` and `is_active` already existed. **Sort order reuses the existing `display_order` column** rather than adding a second one.
  - Guard: a category can't be its own parent. Helper functions: `category_descendants()`, `category_ancestors()`, `category_product_ids()`.
  - Seeded (insert-only by slug): Books, Stationery, Gifts, Toys & Games, Sports Items, Character Costumes (in nav + on home, in that order); Stationery → Notebooks / Sketch Books / Drafting Pads; Gifts → Gift Wrapping Sheets (pack of 6 sheets) / Gift Bags / Money Folders (pack of 12 folders).
  - **Categories that already exist are NOT modified**, even when their slug matches the seed (e.g. an existing `notebooks` keeps its parent). The mapping below does that after you confirm.
- [x] B2 `product_categories` (product, category, is_primary; unique pair; at most one primary per product, enforced by a unique index; the oldest remaining category is promoted if the primary is removed). Public read, staff write.
  - Backfilled from `products.category_id` as primary.
  - **`products.category_id` is KEPT and kept in sync as the primary**, both ways by trigger. The dashboard, related products, CSV import and the current admin form still use it; removing it would touch many screens for no gain.
  - Read paths moved to the join table + sub-categories: storefront listing and facets, homepage category rows, admin product list category filter (now includes child categories). The product page now loads all of a product's categories (for "Also in"). Related products stay on the primary category (as specified for D3).
- [x] B3 `attribute_definitions` (key, label, type select/multiselect/number/text, unit, help_text, options `[{value,label,sort}]`, `allow_new_options`, `is_filterable`, `is_variant_axis`, sort_order, is_active) and `category_attributes` (required, variant-axis-in-this-category, sort). Children inherit parents' attributes (`category_attribute_set()`, nearest setting wins).
  - `products.attributes` jsonb with a GIN index.
  - Seeded all 12 attributes and their assignments exactly as specified; Costumes: Size (clothing) + Colour are variant axes.
  - **Author / Publisher: `products.attributes` is the single source of truth.** Existing column values were copied in, and their distinct values became the select options (admin-addable). The `author` / `publisher` columns stay only as read-only mirrors kept by a trigger, for search and old queries; a write to the old column is copied into attributes. No `age` column existed.
  - Server validation: `src/lib/attributes.ts` builds Zod checks from the definitions; used in `adminUpsertProduct` (attributes checked against all selected categories incl. inherited; required enforced; variant axes ignored at product level; new author/publisher/colour values auto-added as options) and `adminUpsertVariant` (option values must match the category's variant axes).
- [x] B4 Pack pricing: `products.sell_unit` ('item' | 'pack'), `pack_size` (required ≥2 for packs), `unit_label` ("sheet", "folder"); category defaults for prefilling.
  - Price and stock are per pack. `quote_order` / `place_order` / cart check return `sell_unit`, `pack_size`, `unit_label` per line; the line name gets "(pack of 6)"; order lines snapshot the pack.
  - `src/lib/pricing.ts` → "Rs. 600 / pack of 6 (Rs. 100 per sheet)".
- [x] B5 Variants: `option_values` jsonb (unique per product), `image_url`; own SKU, price (null = product price), stock, is_active already existed. Verified that `quote_order` uses variant price and stock; order lines snapshot `variant_options`. GIN index on option_values, ready for the in-stock size/colour filters in D2.
- [x] B6 `products.sales_count` = units sold in the last 90 days from revenue orders (confirmed / processing / shipped / delivered, or paid; never cancelled / refunded; bundle contents counted).
  - Updated by a trigger when an order's status or payment status changes, plus a daily refresh for the moving 90-day window. The route is `/api/cron/sales-counts` (Bearer `CRON_SECRET`); or pg_cron: `select cron.schedule('sales-counts', '15 3 * * *', 'select public.refresh_product_sales_counts()');`.
  - `products.is_new_arrival` + `new_arrival_until` added. The "New Arrivals" / "Recently Added" queries themselves are built in Phase D.
- Tests: `supabase/tests/catalog-phase-b.test.mjs` (existing categories untouched, re-runnable, tree, multi-category sync and primary switching, RLS, inheritance, author mirror, public columns / cost_price still hidden, pack quote / order / stock, variant uniqueness / price / stock, sales_count incl. cancelled + 90-day window) and `src/lib/attributes.test.ts` (validation + pack display).
  - The legacy P1 test's own "books" category was renamed to avoid the new seed.
  - The current admin product form no longer sends `attributes` (it would fail validation for products in unmapped categories); Phase C replaces it with the real attribute fields.
- Types: `src/integrations/supabase/types.ts` updated by hand for every new table, column and function. **Needs a real regeneration after the migrations are applied** (see below).
- Checks after Phase B: typecheck 0 errors; build passes; `npm test` 14 files / 43 tests pass.

## Phase C — admin

Migration: `20260926100000_catalog_admin.sql` (`attribute_option_usage()`, staff only). A test caught that its first staff check was ineffective inside a SECURITY DEFINER function; it now checks the caller's JWT and is tested.

Server: `src/lib/catalog-admin.functions.ts` (new), `src/lib/admin-helpers.ts` (shared staff / log / attribute helpers moved out of `admin.functions.ts`), `src/lib/catalog-import.ts` (pure row validation, inheritance, variant combinations; unit-tested).

- [x] C1 **Categories** (`/admin/categories`, rebuilt):
  - Tree with product counts, Hidden / Menu / Home badges, "pack of N" badge, ↑/↓ reorder among siblings (also the menu order), and "+" to add a sub-category.
  - Editor: name / slug; parent picker showing full paths (it can't move a category under itself or its own sub-categories, checked on the server too); description; image upload; Active / Show in menu / Show on homepage; default selling unit, pack size and unit name; SEO title / description.
  - Attributes: own ones can be added, set required, set as variant option (for attributes that allow it), reordered and removed. Inherited ones from parents are shown read-only with a 🔒.
  - **Delete is now refused** while a category has sub-categories or products; before, it silently dropped product links. Hide it instead.
- [x] C2 **Attributes** (`/admin/attributes`, new, in the sidebar under Categories):
  - List with type, options, the categories using it, and flags.
  - Editor: label / key (key locked after creation); type (can't change while in use); unit; help text; Active / Show as filter / Can be a variant option / Staff can add options.
  - Options can be added, relabelled (label only, so product values stay intact), reordered, and switched off (inactive = hidden, products keep their value) or removed. Each option shows how many products and variants use it.
  - Removing a used option asks for confirmation in the page, and the **server refuses** it unless confirmed, listing the affected counts.
- [x] C3 **Product form** (`src/components/admin/ProductForm.tsx`):
  - Tabs: Details / Categories / Pricing / Variants / Images.
  - **Categories:** tick any categories in the tree and choose one ★ primary.
  - **Dynamic attribute fields** come from the selected categories (incl. inherited): select, searchable "type or add" for Author / Publisher / Colour, multi-choice, number, text. Required fields are marked, and errors show next to the field (same validation as the server). Values for keys that don't apply to the chosen categories are **kept, not erased**, and listed as "Also stored".
  - **Selling unit** (item / pack, pack size, unit name) prefills from the primary category, with a live "Rs. 600 / pack of 6 (Rs. 100 per sheet)" preview; the stock label switches to "packs".
  - **New arrival** toggle + until-date.
  - **Variant matrix:** pick sizes and colours → "Add all combinations" → edit SKU / price / stock / image / active per row → bulk-set price / stock for selected or all rows → save all at once (each row validated server-side; a duplicate combination is refused). A newly created product stays open so variants can be added straight away.
  - The old Category / Author / Publisher inputs are gone: author and publisher are attributes now.
- [x] C4 **CSV** (`src/components/admin/CatalogImportModal.tsx`, replaces BulkUploadModal):
  - One "Import / Export CSV" dialog with Products and Variants tabs. Each has a template (with `attr_<key>` / `option_<key>` columns generated from the current attributes) and "Export all".
  - Every upload is **dry-run on the server first**: row-by-row create / update / problems, plus a downloadable error report. The Import button appears only when **no row has errors** (nothing half-imported).
  - Products: upsert by slug; `categories` = `slug|slug` (primary first; the old `category_slug` column is still accepted); `attr_<key>` (multi values `|`); old `author` / `publisher` columns map to attributes; `sell_unit` / `pack_size` / `unit_label` default from the category; the old importer's checks (sale < price, ISBN format) are kept.
  - Variants: `product_sku` (or `product_slug`), `variant_sku`, price (blank = product price), stock, `is_active`, `image_url`, `option_<axis>`; updates an existing variant matched by SKU or options.
  - Max 1,000 rows per file. Exports page past 1,000 rows.
- [x] C5 **Products list:** the category filter shows the tree and includes sub-categories and secondary categories (Phase B). New **attribute filter**: choose an attribute, then a value; for variant options such as costume size / colour it matches products that have a variant with that option.
- Tests: `src/lib/catalog-import.test.ts` (inheritance, product / variant rows, errors, pack defaults, new options, combinations), `supabase/tests/catalog-phase-c.test.mjs` (usage counts, staff-only).
  - Not tested: the admin screens themselves were not clicked through. This environment can't reach your Supabase project, and they need the Phase B/C migrations. See the manual test steps.
- Checks after Phase C: typecheck 0 errors; build passes; `npm test` 16 files / 52 tests pass; no new lint issues.

## Phase D — storefront

Migration: `20260927100000_catalog_storefront.sql`: `catalog_search(params)` (SECURITY DEFINER, but returns only public fields of active products in active categories), plus `store_settings.home_sections` and `price_bands`.

- [x] D1 **Mega menu** (desktop): "Shop All" + every top-level category with *Show in menu*, in sort order, with a hover / keyboard-focus dropdown of its sub-categories (and their children). **Mobile drawer**: the same categories as expandable sections at the top; the account / info links are kept. Search, account, wishlist and cart are unchanged. The old hard-coded category links (Uniforms, Baby Items, Party…) and `QUICK_LINKS` are gone.
- [x] D2 **Listings**: `/shop`, `/shop/$category`, `/shop/$category/$subcategory` (`src/components/shop/ShopListing.tsx`, `src/lib/shop.ts`).
  - **Filters are category-specific and data-driven.** They come from `category_attributes` (own + inherited) plus a "Type" filter of child categories. `/shop` shows only Category + Price + Sort. Options show counts, and 0-result options are hidden. Counts are disjunctive: each filter's counts apply all the *other* filters.
  - Costume Size / Colour match an **in-stock** variant, and size + colour must be on the same variant.
  - **Price range slider** (two handles) plus min / max inputs, using the min / max of the current results (ignoring the price filter itself).
  - **Sort**: New Arrivals (default) / Best Sellers / Price ↑ / Price ↓ / Name.
  - Filters, sort and page all live in the URL (shareable, back-button safe). Filters that don't exist in the current category are ignored by the server and dropped from the URL. Active-filter chips with "Clear all".
  - Breadcrumbs, category banner (image + description), empty states, pagination. Filters open in a left drawer on mobile.
  - A sub-category opened as `/shop/<child>` or under the wrong parent is **301-redirected** to `/shop/<parent>/<child>`.
  - **Old URLs 301-redirect**: `/products` → `/shop`, `/category/<slug>` → `/shop/…`, `/search?q=` → `/shop?q=`. The old `ListingView` / `ProductFilters` components and their queries were removed.
  - **Tested against the Phase 1 filter map**: `supabase/tests/catalog-phase-d.test.mjs` opens every category page and asserts it shows exactly the filters in the table (Books, Stationery, Notebooks, Sketch Books, Drafting Pads, Gifts, Gift Wrapping Sheets, Gift Bags, Money Folders, Toys & Games, Sports Items, Character Costumes, /shop).
- [x] D3 **Product cards**: "Pack of 6" badge + "/ pack" + "Rs. X per sheet"; a variant price range for costumes; "New", "Out of stock" and "Only N left" badges; the button says "Choose options" for variant products.
  - **Removed the fake rating**: every card showed 5 stars and "(24)", and the product page said "(24 reviews)", regardless of real reviews.
  - **Product page**: size / colour selectors built from the variants (ordered like the attribute options). Combinations with no in-stock variant are disabled. Image, price, stock and SKU follow the chosen variant.
  - It also shows pack pricing, an attributes table (labels from the definitions: Author, Publisher, Pages, Binding…), "Also in" links for other categories, and breadcrumbs from the primary category. Related products come from the same primary category.
- [x] D4 **Cart / checkout**: the cart shows "/ pack of N" and variant names. Totals still come only from the server (cart check + `quote_order`); checkout line names come from the quote ("Floral Wrap (pack of 6)", "Spider Suit — 6-7Y / Red").
- [x] D5 **Homepage** (`src/components/home/CatalogSections.tsx`): Shop by Category (cards of top-level categories with *Show on homepage*, with images), New Arrivals, Recently Added, Shop by price, Best Sellers. Hero banners, the (flag-controlled) school sections and the newsletter stay.
  - **Admin → Settings → Homepage**: reorder / switch sections on and off, and edit the price bands (defaults: Under Rs. 500, 500–1,000, 1,000–2,500, 2,500–5,000, 5,000+). Each band links to `/shop` with the price filter.
  - Sections with no products are hidden automatically.
  - The old hard-coded homepage rows (Baby & Toddler, Uniforms, Lunch Boxes, Water Bottles, Party, promo columns / deal banner linking to old categories) were removed.
- [x] D6 **Search**: `/shop?q=` searches name, description, SKU, ISBN (also digits-only ISBN) and **any attribute value** (author, publisher…). Suggestions add publishers (products also match on publisher / SKU); ISBN lookup is kept; bundles are excluded while school features are hidden. The "Popular" chips are now the main category names instead of hard-coded school searches.
- [x] D7 **Footer**:
  - Links: Returns & Exchange Policy (`/refund`), FAQs, Track Your Order, Terms & Conditions, Delivery Policy (`/shipping`), Contact Us, About, Privacy, plus the category links (data-driven).
  - Contact details, store name and **payment badges now come from Settings**. The footer used to advertise Visa / MasterCard / JazzCash / EasyPaisa, which checkout doesn't accept, and a fake phone number.
  - The **Delivery Policy page now reads the live shipping zones**; it used to show a made-up rate table and "free over PKR 2,000".
  - All footer pages already existed, so nothing new was created. **Client to review the copy** of `/refund`, `/terms`, `/privacy`, `/about`, `/faq` and the courier section of `/shipping` (marked `PLACEHOLDER COPY` in the code). They contain generic text (e.g. the FAQ mentions card payments and guest checkout, which the store doesn't offer).
- Tests: `supabase/tests/catalog-phase-d.test.mjs` (filter map; price range incl. sale price; disjunctive counts; OR within a filter; multi-category; all sorts; attribute search; pagination; best-seller section; not-found). Unit: `src/lib/shop.test.ts` (query builder, URL parsing, filter cleaning, chips, category paths), `variant-picker.test.ts`, `home-sections.test.ts`.
  - Dev server: `/`, `/shop`, `/shop/books`, `/shop/stationery/notebooks`, `/product/…`, `/shipping`, `/admin/attributes` → 200; `/products?q=`, `/search?q=`, `/category/…` → 301 to `/shop…`.
  - Pages were **not checked with real data** (no DB access here).
- Checks after Phase D: typecheck 0 errors; build passes; `npm test` 20 files / 65 tests pass; no new lint issues.

## Phase E — SEO, tests, final report
- [x] E1 **Sitemap** (`src/lib/sitemap.ts`, `getSitemapEntries`): categories are listed at their canonical `/shop/<category>` and `/shop/<parent>/<child>` URLs (sub-categories included; a category under an inactive parent is skipped because it has no page). `/shop` replaces `/products`, and no `/category/…` URLs remain. All active products are listed (paged past Supabase's 1000-row limit). `/schools`, school pages and bundles are left out while school features are hidden.
- [x] E2 **Meta / canonical / JSON-LD** (`src/lib/seo.ts`):
  - Category pages use the category's *SEO title* / *SEO description* (fallbacks: name, then the description as plain text, then a generic line). Page 2+ gets "— Page N" in the title.
  - **Canonical on listings**: any filter, search, price range or non-default sort points at the plain category URL; an unfiltered page 2+ keeps `?page=N`.
  - **BreadcrumbList** JSON-LD on `/shop`, category, sub-category and product pages (Home › Shop › Category › Sub-category › Product).
  - **Product** JSON-LD: one `Offer`, or an `AggregateOffer` with **one Offer per active variant** (name, SKU, price, in/out of stock). Prices follow the server rule (sale price if lower; variant price, else base + modifier). Packs add a `UnitPriceSpecification` with the pack size ("6 sheet"). ISBN-13 becomes `gtin13`; brand or publisher becomes `brand`. No rating markup (the fake 5-star rating was removed in Phase D).
  - The product page now has a loader, so the real name, description, image and canonical are in the server HTML. Previously the title was built from the slug and the description promised free delivery. A missing product gets `noindex`.
  - All JSON-LD is escaped so product text can't break out of the `<script>` tag (the root Organization block too).
  - URLs are absolute when `VITE_SITE_URL` is set (added to `.env.example`), otherwise root-relative like the site's existing canonicals.
  - Internal links that still pointed at old URLs (search-suggestion categories, a product breadcrumb fallback, the bundles "View all", the fallback hero slide, the banner-link placeholder) now go straight to `/shop` instead of through a 301.
- [x] E3 **Tests** (new: `src/lib/seo.test.ts`, `supabase/tests/catalog-phase-e.test.mjs`; updated: `src/lib/sitemap.test.ts`). Coverage for each item asked for:
  - Pack / variant pricing: server `quote_order` / `place_order` ignore browser prices; variant own price, sale + modifier fallback, pack sale price, inactive / foreign variant rejected, variant stock reduced (phase-b + phase-e DB tests); the client-side rule matches (seo.test).
  - Attribute validation: `attributes.test.ts`, `catalog-import.test.ts`.
  - Filter builder: `shop.test.ts`; the filter map for every category is verified against the DB (`catalog-phase-d`).
  - School flag: `feature-flags.test.ts`, `catalog-phase-a`, `sitemap.test.ts`.
  - sales_count: pending not counted; confirmed / delivered counted; **cancelled and refunded excluded**; a cancelled order can't be re-opened; the 90-day window (phase-b + phase-e).
- [x] E4 Final report: below.
- Checks after Phase E: typecheck 0 errors; build passes; `npm test` **22 files / 78 tests pass**; no new lint issues (the only lint output on changed files is pre-existing Prettier formatting and `any`s that were already there). Dev server: `/shop?sort=price_asc&page=2` → canonical `/shop`; `/shop?page=3` → canonical `/shop?page=3`; BreadcrumbList rendered server-side; `/category/books` → 301 `/shop/books`; `/sitemap.xml` 200.

### [x] Mapping existing categories: not needed (checked 2026-09-24)
The Supabase host resolves again, so the live project was checked read-only through the API:
- **0 categories, 0 products**, 0 orders, 0 profiles, 0 user roles (no admin account yet), 0 banners, 0 shipping zones. The only data: 5 schools and the `store_settings` row.
- Only the base schema is live. **None of the 11 audit migrations and none of the 4 catalog migrations are applied** (`cart_lines` / `quote_order` don't exist; `cost_price` is still readable).

With no existing categories there is nothing to remap, so **no mapping migration is needed**. `20260925100000_catalog_data_model.sql` creates the whole tree when applied: Books, Stationery (Notebooks, Sketch Books, Drafting Pads), Gifts (Gift Wrapping Sheets, Gift Bags, Money Folders), Toys & Games, Sports Items, Character Costumes, with their attributes and filters. The earlier proposed table (`baby-items`, `party-essentials`, …) was only a guess from slugs linked in the old code, and none of them exist.

## Open questions (default in use)
- (A) Should managers also see the hidden School features group? **Default: yes** (they could manage schools before). Say if it should be admin-only.
- (B) ~~Supabase host doesn't resolve~~ **Resolved 2026-09-24**: the host resolves and the API answers.
- (B) Season — meaning unconfirmed. **Default:** select "Season" with options "2026-27 Session", "Latest Edition" (editable).
- (B) Gift Bag attributes unconfirmed. **Default:** Size (paper), Occasion, Colour.
- (B) Gift Wrap and Sketch Book sizes use the paper sizes A3/A4/A5/B5/Letter. **Default** kept; the real sheet sizes may differ (e.g. 50×70 cm).
- (B) Character Costumes: its own top-level area, **not** under Toys or Gifts. A product can also be added to Toys & Games or Gifts through multi-category.
- (B) New Arrivals vs Recently Added. **Default:** New Arrivals = admin-flagged and not expired, falling back to products added in the last 30 days; Recently Added = newest by date added.
- (B) Sales count window: **default 90 days**; bundle contents count as sales of each item.
- (D) Pricing Bar: **default** = a strip of price-band buttons on the homepage (editable in Settings → Homepage) linking to `/shop?min=&max=`, while every listing page also has the price slider. Say if you want a slider on the homepage instead.
- (D) New Arrivals section = flagged-and-not-expired products **plus** anything added in the last 30 days (flagged ones first); Recently Added = newest by date added.
- (D) ~~Hard-coded announcement bar text~~ Resolved: the announcement bar comes from Settings, and the old wording is replaced by the rebrand migration `20260929100000_rebrand_schoolbooksexperts.sql`.
- (D) Product price filter / sort use the product's price (sale price if lower). For costumes whose variants have different prices, the card shows the variant price range, but the price filter matches on the product price.
- (E) `VITE_SITE_URL`: set it to the live URL (same value as `SITE_URL`) so canonicals and JSON-LD are absolute. **Default:** without it they are root-relative, which search engines accept.
- (E) Filtered listings are **canonicalised** to the category page, not `noindex`ed. Say if you'd rather have `noindex, follow` on filtered views.
- (E) The fallback hero slide (shown only when no banners are set in admin) said "Baby & Toddler Essentials"; it now promotes Toys & Games. Real banners from Admin → Banners are unaffected.

---

# Final report

## Migrations, in order
Apply after the 11 audit-fix migrations (branch `fix/audit-priority-1`). Each one is idempotent (safe to re-run) and none edits an older migration.

| # | File | What it does |
|---|---|---|
| 1 | `20260924100000_school_features_flag.sql` | `store_settings.school_features_enabled` (default **off**); checkout / cart reject bundle and school-bundle lines while off. |
| 2 | `20260925100000_catalog_data_model.sql` | Category tree fields and seed (six areas + Stationery / Gifts children, insert-only); `product_categories`; attribute definitions and category attributes (12 seeded); `products.attributes`; packs; variant `option_values` / `image_url`; `sales_count` and new-arrival fields; updated `_compute_order`, `place_order`, `cart_lines`. |
| 3 | `20260926100000_catalog_admin.sql` | `attribute_option_usage()` (staff only). |
| 4 | `20260927100000_catalog_storefront.sql` | `home_sections` and `price_bands` settings; `catalog_search()` (listings, filters, facets, sorting). |

Then regenerate the types: `npx supabase gen types typescript --project-id <id> > src/integrations/supabase/types.ts` (the file was hand-updated to match). Optionally schedule `select refresh_product_sales_counts();` daily (e.g. pg_cron) so the 90-day window rolls forward even on days without order changes.

## Blocked / waiting on you
1. ~~Apply all 15 migrations~~ **Done 2026-09-24**: all 15 applied in filename order through the session pooler (`aws-1-ap-northeast-2.pooler.supabase.com`; the direct `db.<ref>.supabase.co` host is IPv6-only). Verified: `quote_order`, `cart_lines`, `cancel_my_order`, `catalog_search` exist; `decrement_order_stock` is dropped; 12 categories and 12 attribute definitions are seeded; anon can no longer read `cost_price`. All 29 versions are recorded in `supabase_migrations.schema_migrations`. Types regenerated from the live project (`supabase gen types`); typecheck 0 errors, 78 tests pass.
2. **Create the first admin**: sign up on the site, then in the SQL editor run `insert into user_roles(user_id, role) select id, 'admin' from auth.users where email = '<your email>';`
3. **Store name**: resolved — SchoolBooksExperts everywhere (the old name in `store_settings` is replaced by the rebrand migration `20260929100000_rebrand_schoolbooksexperts.sql`).
4. The open questions above; every one has a working default that can be changed from admin or with a one-line change.

## Client demo checklist
Before the demo: apply migrations 1–4, set `SITE_URL` / `VITE_SITE_URL`, and add 2–3 products per area (use Admin → Products → Import with the CSV template).

**Admin**
- [ ] Settings → Store Info: the "Show school features" toggle is off; Schools / Bundles are gone from the store and the admin group is collapsed.
- [ ] Categories: drag to reorder; create a sub-category under Gifts; tick *Show in menu*; set an SEO title.
- [ ] Attributes: add a new Colour option; try to remove an option in use (blocked, showing how many products use it).
- [ ] Product form: pick Notebooks, and the Subjects + Binding Type fields appear; add a second category; switch to Pack of 6 sheets.
- [ ] Costume: generate the Size × Colour variant grid, then set one combination to 0 stock.
- [ ] CSV import: dry run shows row errors; a fixed file imports all rows.
- [ ] Settings → Homepage: reorder sections and edit a price band.

**Storefront**
- [ ] Mega menu hover (Stationery shows 3 sub-categories); mobile menu.
- [ ] `/shop/stationery/notebooks` shows only Subjects, Binding Type, Price; `/shop/gifts` shows only Type and Price.
- [ ] Tick filters, copy the URL into a new tab (same results), press back, then "Clear all".
- [ ] Price slider; sort by Best Sellers / Price.
- [ ] Costume page: out-of-stock size / colour greyed out; price and image follow the selection.
- [ ] Pack product: "Pack of 6 · Rs. 100 per sheet" on card, product page, cart and checkout.
- [ ] Search by author, publisher and ISBN.
- [ ] Place a COD order, then confirm it in admin: Best Sellers updates. Cancel it: the count goes back down.
- [ ] Old links `/products`, `/category/books`, `/search?q=maths` land on `/shop`.
- [ ] SEO: view source of a product page to see the Product + BreadcrumbList JSON-LD (check with Google's Rich Results Test); open `/sitemap.xml`.
- [ ] Footer: real phone / email, only the payment methods that are on, real delivery zones.

**Have the client review:** the wording of Returns, Terms, Privacy, About and FAQ; the announcement bar text.
