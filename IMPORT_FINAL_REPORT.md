# Bulk importer — final report

Date: 2026-10-09 · Branch: `main` (uncommitted) · Audit: `IMPORT_AUDIT.md` · Progress log: `IMPORT_FIX_PROGRESS.md`

## 1. Result

The admin bulk uploader has been rebuilt.
- **Files:** it reads Excel (.xlsx / .xls) and CSV.
- **Preview:** every row of every category is checked before anything is saved.
- **Writing:** rows are saved in transactional batches of 100, with progress and cancel.
- **Updates:** they never erase data that isn't in the sheet.
- **Round trip:** the downloadable template and the export use the same format, so export → edit → re-import works with zero errors.

| Check | Result |
|---|---|
| `npm run typecheck` | ✅ |
| `npm test` | ✅ 42 files / 246 tests. Was 32 / 144: 5 old row-validator tests were removed and 107 added |
| `npm run build` | ✅ ExcelJS (916 KB) and SheetJS (384 KB) are separate chunks, loaded only when the admin opens the import dialog |
| `npm run lint` | Import files: ✅ clean. Repo-wide: ❌ still failing, as it was before this work (mostly CRLF / prettier). Now 13,979 problems vs ~15.6k before; no new errors in edited files |
| Migrations applied to production | **No** (as required) |
| Real product data touched | **No.** Every DB test runs on an in-memory PGlite copy of all migrations |

## 2. Every bug found and how it was fixed

| # | Bug (from the audit) | Fix |
|---|---|---|
| E1 | Excel files not accepted (CSV-only picker + papaparse) | `read-workbook.ts`: SheetJS reads .xlsx/.xls/.xlsm/.ods/.csv. It uses the "Products" / "Variants" sheet or the first visible one, skips hidden sheets, fills merged cells, finds the header row under a title row, and has a 15 MB / 5,000-row limit |
| E2 | `9.78E+12` ISBN blocked the whole file with "isbn format is invalid" | Cells are read as the stored value, so .xlsx numbers keep every digit. CSV values already destroyed by Excel get a row-level error with the fix ("format the column as Text…"). Errors no longer block the other rows |
| E3 | SKU `9.78E+12` / lost leading zeros saved silently | The same scientific-notation error applies to SKU and barcode. Template and export format the code columns as Text; the leading zero of `00123` is kept (tested) |
| E4 | `duplicate key … products_sku_key` stopped the import halfway | SKUs are checked inside the file (every row involved is told which other rows) and against the database before writing. Writes are one transaction per batch; a failing batch rolls back fully and the row is reported in plain English |
| E5 | Partial sheet erased description, SKU, cost, images, attributes and re-activated drafts | Patch semantics in the validator and in `import_products_batch`: a missing column or blank cell = unchanged, `CLEAR` = empty. Attributes are merged |
| E6 | `Rs. 1,250`, NBSP numbers rejected | `parseNumber` strips Rs / PKR / ₨ / commas / spaces / `/-` |
| E7 | `Category` header or category names rejected | Header alias map; categories accepted by slug, name or "Parent > Child" (any case), with "did you mean" suggestions. Optional admin-only "Create missing categories" (off by default) |
| E8 | Unknown columns (`Sale Price`, `Stock`, `Image URL`, multi-line headers) silently ignored | Headers are normalised (case, spaces, `_`, line breaks) and matched against aliases and attribute labels (`Color` = colour). Anything still unknown is listed as a file warning |
| E9 | Excel date numbers and `10/9/2026` rejected | `parseDate`: ISO, Excel serials, day-first slash dates (warns when ambiguous), "9 Oct 2026" |
| E10 | `Active`, `#N/A` → silently "no" (product hidden) | `parseBool` accepts yes/no/true/false/1/0/active/draft…; anything else is an error. Excel error cells are reported as such |
| E11 | `umera ahmed` created a duplicate author; `adult` rejected | Options are matched case-insensitively to the stored value, on the client and in the database function |
| E12 | Urdu-only names → "slug is required" | Slug falls back to the SKU, then a stable `item-xxxxxxx`, with a warning |
| E13 | Image links split on commas | `|`, new lines or `;` separate links; a comma only splits when another `http` follows |
| E14 | Gift-bag colour missing from template/export → erased on round trip | Attribute columns are chosen per category usage, plus any stored key, so `attr_colour` is exported |
| E15 | Exported variants of SKU-less products: "product not found" | `product_sku` blank → `product_slug` is used (tested on the export) |
| E16 | Export rejected on re-import (no category, sale ≥ price, odd ISBN, old attributes) | Unchanged stored values are never re-validated; sale ≥ price and odd ISBNs are warnings; blank categories = unchanged |
| E17 | Error row numbers wrong after blank lines | Row numbers are the sheet's own row numbers (tested with a blank row) |
| E18 | Long `?slug=in.(…)` URLs failed above a few hundred rows, and the errors were ignored | Lookups are POST RPCs (`import_lookup_products` / `_variants`) and every error is raised |
| E19 | One request for the whole file, ~3,000 round trips → serverless timeout | Browser sends batches of ≤100 rows / ~900 KB; each batch is one RPC call. 1,000 rows ≈ 2 s on PGlite (slowest batch 315 ms) |
| E20 | Variant SKU used by another product → crash mid-import | Checked up front with a clear message; transaction rollback if it happens anyway |
| E21 | Dead `adminBulkUpsertProducts` (would hit the cost_price grant, 42501) | Removed, together with `adminExportProducts`, the old CSV modal and the old row validators |
| E22 | Product descriptions rendered **unsanitised during SSR** | `ProductDescription`: the server render shows plain text; the browser shows DOMPurify-sanitised HTML. Unsafe HTML in an import is also flagged |
| E23 | Unchecked delete result | Category replacement happens inside the RPC transaction |
| E24 | New attribute options written before rows; kept on failure | Options are added inside the same transaction (rolled back with the batch, tested) |

Found and fixed while building / testing:
- Matching by ISBN re-wrote the ISBN without its hyphens. Now the stored formatting is kept when the digits are the same (E2E test S3).
- Two products sharing an ISBN made an export fail to re-import. Auto matching now falls through to the slug.
- A deactivated option stored on a product or variant failed re-import. Stored values are now accepted as they are.
- `;`-separated CSVs (Excel in some locales) weren't detected. The delimiter is now guessed from the header line.

## 3. Migrations (in order)

1. `supabase/migrations/20261009100000_bulk_import.sql`. It **adds** functions and one index only; no table, RLS or grant changes:
   - `import_lookup_products(jsonb)`, `import_lookup_variants(jsonb)`: staff-only lookups
   - `import_products_batch(jsonb, jsonb)`, `import_variants_batch(jsonb, jsonb)`: staff-only, one transaction per call, ≤200 rows, failed rows returned in the error detail, never return `cost_price`
   - private helpers `_import_assert_staff()`, `_import_add_options(jsonb)`
   - index `products_isbn_norm_idx` (ISBN matching ignores hyphens)

   Execute is revoked from `PUBLIC` / `anon`. Each function checks `has_role(auth.uid(), admin|manager)` itself. They run as SECURITY DEFINER, so staff can write `cost_price` without the service-role key; the `cost_price` column grant is unchanged (tested: anon and customers still get "permission denied").

**Deploy steps:**
1. Apply the migration on a staging or branch database.
2. Click through the test plan in §5.
3. Apply the migration to production.
4. Deploy the app.
5. Optionally regenerate `src/integrations/supabase/types.ts`. The four RPC signatures were added by hand because types can only be generated after the migration exists in a database.

New dependencies:
- `xlsx` 0.20.3 from cdn.sheetjs.com. The npm `xlsx@0.18.5` has unfixed CVEs.
- `exceljs` 4.4.0. `npm audit` shows a moderate advisory through `uuid@8`; it only affects `v3/v5/v6` with a `buf` argument, which ExcelJS doesn't use.

## 4. Tests

| Suite | What it proves |
|---|---|
| `src/lib/import/coerce.test.ts` | Rs/commas/NBSP, scientific-notation ISBN/SKU, leading-zero SKU, Urdu text, booleans, ISO/serial/day-first dates, Excel errors, `???` / `�` detection |
| `headers.test.ts` | Case/space/line-break headers, aliases (`Category`, `Stock`, `Image URL`, `Barcode`), `attr_`/label/`Color` columns, ambiguous `Size` |
| `read-workbook.test.ts` | BOM CSV, Windows-1252, UTF-16, `;` CSV, numeric ISBN in .xlsx, date-formatted cells, merged cells, title row, hidden sheets, .xls, empty rows keep Excel row numbers |
| `validate-products.test.ts` | Unknown category + suggestion, invalid option, missing required attribute, duplicate SKU (both rows named), pack defaults (6 / 12), multi-category with primary, CLEAR, stock-only update, match key rules, compare_at_price |
| `validate-variants.test.ts` | Options, upsert by variant SKU or options, slug fallback, parent in the same file, duplicates |
| `round-trip.test.ts` | Real .xlsx export → read → 0 errors, nothing changes; template structure; error report layout |
| `run-import.test.ts` | Batching, valid-only retry, fix-first stop, cancel, image warnings keep old images, Drive/Dropbox links, SSRF address list |
| `fetch-image.test.ts` | Private IPs / localhost / redirect-to-localhost refused without a request, HTML instead of image, 4 MB cap |
| `supabase/tests/bulk-import.test.mjs` | Permissions (anon, customer), **1,000 rows** (800 new + 200 updates), untouched columns kept, categories replaced, **failed batch rolls back** (incl. options), variants, **cost_price still hidden**, export → re-import 0 errors |
| `supabase/tests/bulk-import-e2e.test.mjs` | The dialog's full pipeline from file bytes to database with 4 **synthetic** sample files: a filled-in template (Products + Variants, examples left in, Urdu, images), an ANSI CSV with Excel damage, a messy workbook (title row, merged cells, hidden sheet, `Color`, numeric ISBN), and export → edit stock → re-import (only that stock changes) |

## 5. Not done yet

- **The real `/import-samples` files were never provided** (3.4). The synthetic samples in the E2E test reproduce every failure from the audit. Drop the real files into `/import-samples` and they can be run through the same pipeline.
- **No click-through in a browser** (3.3b). There is no Docker (so no local Supabase), and creating a Supabase branch is a billed action that needs your go-ahead. The React dialog is typechecked and built; everything below it is tested end to end. Manual test plan on staging:
  1. Download the template → upload unchanged → all example rows "Skip".
  2. Export → change some stock → upload → "Update (by SKU)", no errors → import → only stock changed.
  3. A file with a wrong category, `adult`, a duplicate SKU and `9.78E+12` → clear row errors → download the error report → fix → upload the report.
  4. A Google Drive link and a broken link → one copied, one warning, old image kept.
  5. As a manager: "Create missing categories" is greyed out. As an admin: the summary links to the Activity Log.
- **Limits by design:**
  - Images over 4 MB are refused with a message (it has to fit in one serverless response).
  - The SSRF check resolves DNS before fetching, so a DNS-rebinding race is theoretically possible. Only staff can trigger downloads.
  - The activity log is admin-only (existing RLS), so managers don't see the import entries.

---

## 6. How to bulk upload products (guide for the shop admin)

**Where:** Admin → Products → **Bulk import / export**.

### Step 1 — Get the file
- **New products:** click **Download template**. You get an Excel file with three sheets:
  - **Products**: one row per product.
  - **Variants**: sizes and colours, e.g. costumes.
  - **Instructions**: every column explained, the category list, and the allowed values.
- **Changing existing products:** click **Export all products**. You get the same kind of file, already filled with your products.

### Step 2 — Fill it in
- One product per row. The grey **EXAMPLE** rows are skipped automatically; you can delete them.
- **New products need:** `name`, `categories` and `price`. Everything else is optional.
- **categories:** use the slugs from the Instructions sheet, e.g. `gift-bags`. For more than one, separate them with `|`. The **first one is the main category**: `books|novels`.
- **Prices** are in rupees. `1250` is best; `Rs. 1,250` also works.
- **Packs** (Gift Wrapping Sheets = pack of 6, Money Folders = pack of 12): the price is for **one pack**, and stock counts **packs**. The pack size fills in by itself.
- **Sizes and colours** (costumes): put the product in the Products sheet. Then add one row per size + colour in the Variants sheet, with the product's SKU in `product_sku`.
- **Images:** paste links separated by `|`; the first one is the main photo. Google Drive / Dropbox links work if the file is shared with "Anyone with the link".

### Step 3 — Changing products
- Fill in only what you want to change. **An empty cell changes nothing.**
- To remove a value (for example a sale price), type **CLEAR** in the cell.
- Products are found by **SKU** first, then ISBN, then the slug.

### Step 4 — Upload and check
1. Choose your file. Nothing is saved yet.
2. The preview shows every row: **green** = OK, **yellow** = warning (it will import, but have a look), **red** = error (it will not import).
3. Choose **Import the valid rows now**, or **Fix the errors first**.
4. Click **Import**. Keep the window open until it says **Import finished**.

### Common mistakes
- **ISBN shows as 9.78E+12:** Excel changed the number. Keep the ISBN / SKU columns formatted as **Text** (the template already does this) and type the number again.
- **Urdu turns into ????:** don't save as plain CSV. Upload the **.xlsx** file, or use *Save As → CSV UTF-8*.
- **"Unknown category":** copy the slug exactly from the Instructions sheet. The message suggests the closest one.
- **"is not an allowed …":** use one of the values listed in the Instructions sheet.
- **Pack prices:** enter the price of the whole pack, not one sheet.

### Reading the error report
Click **Error report (.xlsx)**. It contains **only the rows that had problems**, exactly as you uploaded them.
- The `errors` column at the end says what is wrong; the wrong cell is coloured red.
- The `row in your file` column tells you where the row came from.

Fix the cells, then upload this report file. Rows that were already imported are not needed again.
