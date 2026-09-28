# Homepage redesign — progress

Legend: `[x]` done · `[~]` partly done / decision to confirm · `[!]` blocked · `[ ]` not started.
Resume from the first task that isn't `[x]`. Migrations are written but **not applied** to production, and nothing is deployed.

**Reference design:** no image was attached to the brief, so layout is built from the written spec. The Phase 5 pixel check needs the reference image.

## Phase 1 — shared components
- [x] 1.0 Storefront theme tokens in `src/styles.css`: `--store-primary`, `-hover`, `-foreground`, `--store-soft` (top bar / footer), `--store-price` (price pill), `--store-ink`, used as `bg-store-*` / `text-store-*`. Default = current brand teal/cream. **"teal" preset** (`<html data-theme="teal">`) matches the reference; its primary `#00827C` keeps white button text at ~4.7:1 (AA). Switched in Admin → Settings → Header & Footer (Phase 2; applied as `<html data-theme>` on the server, no flash).
- [x] 1.1 `src/components/store/ProductCard.tsx`: white rounded card, square padded `object-contain` image (400×400 set, lazy unless `priority`), UPPERCASE 2-line name, pale-yellow pill `Rs.1,395.00`, variant range `Rs.68.00 - Rs.269.00`, struck-through was price, "Pack of 6", full-width ADD TO CART / CHOOSE OPTIONS / disabled OUT OF STOCK, heart on hover (desktop) or always (mobile). Real add-to-cart (capped at stock) with a toast + "View cart" and a **cart badge bump** (only on a real add, not on page load). CHOOSE OPTIONS opens a **quick-view modal** (`QuickViewDialog.tsx`, lazy-loaded, same size/colour rules as the product page; out-of-stock combinations disabled).
  - Replaces the old card on `/shop` listings, the current homepage rows and "You May Also Like". The old card and skeleton were removed from `site-chrome.tsx`.
  - Fixed on the way: the old card's button did nothing (the whole card was a link), and related products lacked variant/stock data, so a costume would have offered ADD TO CART without a size. The related query now embeds variants (still one request).
  - Products without a photo show `/placeholder-product.svg` instead of the remote book photo.
- [~] 1.1a Compare-at price. **Decision to confirm:** products already have this pair (`price` = regular, `sale_price` = discounted; the card strikes through `price` when `sale_price` is lower), so products get no new column: a second "was" price would conflict with what the server charges. **Variants** get `compare_at_price` (display only; `quote_order` / `place_order` ignore it). Editable in Admin → Products → Variants ("Was price" column); shown on the product page and in the quick view for the selected variant. On the card since Phase 2 (`catalog_search` returns `variant_was_max`); shown only when the variants share one price, never next to a range. Admin saving works before and after the migration is applied (the column is only sent when set or cleared). Not yet in the CSV importer.
- [x] 1.2 `ProductCarousel.tsx`: 2 / 3 / 4 / 6 cards (mobile / tablet / laptop / desktop), native scroll-snap (swipe on touch, no carousel library: embla isn't installed), round prev/next buttons overlapping the edges, hidden at the ends, aria-labelled.
- [x] 1.3 `SectionHeading.tsx`: bold left title, optional subtitle, "View all →".
- [x] 1.4 `BannerImage.tsx`: `<picture>` with separate desktop / mobile images (width/height set, no layout shift), optional heading / subheading / CTA with a readability scrim, eager + high priority for the hero. Links via `src/lib/banner-link.ts`: category (nested path), product, filtered listing (same-site only), external URL (http/https only; `javascript:` etc. refused; opens in a new tab).
- [x] Checks: typecheck 0 errors; **98 tests pass** (new: `card-pricing.test.ts`, `banner-link.test.ts`, `supabase/tests/homepage-phase1.test.mjs`); new files lint-clean (Prettier-formatted); build passes (quick view is its own 1.8 kB gzip chunk).
  - [!] Visual check in a browser not done: the Chrome extension wasn't connected. The listing loads products in the browser, so the server HTML check can't show cards.

## Phase 2 — header, nav, footer
New: `src/components/layout/{AnnouncementBar,SiteHeader,SiteFooter,DeliveryLocation}.tsx`, `src/lib/{site-settings,site-settings.functions,delivery-location,site-links,category-icons}.ts(x)`, admin `SiteChromeSettings.tsx`. `SiteShell` (site-chrome.tsx) now uses them; the old header / nav / footer / announcement code was removed. Every storefront page gets the new chrome; admin pages are unchanged.

- [x] 2.1 Announcement bar: light-teal strip, centred text, optional link, several messages rotate (interval set in admin; pauses on hover / focus). Text, links, order, interval and on/off in Admin → Settings → **Header & Footer**. First message is server-rendered. Default: "Welcome to <store name>".
- [x] 2.2 Header row: logo (Settings logo URL, else the store name), **"Choose delivery or pickup / Set city" pill** → city picker built from active shipping zones (search, estimate per city). The choice is saved in the browser for everyone and on the profile when signed in (restored on a new device), shows "Deliver to Lahore · Delivery in 1 day", and **pre-fills the checkout city**. Big rounded search bar (existing suggestions + ISBN lookup kept, restyled). Account, wishlist and cart icons with count badges.
  - Kept the wishlist icon (the spec lists account + cart only); say if you want it removed.
  - [!] **Pickup:** the pill offers "Pickup" only when Admin → Header & Footer → Store pickup is on (default **off**). Checkout / `place_order` has no pickup method yet, so it would still charge delivery. **Decision needed:** should pickup orders skip the delivery charge (needs a checkout + pricing change), or stay delivery-only?
- [x] 2.3 Nav row: "Shop by Departments ▾" mega menu (every category with its image or an icon, and its sub-categories; opens on hover or click, closes on Escape / click outside), divider, highlighted **Shop Deals** → `/shop?on_sale=true`, then the top categories (show_in_nav). Sticky header, more compact after scrolling. Mobile: hamburger drawer (account, Shop Deals, departments with sub-categories, help + policy links, WhatsApp); search sits below the logo row with a "Deliver to…" line.
  - **Shop Deals** = products whose sale price is below the price, or with an active variant below its compare-at price (`product_on_sale()`), via a new `only: "on_sale"` in `catalog_search`. Works with category, filters and sort; "Deals only" chip; "Clear all" removes it. Coupons aren't product-specific in this store, so they aren't "deals" here.
- [x] 2.4 Footer (light-teal, 4 columns desktop / stacked mobile): logo; "For Queries and Complaints" phone + hours; WhatsApp + hours; email; "Follow us on" (only filled-in socials); "Download the App" badges (hidden until a link is set) | categories | newsletter (existing subscribers table) + About / Returns / Delivery / Terms / Privacy / Payment Information | My Account / FAQs / Track Your Order / Cash on Delivery / Contact Us. Bottom: "© 2026 <store> All Rights Reserved" + optional "Powered by" (text + link in settings). Floating WhatsApp button on every page (number + pre-filled message from settings).
  - "Payment Information" and "Cash on Delivery" link to the FAQ's Payments section (anchors added to the FAQ page).
- [x] Also: "Skip to content" link; the root loader now also loads categories on the server (header + nav server-rendered); theme-color meta follows the preset.
- [x] Checks: typecheck 0 errors; **109 tests pass** (new: `site-settings.test.ts`, `homepage-phase2.test.mjs`); new files lint-clean; build passes. Built server against the **live** database (migrations not applied): `/`, `/shop?on_sale=true`, `/shop/stationery/notebooks`, `/product/…`, `/faq` → 200 with header + footer server-rendered, no server errors; defaults used where settings columns don't exist yet.
  - Before the migration, `/shop?on_sale=true` shows "no products" (the old search doesn't know `on_sale`).
  - [!] Visual / responsive check in a browser still not done (Chrome extension not connected).

**Client must fill in (Admin → Settings):** real phone (live value is the placeholder `+92 300 0000000`), phone hours, WhatsApp number / hours / message, email, social links, app links (optional), announcement messages, logo URL. The live store name is "Jahangir's Sons" (see the store-name question in CATALOG_PROGRESS.md).

## Phase 3 — homepage section builder
New: `src/lib/homepage-sections.ts` (types, Zod config schemas, defaults, image sizes, scheduling, sources), `src/lib/homepage-queries.ts`, `src/lib/homepage-admin.functions.ts`, `src/components/admin/homepage/{fields,SectionEditor}.tsx`, route `/admin/homepage` (sidebar: **Homepage**; the old page is now "Banners (old)").

- [x] 3.1 `homepage_sections` (id, type, title, subtitle, config jsonb, sort_order, is_active, starts_at, ends_at, created_at, updated_at, plus `seed_key` for idempotent seeding). Public read = active and within the schedule (RLS); staff (admin / manager) write. Checks: known type, config is an object, end after start.
- [x] 3.2 Nine types with validated configs: `hero_slider` (slides with desktop + mobile image, alt, heading, CTA, link; interval 2–20 s), `product_carousel`, `category_circles` (chosen + ordered), `banner_full` (+ optional carousel underneath), `banner_with_products` (side left | right), `banner_pair`, `promo_tiles` (exactly 3; image, title, button, colour, link), `price_bar` (editable ranges), `app_banner` (store badges use the Settings links; off by default in Phase 4). The storefront falls back to a type's defaults if stored config is ever invalid, so a bad save can't break the homepage.
- [x] 3.3 Product sources: category (incl. sub-categories and multi-category products), new_arrivals, recently_added, best_sellers, on_sale, manual (search + drag / arrows to order, max 48). Limit 1–24 (default 12). "View all" is generated from the source (none for hand-picked). One request per carousel: `catalog_search`, or one select by id with variants embedded (manual). Inactive picked products are skipped.
- [x] 3.4 Admin → Homepage: list top-to-bottom with **drag to reorder** (and arrow buttons for keyboard use), Live / Off / Scheduled / Ended badge, on/off switch, schedule dates, duplicate (copy is switched off), delete (confirmed), "Add section" by type, edit sheet per type: image upload (compressed to WebP, stored at up to 2× the recommended width, real pixel size saved for width / height, warning if the shape is off), recommended size shown on every image field, link picker (category / product search / filtered listing / URL), product source picker, ordered category picker, colour picker for tiles. The same validation runs in the browser and on the server.
  - "Preview homepage" opens `/?preview=1` in a new tab. **Showing switched-off / scheduled sections in the preview is built in Phase 4** (staff only), together with the homepage rendering.
  - [~] Banners migrated: the migration copies active hero banners into one hero slider and section / sidebar banners into full-width banners (their dates become the section schedule), once. The live store has **no banners**, so nothing is copied there. The `banners` table and its admin page are kept until you confirm they can go.
- [x] 3.5 Recommended sizes (shown in admin, used for placeholders and CLS): hero 1920×700 (mobile 800×800), full banner 1600×300 (mobile 800×400), side banner 600×420, pair banner 900×520, promo tile 600×480, category circle 300×300, app banner 1920×600 (mobile 800×600).
- [x] 3.6 Placeholders: `BannerImage` with no image draws a store-colour gradient with soft shapes in the recommended proportions (so nothing jumps when a real image arrives), plus the section title and "Shop Now". Theme-aware; no third-party images.
- [x] Checks: typecheck 0 errors; **125 tests pass** (new: `homepage-sections.test.ts`, `homepage-phase3.test.mjs`: RLS for public / customer / staff, scheduling window, banner copy + idempotency, constraints); new files lint-clean (1 fast-refresh warning: a component file also exports a hook); build passes. Admin pages are client-rendered (`ssr: false`, same as before), so their check is in the browser; data is protected by staff checks + RLS.
  - [!] Admin screen not clicked through in a browser (Chrome extension not connected; also needs the migration and an admin login).
- Note: Settings → Homepage (the old `home_sections` / `price_bands` settings) still drives the current homepage until Phase 4 switches it to these sections.

## Phase 4 — build the homepage
New: `src/components/home/{HomePage,HomeSections}.tsx`, `src/components/home/sections/{HeroSlider,Sections}.tsx`, `src/lib/{homepage-default,homepage-render,use-in-view}.ts`; route `/` rewritten. Removed: the old hard-coded hero / rows (`CatalogSections.tsx`, `lib/home-sections.ts` + test) and the second newsletter box (the footer has one). Settings → Homepage tab now points to Admin → Homepage (the old `home_sections` / `price_bands` columns are unused but not dropped).

- [x] Seed (`20260928130000_homepage_default_sections.sql`, idempotent via `seed_key`) in the reference order: hero (3 placeholder slides: Back to School Stationery, Gifts for Every Occasion, Character Costumes) · New Arrivals · Shop by Department (Books, Notebooks, Sketch Books, Drafting Pads, Gift Wrapping, Gift Bags, Money Folders, Toys & Games, Sports Items, Character Costumes) · Books banner + carousel · Stationery banner LEFT + carousel · Toys & Games | Character Costumes pair · Gifts carousel + banner RIGHT · Sports banner + carousel · Shop by Price · Best Sellers · Recently Added · promo tiles (Deals & Discounts → deals, Gift Ideas → Gifts, Web Exclusive → /shop) · app banner (**off**). The default hero is skipped if the old banners already produced one.
  - The same layout lives in code (`DEFAULT_HOME_LAYOUT`) as the fallback when the table is missing or empty (so the live site shows it before the migrations); a test checks seed and code are identical.
  - "Web Exclusive" links to /shop: there's no "web exclusive" tag or filter yet. Point it at a product list or a hand-picked carousel in admin.
- [x] Rendering: sections in order; empty-source sections hidden (product rows disappear when their source has no products; a full banner keeps its banner and drops only the carousel); switched-off / out-of-schedule sections never shown (database policy); banners / slides / tiles linking to school pages hidden while school features are off; school bundles + "find books by school" appear after the hero only when switched on. A bad stored config falls back to the type's defaults.
  - Hero: full-bleed, autoplay (interval from admin; paused on hover / focus / reduced motion), arrows + dots (labelled), swipe, first slide eager + high priority, hidden slides `inert`.
  - Layout: centred `container` column, `py-6 md:py-10` rhythm, full-bleed hero and brand strips, "Shop by Price" on the soft band. Side-banner rows use a narrower carousel (2 / 3 / 3 / 4 cards); category circles 3 / 5 / 7 / 10.
  - Promo tiles: curved colour shape with title + button; text colour picked automatically (black or white) for contrast with the chosen colour.
- [x] Performance: the loader fetches sections + settings + the **first two product rows** on the server (header, hero and top rows server-rendered); later carousels load when within 600 px of the screen. **Added `@tanstack/react-router-ssr-query` (1.167.2, exact)** so server-loaded queries are sent with the page instead of being fetched again. This also fixes the same double-fetch for the header's settings / categories on every page. npm also moved `@tanstack/react-query` 5.101 → 5.104 (within the existing `^5.83` range).
- [x] SEO: homepage title / description / canonical from Settings (meta title / description); Organization (name, url, logo, contact, address, social `sameAs`) + WebSite with SearchAction (`/shop?q=`) JSON-LD. The root's old hard-coded Organization block ("since 1968", "Lahore") was removed; the root's fallback title / description no longer mention departments the store doesn't have.
- [x] Preview: `/?preview=1` for staff shows every section, with a label on the ones shoppers can't see (off / scheduled / ended). For everyone else it's the normal homepage.
- [x] Checks: typecheck 0 errors; **130 tests pass** (new: `homepage-render.test.ts`, `homepage-phase4.test.mjs`); new files lint-clean; build passes. Built server against the **live** database (no new migrations): `/` renders the default layout on the server with real products and prices in New Arrivals and Books, category circles, price bar, promo tiles, JSON-LD and canonical; no server errors; `/shop`, category and product pages 200.
  - The live `store_settings.meta_title` is still "Jahangir's Sons — A Complete Family Store, Lahore Since 1968": update it in Settings → SEO.
  - With the live data, Best Sellers has no products yet (no orders), so it disappears once loaded.
  - [!] Not checked in a browser (Chrome extension not connected): hydration, swipe, autoplay, visual spacing.

## Phase 5 — polish and final report
Checked in Chrome against a local production build using the live data (the new migrations weren't applied, so the homepage showed its built-in default layout).

- [~] 5.1 Layout check at 1440, 1024 / 768 (tablet) and 375 (phone). **[!] No reference image was provided, so this was checked against the written spec, not pixel-matched.** Fixed:
  - horizontal scroll on wide screens (carousel arrows sticking out past the page edge) → `main` clips horizontal overflow;
  - section headings, footer headings and product names showed in the serif font (a global `h1–h4` rule beat Tailwind's `font-sans`) → moved into the base layer;
  - "banner on the right" rows put the banner in the wide column → columns swap with the side;
  - placeholder "Shop Now" buttons were the same colour as the placeholder → white;
  - a stray yellow blob in placeholders removed;
  - tablet header: the delivery pill squeezed the search box to one word → pin icon only at 768–1023 px.
  - Verified: equal-height cards with bottom-aligned buttons, 2 / 3 / 4 / 6 cards per row, no horizontal scroll at 375 / 768 / 1440, hero slides and dots, sticky header, quick view → size + colour → add to cart → toast + badge.
- [x] 5.2 Accessibility: alt text required on every banner / tile image in admin (form + server); carousel / slider arrows and dots labelled; keyboard focus outline now follows the theme colour; hidden hero slides are `inert`. Lighthouse Accessibility **100** on the homepage, a category page and a product page, after fixing: unlabelled sort dropdown, heading order on listings, unlabelled quantity −/+ and share buttons, low-contrast "In stock" text.
- [!] 5.3 Performance: **target (mobile ≥ 85) not reached in local tests.** Lighthouse mobile on the local build behind a compressing proxy (to match Netlify): homepage **63–69**, category page ~56, product page ~58; Accessibility 100, Best Practices 96–100, SEO 92, CLS ≈ 0 everywhere.
  - Done: self-hosted fonts (`@fontsource`, no render-blocking Google Fonts request); first product row loads eagerly; only the top 3 sections are server-rendered and hydrated, the rest render as they scroll into view (main-thread blocking 1.24 s → ~0.7 s, HTML 146 KB → 84 KB); WhatsApp pulse animation moved to the compositor; announcement fade only when messages rotate.
  - Why it's still below 85: the shared JavaScript bundle is ~228 KB compressed (React DOM, the full Supabase client, router, query, Zod) and takes ~0.6–0.9 s to run on a throttled phone; server response in these tests was 0.5–1.5 s because every request went from this PC to the Supabase server abroad.
  - To get to 85+: measure on the deployed Netlify site first (CDN, HTTP/2, real latency); then the biggest lever is trimming the shared bundle (load the Supabase auth / realtime parts only where needed, lighter toast / validation on the storefront), and caching the homepage data at the edge.
  - Best Practices 96 / SEO 92 on the homepage are local-only: the 404 is the missing `homepage_sections` table (apply the migration), and the canonical is relative because `SITE_URL` wasn't set locally.
- [x] 5.4 Tests: **142 pass**. New `src/components/home/HomeSections.test.tsx` renders every section type (hero, product carousel, category circles, full banner, banner + products left / right, banner pair, promo tiles, price bar, app banner, unknown type) and the hiding rules (empty source hides the row; a full banner keeps its banner; school links hidden while school features are off; preview labels off / scheduled sections). Scheduling is tested in `homepage-sections.test.ts` (status) and `homepage-phase3.test.mjs` (database policy: only active, in-window sections are public); sources in `homepage-sections.test.ts` + `homepage-phase2.test.mjs` (deals).
- [x] 5.5 Final report: below.

---

# Final report

## What was built
- **Phase 1:** new product card (price pill, ranges, was-price, pack size, Add to cart / Choose options / Out of stock, wishlist heart), quick-view modal, cart toast + badge bump, product carousel (swipe), section heading, banner component with safe link handling, storefront colour tokens with a "teal" preset, variant compare-at price.
- **Phase 2:** rotating announcement bar; header with delivery-city picker (saved per shopper, pre-fills checkout), big search, account / wishlist / cart; nav with "Shop by Departments" mega menu, "Shop Deals", top categories; sticky compact header; mobile drawer; 4-column footer with newsletter and settings-driven contacts / socials / app badges; floating WhatsApp button; Admin → Settings → **Header & Footer**.
- **Phase 3:** homepage section builder (9 types, schedule, on/off, drag-to-reorder, duplicate, preview), product sources (category, new, recent, best sellers, deals, hand-picked), image upload with recommended sizes, store-colour placeholders. Admin → **Homepage**.
- **Phase 4:** the homepage rebuilt from sections in the reference order, SSR for the top, lazy lower sections, JSON-LD (Organization + WebSite search), meta from settings, staff preview.
- **Phase 5:** fixes listed above.

## Migrations — apply in this order (none applied yet)
1. `20260928100000_variant_compare_at_price.sql`
2. `20260928110000_catalog_search_on_sale.sql`
3. `20260928110100_site_chrome_settings.sql`
4. `20260928120000_homepage_sections.sql`
5. `20260928130000_homepage_default_sections.sql`

New packages: `@tanstack/react-router-ssr-query` 1.167.2, `@fontsource/dm-sans` 5.3.0, `@fontsource/playfair-display` 5.3.0 (and `@tanstack/react-query` moved 5.101 → 5.104 within its range).

## Images the client must supply (Admin → Homepage)
| Where | Size (desktop) | Mobile | Count |
|---|---|---|---|
| Hero slides (Back to School, Gifts, Costumes) | 1920×700 | 800×800 | 3 |
| Full-width banners (Books, Sports) | 1600×300 | 800×400 | 2 |
| Side banners (Stationery, Gifts) | 600×420 | — | 2 |
| Banner pair (Toys & Games, Character Costumes) | 900×520 | — | 2 |
| Promo tiles (Deals, Gift Ideas, Web Exclusive) | 600×480 | — | 3 |
| Category circles (Admin → Categories, per category) | 300×300 | — | 10 |
| App banner (only if an app exists) | 1920×600 | 800×600 | 1 |
| Logo (Settings → Store Info) | ~400×110, PNG or SVG | — | 1 |
| Product photos (Admin → Products) | square, ≥ 800×800 | — | all products |
Every image needs alt text (the admin requires it). Until uploaded, placeholders in the store colours are shown.

## Settings the client must fill in
- **Store Info:** real phone (live value is the placeholder `+92 300 0000000`), email, address, logo URL; confirm the store name (live: "Jahangir's Sons").
- **SEO & Email:** meta title / description (live title still says "…A Complete Family Store, Lahore Since 1968").
- **Header & Footer:** colour preset (Brand / Teal), announcement messages, phone hours, WhatsApp number / hours / pre-filled message, social links, app links (optional), newsletter text, "powered by" (optional), store pickup (keep off, see below).
- **Netlify:** `SITE_URL` / `VITE_SITE_URL` (canonical links, sitemap, JSON-LD).
- **Content:** FAQ page wording (still mentions Stripe / card payments), Returns / Terms / Privacy / About.

## Blocked / needs a decision
1. **Reference design image** — not received; needed for a true pixel comparison.
2. **Performance ≥ 85** — not reached locally (63–69); measure on the deployed site, then trim the shared bundle (see 5.3).
3. **Store pickup** — the picker supports it, but checkout still charges delivery. Decide: support pickup orders, or stay delivery-only (pickup switch is off by default).
4. **Old banners** — the `banners` table and "Banners (old)" admin page are kept until you confirm they can be removed.
5. **Wishlist icon in the header** — kept although the spec lists account + cart only.
6. **"Web Exclusive" tile** — links to /shop; there's no web-exclusive tag yet.
7. **Product compare-at price** — products use regular price + sale price (no separate compare-at column); variants have compare-at. Confirm this is fine.

## Migrations (new, in order; none applied)
| # | File | What it does |
|---|---|---|
| 1 | `20260928100000_variant_compare_at_price.sql` | `product_variants.compare_at_price` (≥ 0, display only). Idempotent. |
| 2 | `20260928110000_catalog_search_on_sale.sql` | `product_on_sale()`; `catalog_search` gains `only = 'on_sale'` and returns `variant_was_max`. Otherwise identical to the Phase D version (generated from it). Needs #1. |
| 3 | `20260928110100_site_chrome_settings.sql` | `store_settings`: theme preset, announcements (+ interval, on/off), phone / WhatsApp hours, WhatsApp number / message, social links, app links, newsletter text, "powered by", pickup. `profiles`: delivery method / city / zone. Constraints; seeds a "Welcome to …" message. |
| 4 | `20260928120000_homepage_sections.sql` | `homepage_sections` + RLS + checks; copies existing banners in once (banners table kept). |
| 5 | `20260928130000_homepage_default_sections.sql` | The 13 default sections (reference order), idempotent; skips the default hero if one exists. Needs #4. |
