# Bulk importer audit — SchoolBooksExperts

Date: 2026-10-09 · Branch: `main` @ `fd37788` · Phase 1 (report only — no code changed)

## 0. Summary

The importer is **CSV-only**, but the admins work in **Excel**. Most of the errors they see come from that gap:

1. **Excel files are not accepted.** The file picker allows only `.csv` (`CatalogImportModal.tsx:128`), and `papaparse` cannot read `.xlsx`/`.xls`.
2. **Excel mangles the CSV.**
   - 13-digit ISBNs are saved as `9.78097E+12`. A single such cell fails the whole import (it is all-or-nothing).
   - SKUs are mangled **silently**: `9.78097E+12` and lost leading zeros are written to the database.
   - Urdu names become `????` when Excel saves as ANSI.
   - Dates are saved as `10/9/2026` or a serial number.
   - Prices get typed as `Rs. 1,250`.
3. **The upsert is not safe for real catalogs.**
   - It runs one HTTP call per row, with no transaction. Any database error (for example a duplicate SKU) stops the import halfway, after earlier rows are already written.
   - Large files will also exceed the serverless time limit partway through.
4. **Updates destroy data.** Every column missing from the sheet is written as `null`, `[]` or `{}`. A "stock-only" sheet erases description, SKU, ISBN, cost price, images and attributes, and re-activates draft products (reproduced, D2).
5. **Export → re-import does not round-trip.**
   - Gift-bag colours are never exported, so a re-import erases them.
   - Products without a SKU cannot be re-imported in the variants file.
   - Products with no category, or with stored attributes outside their category, are rejected.

There is no `/import-samples` folder in the repo. I reproduced the issues by feeding realistic rows (the template row, export-shaped rows, and Excel-mangled values) through the **real** validator. I also replayed the importer's exact write calls against the PGlite copy of all migrations. No real data was touched.

## 1. Import flow map

| Step | File · function | Notes |
|---|---|---|
| Admin page | `src/routes/_admin/admin.products.tsx` — "Import / Export CSV" button (l.222-225) opens `CatalogImportModal` (l.311) | Also imports the **unused** `adminBulkUpsertProducts` and `adminExportProducts` (l.20, 111-112) |
| Modal / UI | `src/components/admin/CatalogImportModal.tsx` — `CatalogImportModal`, `ImportPanel` (products and variants tabs) | Single dialog: template, export, upload, report |
| File picker | `CatalogImportModal.tsx:128` `<input accept=".csv,text/csv">` | No `.xlsx`/`.xls` |
| Parser | `papaparse@5.5.3` (`CatalogImportModal.tsx:68-77`): `header:true`, `skipEmptyLines:"greedy"`, `transformHeader: trim+lowercase` | No xlsx library is installed. Client caps the file at 1,000 rows (l.72) |
| Column mapping | `src/lib/catalog-import.ts:84` (lowercase/trim keys); legacy `author`/`publisher` → `attr_*` (l.143-144); `category_slug` alias (l.93) | No alias map; unknown columns are silently ignored |
| Validation | `catalog-import.ts` `validateProductRow` (l.82-157), `validateVariantRow` (l.172-204), `effectiveAttributesFor` (l.25-46); `src/lib/attributes.ts` `validateProductAttributes` / `validateVariantOptions` | Hand-written checks, plus Zod only for attribute values |
| Server functions | `src/lib/catalog-admin.functions.ts` `adminImportProducts` (l.311-347), `adminImportVariants` (l.350-401), `loadCatalogContext` (l.15-29), `addNewOptions` (l.31-41) | Staff-checked (`assertStaff`). `dryRun` is the same call with a flag |
| DB writes | Products: `supabaseAdmin.from("products").upsert(record,{onConflict:"slug"}).select("id")` per row (l.332). Then `product_categories` upsert of the extra categories (l.337) and delete of the others (l.342). Variants: `supabase.from("product_variants").update/insert` per row (l.394). New attribute options: `attribute_definitions.update` (l.37) | No transaction, no batching, no RPC |
| Triggers fired per row | `products_updated_at`, `trg_products_attribute_mirror`, `trg_products_category_sync`; on `product_categories`: `trg_product_categories_single_primary`, `trg_product_categories_sync` (D6) | All light, single-row work. `sales_count` and search are **not** recomputed on product writes (OK) |
| Images | None. URLs from the `images` cell are stored as-is (hot-linked). The only compression pipeline is browser-side (`src/lib/image-upload.ts`) and is used by the product form | — |
| Error display | Table of row / slug / action / problems, plus a CSV "Error report" (row, slug, errors only) (`CatalogImportModal.tsx:132-166`). Server exceptions become a single toast (l.84, 96) | — |
| Template | Built in the browser from `useCatalog()` definitions (`CatalogImportModal.tsx:55-62, 113`). CSV, one example row (gift wrap) | — |
| Export | `adminExportCatalogProducts` (l.404-436, service role, all products in memory) and `adminExportVariants` (l.438-458). CSV with BOM, built in the browser | — |
| Activity log | `logActivity(..., "csv_import", ..., { count })` once per import (l.345, 399) | No file name, no created/updated split |
| Dead code | `admin.functions.ts` `adminBulkUpsertProducts` (l.321-362) and `adminExportProducts` (l.364-386) — the old single-category importer | `adminBulkUpsertProducts` would fail anyway: its user-client upsert hits the `cost_price` column grant (42501, see D5) |

## 2. Errors found (reproduced)

Repro scripts: `audit-repro.test.ts` (validator) and `audit-repro-db.test.mjs` (PGlite). Both ran once from inside the repo and were deleted afterwards.

| # | Exact message / observed behaviour | Cause | Where | Severity |
|---|---|---|---|---|
| E1 | `.xlsx` cannot be chosen. If forced through "All files", papaparse reads the zip as text and every row fails | CSV-only picker and parser | `CatalogImportModal.tsx:68, 128` | **Critical** |
| E2 | `isbn format is invalid` for `9.78097E+12` (one bad cell blocks the entire file) | Excel scientific notation; the error doesn't say how to fix it | `catalog-import.ts:128` | **Critical** |
| E3 | SKU `9.78097E+12` or `123` (was `00123`) **accepted silently** and overwrites the real SKU | No scientific-notation or leading-zero guard on SKU | `catalog-import.ts:108` | **High** (data corruption) |
| E4 | `duplicate key value violates unique constraint "products_sku_key"` (23505, `Key (sku)=(SKU-1) already exists.`). Rows before the failure **stay written** (`row-2`, `row-3` persisted) | No in-file or in-DB SKU check; per-row writes with no transaction | `catalog-admin.functions.ts:319-321, 331-333` | **Critical** |
| E5 | Partial sheet (slug, name, categories, price, stock) → description, sku, isbn, brand, sale_price, cost_price, attributes and images set to null/empty; `is_active` set back to true | The record always includes every column | `catalog-import.ts:105-125, 153`; D2 | **Critical** (data loss) |
| E6 | `price must be a number ≥ 0` for `Rs. 1,250` and `1 250` (NBSP) | `num()` only strips commas | `catalog-import.ts:61` | High |
| E7 | `categories is required…` when the header is `Category` / `category`; `unknown category "Gift Bags"` when a name is used | No header aliases; slug-only lookup; no suggestions | `catalog-import.ts:92-100` | High |
| E8 | Columns such as `Sale Price`, `Stock`, `Image URL`, or a header with a line break, are **silently ignored** | Headers normalised only by trim+lowercase; unknown columns are not reported | `CatalogImportModal.tsx:69`, `catalog-import.ts:84` | High |
| E9 | `new_arrival_until must be YYYY-MM-DD` for `45939` / `10/9/2026` | No Excel serial or locale date parsing | `catalog-import.ts:121, 126` | Medium |
| E10 | `is_active` = `Active`, `#N/A`, `Y es` → **silently false** (product hidden) | `bool()` treats anything unknown as false | `catalog-import.ts:68-71` | High |
| E11 | `umera ahmed` → new **duplicate** author option; `adult` → `"adult" is not an allowed option` | Case-sensitive option match | `attributes.ts:95, 131` | Medium |
| E12 | `slug is required` for Urdu-only names | ASCII-only `slugify` | `catalog-import.ts:58, 87` | Medium |
| E13 | `image URLs must start with http(s)://` for a Cloudinary URL with `w_400,h_400` | `images` and `tags` are split on `,` as well as `|` | `catalog-import.ts:72, 123` | Medium |
| E14 | Gift-bag `colour` is not in the template or export (`attr_colour in template? false`). Export → import **erases** it | Columns filtered on the global `attribute_definitions.is_variant_axis`, but `colour` is a *product* attribute for gift-bags | `CatalogImportModal.tsx:58`; `catalog-admin.functions.ts:419` | **High** (data loss on round trip) |
| E15 | Variants file from Export: `product "spiderman-costume" not found` for every product without a SKU | Server uses `raw.product_sku ?? raw.product_slug`. An empty string is not nullish, so the slug is never tried | `catalog-admin.functions.ts:357, 375` | **High** |
| E16 | Export → re-import rejects: products with no category (`categories is required`), `sale_price >= price`, stored attributes outside the category (`"author" is not an attribute…`), ISBNs with spaces | The validator is stricter than the product form and the database | `catalog-import.ts:100, 127-128`; `attributes.ts:76` | High |
| E17 | Error row numbers are wrong after blank lines (Excel row 4 reported as row 3) | `skipEmptyLines:"greedy"` drops rows, then the server numbers them `i+2` | `CatalogImportModal.tsx:69`; `catalog-admin.functions.ts:318` | Medium |
| E18 | Lookup URL is 12.5 KB for 250 slugs and 50 KB for 1,000. Over the gateway's URL limit this returns 414/400, and the **error is ignored**: the preview shows every row as "create", and the variant import shows every row as "product not found" | `.in("slug", slugs)` as a GET query | `catalog-admin.functions.ts:322, 358-361, 368-371` | High (large files) |
| E19 | One server call holds the whole file (up to 1,000 rows), with 2–3 sequential Supabase calls per row (~2,000–3,000 round trips). That exceeds Netlify's synchronous function limit (10 s default, 26 s max), so the client gets a 502/504 with the import **half done** | No batching or progress; no transaction | `catalog-admin.functions.ts:331-344`, `CatalogImportModal.tsx:92` | **Critical** (large files) |
| E20 | `product_variants_sku_key` 23505 when a variant SKU exists on another product. Earlier variants are already written | No global variant-SKU check; no transaction | `catalog-admin.functions.ts:392-397`; D4 | High |
| E21 | Staff-client `insert … returning *` / `upsert` including `cost_price` → `permission denied for table products` (42501) | Column-level SELECT grant (audit fix 1.3). The current importer avoids it by using the service role, but the dead `adminBulkUpsertProducts` would hit it | `admin.functions.ts:357`; D5 | Low (dead code) — rules out the "user-client upsert" design |
| E22 | Descriptions are not sanitised on import, and the product page renders them **unsanitised during SSR** (`DOMPurify.isSupported` is false on the server) | Sanitising only works in the browser | `product.$slug.tsx:307` | **High** (stored XSS reachable through the import) |
| E23 | The `product_categories` delete result is not checked | Missing error check | `catalog-admin.functions.ts:342` | Low |
| E24 | New attribute options are written **before** the product rows. If the import then fails, the options stay | Ordering; no transaction | `catalog-admin.functions.ts:329, 390` | Low |

Working correctly (verified): staff check before any read or write, and server-side re-validation of every row. Multi-category with primary-first (D3: links `gifts` primary and `gift-bags` extra; `products.category_id` follows). Inherited category attributes. Pack defaults (Gift Wrapping 6 sheets, Money Folders 12). The `cost_price` grant itself. One activity-log row per import.

## 3. Risk-area table

### File & parsing
| Area | Status | Evidence |
|---|---|---|
| .xlsx / .xls / .csv accepted | **BROKEN** | CSV only (E1) |
| Sheet selection, hidden sheets, merged cells | **BROKEN** | No workbook support at all |
| Empty trailing rows/columns | OK / RISK | Empty rows are skipped, but row numbers shift (E17) |
| UTF-8 BOM | OK | papaparse plus `trim()` strip the BOM (R2 parsed headers clean) |
| Urdu text in a UTF-8 CSV | OK | Values pass through. Slug generation fails (E12) |
| Windows-1252 / ANSI CSV from Excel | **BROKEN** | Read as UTF-8: Urdu arrives as `????` and accents as U+FFFD, both **silently imported** |
| Header case / spaces | RISK | Case and outer spaces are handled; inner spaces and line breaks are not, and unmatched columns are silently dropped (E8) |
| Old column names (category, sale price, image_url_1..3) | RISK | Only `category_slug`, `author`, `publisher` and `image_url_1..3` are recognised (E7) |
| Numbers as text and vice versa | OK | Everything arrives as strings from the CSV |
| "Rs. 1,250", NBSP | **BROKEN** | E6 |
| ISBN/SKU scientific notation, leading zeros | **BROKEN** | E2, E3 |
| Excel date serials | **BROKEN** | E9 |
| TRUE/FALSE, yes/no, 1/0 | RISK | Accepted, but unknown values become false silently (E10) |
| Formulas, #N/A, #REF! | RISK | `#REF!` in a number column fails with a generic message; in a boolean it becomes false silently |
| Non-breaking spaces | RISK | Stripped at the ends only; inside numbers they cause a failure |
| Body size / row limit / timeouts / memory | **BROKEN** | 1,000 rows in one request; E18, E19. The export loads the whole catalog into one response |

### Schema mismatch
| Area | Status | Evidence |
|---|---|---|
| product_categories join with is_primary | OK | Primary goes through `category_id` plus the sync trigger, extras are upserted, others deleted (D3) |
| Category resolution | RISK | Slug only; no name match, no suggestions (E7). Parent and child together works. `|` separator works, `,` is also accepted |
| attr_<key> → attributes jsonb, validated against definitions | RISK | Validated, including inherited attributes. Matching is case-sensitive (E11), and the sheet **replaces** all attributes (E5) |
| Select options, number types, required | OK / RISK | Correct apart from case. Number attributes reject "1,000" |
| sell_unit / pack_size defaults | OK | R1, R15 |
| compare_at_price (products) | N/A — **decision needed** | `products` has no such column by design: `price` = regular, `sale_price` = discounted (`20260928100000…sql` header). Variants do have `compare_at_price`, but the variants importer ignores it |
| weight, is_new_arrival, new_arrival_until, is_active, stock | RISK | `weight_grams` only (no `weight` alias); E9, E10 |
| Variants file (product_sku key) | **BROKEN** | E15, E18, E20. Case-sensitive options; `compare_at_price` missing |
| Removed / NOT NULL columns | OK | D8: NOT NULL without default = `name`, `slug`, `price` only; the importer doesn't write school/bundle columns |
| Generated Supabase types | OK | `types.ts` has `product_categories`, `attributes`, `sell_unit`, variant `compare_at_price`. The `any` casts in the import path are unnecessary, not caused by stale types |

### Database / permissions
| Area | Status | Evidence |
|---|---|---|
| RLS / cost_price grant vs admin writes | OK (current) / RISK | The importer uses the service role after `assertStaff`. Any user-client upsert or `returning *` fails with 42501 (D5) |
| Upsert key | RISK | Slug only. Changing a name with no slug column creates a **new** product, which then hits the SKU constraint |
| Duplicates in file | RISK | Slug checked; SKU not checked (E4) |
| Duplicates vs DB | **BROKEN** | E4, E20 |
| Triggers per row | OK | 3 light triggers on products and 2 on product_categories (D6) |
| Partial imports / transactions | **BROKEN** | D1: rows 2–3 persisted after row 4 failed |

### Images
| Area | Status | Evidence |
|---|---|---|
| Download to Storage | **BROKEN** (missing) | URLs are hot-linked |
| Drive/Dropbox links, 404, wrong type, huge images | **BROKEN** | Stored as-is (R11b) → broken images on the storefront |
| Multiple images, order | RISK | `|` works and order is kept, but `,` also splits (E13) |

### UX & error reporting
| Area | Status | Evidence |
|---|---|---|
| Dry-run preview | OK | Server dry-run with a per-row table |
| Errors per row **and column** | RISK | Per row with joined text; no column/value fields; row numbers can be off (E17); server exceptions arrive as one toast |
| "Import valid rows only" | Missing | All-or-nothing only |
| Progress / cancel | Missing | One request |
| Template in sync | **BROKEN** | CSV, no text-formatted ISBN/SKU, misses gift-bag `colour` (E14), one example row only |
| Export round trip | **BROKEN** | E14, E15, E16 |
| Urdu names / long descriptions | RISK | E12; Excel cells truncate at 32,767 chars |
| HTML sanitising | **BROKEN** | E22 |

## 4. Baseline (before any fix)

- `npm run typecheck` ✅
- `npm test` ✅ 32 files / 144 tests
- `npm run lint` ❌ **already failing repo-wide**: ~15.6k `prettier/prettier` errors (mostly CRLF line endings from the Windows checkout, `core.autocrlf=true`) and 241 `no-explicit-any`. During the fix I'll keep the new and changed import files lint-clean and report lint for those files; repo-wide reformatting is out of scope unless you want it.

## 5. Decisions needed before Phase 2

1. **Blank cells on update.** I propose: a column missing from the sheet → value untouched. A blank cell → value untouched. To clear a value, type `CLEAR` (exports never produce blanks that matter). The alternative, "blank = clear", is closer to a "full sync" but riskier for staff.
2. **Spreadsheet library.**
   - Recommended: **SheetJS CE 0.20.3** (from cdn.sheetjs.com, pinned; the npm `xlsx@0.18.5` has two unfixed CVEs) to read .xlsx/.xls/.csv as raw strings, plus **ExcelJS 4.4** to write the template, export and error report. ExcelJS can do Text-formatted ISBN/SKU columns and dropdowns; SheetJS CE can't.
   - Both are lazy-loaded on the admin import screen only, so storefront bundles are unaffected.
3. **Images.** Server-side `sharp` compression adds a native dependency to the Netlify function. Recommended instead: after products are saved, the browser asks a staff-checked server function to fetch each URL (15 s timeout, 10 MB cap, content-type check, Drive/Dropbox rewrite). The browser then compresses it with the **existing** `compressImage` (WebP, 1200 px) and uploads via the existing signed-upload flow. This reuses the current pipeline exactly, with no native dependency.
4. **`compare_at_price` for products.** Proposal: no new column (keeps the previous decision). Accept a `compare_at_price` column with Shopify meaning: if it is set and higher than `price`, then `price ← compare_at_price` and `sale_price ← price`. Export keeps `price` and `sale_price`. The other option is to only reject the column with a helpful message.
5. **Match key.** Proposal: SKU first, then ISBN (books), then slug. The key is shown per row in the preview ("update — matched by SKU").

## 6. Fix plan (in order)

1. **`src/lib/import/` pure module**
   - `read-workbook.ts`: xlsx/xls/csv. Reads the "Products"/"Variants" sheet or the first visible one. Raw strings only, `raw:false` disabled, encoding detection with a UTF-8 → Windows-1252 fallback, and a warning on `????`/U+FFFD.
   - `headers.ts`: normalise headers and apply the alias map.
   - `coerce.ts`: prices, booleans with errors on unknowns, ISO/serial/dd-mm-yyyy dates, scientific-notation guard for ISBN/SKU/barcode, NBSP, `#N/A`/`#REF!`, `CLEAR`.
   - Unit-tested.
2. **Validation** (`src/lib/import/validate-products.ts`, `validate-variants.ts`)
   - Dynamic per-row Zod built from effective attributes, with case-insensitive option matching to the stored value.
   - Categories by slug **or** name, with "did you mean" suggestions and a "Create missing categories" toggle (admin only, off by default).
   - Pack defaults.
   - Duplicate SKU/slug/ISBN detection inside the file and against the DB.
   - Errors and warnings with row, column, value and message. A Urdu-safe slug fallback.
   - Shared by the browser preview and the server.
3. **Migration `20261009100000_import_products_batch.sql`**
   - `import_products_batch(p_rows jsonb, p_options jsonb)` and `import_variants_batch(...)`: SECURITY DEFINER, `has_role` staff check inside, `revoke` from anon/public.
   - One transaction per call. Per-row savepoint errors are collected, and the whole batch rolls back if any row fails.
   - Updates only the provided keys; replaces the categories of updated products; merges attributes.
   - Returns `{row, id, action}` only (no `cost_price`).
   - Plus `import_lookup(jsonb)`, a POST RPC that removes the URL-length problem.
4. **Server functions** `src/lib/import/import.functions.ts`: `importPreview`, `importBatch` (≤100 rows, re-validates on the server), `importFinish` (one activity-log entry with file name and counts), `fetchImportImage`.
5. **UI rebuild**
   - Upload → Preview (green/yellow/red, new/update counts, match key) → Import, with "valid rows only" or "fix first".
   - Progress bar, cancel between batches, final summary with a link to the activity log, and an `.xlsx` error report (original rows plus an `errors` column).
6. **Variants**: a "Variants" sheet in the same workbook or a separate file. Fixes E15/E20, adds `compare_at_price`, case-insensitive options, and parents created in the same file.
7. **Images** step after the rows are saved (decision 3).
8. **Template & export** (.xlsx)
   - Products, Variants and Instructions sheets, generated from live categories and attributes; per-category attribute columns (fixes E14); Text-formatted ISBN/SKU/barcode; dropdowns.
   - Export uses the same headers, so the round trip is clean.
9. **Sanitising**: sanitise descriptions server-side on import with an allowlist, and fix the SSR fallback at `product.$slug.tsx:307` (E22).
10. **Clean-up**: delete `adminBulkUpsertProducts`/`adminExportProducts`, the old modal and the old `validateProductRow` path (keeping `variantCombinations`/`comboKey`/`effectiveAttributesFor`, which the product form uses). Regenerate types and remove the `any` casts in the import path.
