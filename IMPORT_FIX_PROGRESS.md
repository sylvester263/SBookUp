# Bulk importer fix — progress

Marks: `[x]` done · `[~]` in progress · `[!]` blocked / needs a decision · `[ ]` not started.
Resume from the first item that is not `[x]`.

## Phase 1 — Audit (report only)

- [x] 1.1 Map the import flow end to end (files + functions)
- [x] 1.2 Reproduce (no `/import-samples` folder in the repo → reproduced with template rows, export-shaped rows, Excel-mangled values, and the importer's write sequence on the PGlite test database; temp repro files removed)
- [x] 1.3 Risk-area table (OK / BROKEN / RISK with evidence)
- [x] 1.4 Write IMPORT_AUDIT.md (errors, risk table, fix plan)
- [x] STOP — user replied "continue" (2026-10-09) with no changes → all 5 recommendations in IMPORT_AUDIT.md §5 accepted:
  1. missing column / blank cell = unchanged on update; `CLEAR` empties a value
  2. SheetJS CE 0.20.3 (read) + ExcelJS 4.4 (write), lazy-loaded on the admin import screen only
  3. images: server fetches (timeout/size/type/SSRF checks, Drive/Dropbox rewrite) → browser compresses with the existing pipeline → signed upload
  4. products `compare_at_price` column = Shopify meaning, mapped onto price / sale_price (no new column)
  5. match key: SKU → ISBN → slug (selectable), shown per row

## Phase 2 — Fix

- [x] 2.1 Parsing layer — `src/lib/import/` `read-workbook.ts` (xlsx/xls/csv/ods, "Products"/"Variants" sheet or first visible, hidden sheets skipped, merged cells filled, title row above headers, UTF-8/BOM/UTF-16/Windows-1252, `;` CSVs), `headers.ts` + `columns.ts` (normalised headers, alias map, attr/option columns), `coerce.ts` (Rs/commas/NBSP, yes/no, ISO/serial/day-first dates, scientific-notation ISBN/SKU errors, #N/A, CLEAR, blank → null)
- [x] 2.2 Validation — `validate-products.ts`, `validate-variants.ts`, `attribute-schema.ts` (Zod schema built per row from the effective, inherited attributes; case-insensitive options → stored value), `categories.ts` (slug/name/path, "did you mean"), pack defaults, in-file duplicates, all errors of all rows with row/column/value
- [x] 2.3 UX — `src/components/admin/import/BulkImportDialog.tsx` (upload → preview green/yellow/red with new/update counts and match key → import with progress bar + cancel; valid-rows-only or fix-first; .xlsx error report; summary + activity-log link)
- [x] 2.4 Server writes — migration `20261009100000_bulk_import.sql` (staff-checked SECURITY DEFINER RPCs, one transaction per batch, patch-only updates, merged attributes, categories replaced, options added in the same transaction), `import.functions.ts` (re-validates every batch, ≤100 rows / ~900 KB, one activity-log entry per import)
- [x] 2.5 Variants — Variants sheet or separate file, option_<axis> columns, upsert by variant_sku then product+options, parent may be new in the same file, compare_at_price
- [x] 2.6 Images — `fetch-image.server.ts` + `image-links.ts` (15 s, 4 MB, image types, SSRF guard, Drive/Dropbox), compressed by the existing `image-upload.ts`, after the rows are saved, failures = warnings and the old image is kept
- [x] 2.7 Template & export — `xlsx-write.ts` + `export-rows.ts` (Products / Variants / Instructions / hidden Lists sheets, live categories & attributes, ISBN/SKU as Text, dropdowns, one example row per category; export uses the same headers and round-trips with 0 errors)
- [x] 2.8 Clean-up — removed `CatalogImportModal.tsx`, `adminImportProducts/adminImportVariants/adminExportCatalogProducts/adminExportVariants`, `adminBulkUpsertProducts/adminExportProducts`, `validateProductRow/validateVariantRow`; RPC types added to `types.ts` by hand (migration not applied anywhere, so types can't be generated yet); no `as any` in the import path
- [x] Extra: product page no longer renders unsanitised description HTML during SSR (E22)
- [x] Checks: typecheck ✅ · tests 242/242 ✅ · build ✅ · lint: import files clean; repo-wide lint still fails on the pre-existing baseline (no new errors in edited files)
- [x] STOP — summary, migrations, test steps shown; user replied "continue"

## Phase 3 — Test & final report

- [x] 3.1 Parser unit tests (`coerce.test.ts`, `headers.test.ts`, `read-workbook.test.ts`) — written early to verify Phase 2
- [x] 3.2 Validation tests (`validate-products.test.ts`, `validate-variants.test.ts`, `round-trip.test.ts`, `run-import.test.ts`, `fetch-image.test.ts`)
- [x] 3.3 Integration test on PGlite (`supabase/tests/bulk-import.test.mjs`) — 1,000 rows, rollback, variants, round trip, cost_price
- [x] 3.3a End-to-end pipeline test (`supabase/tests/bulk-import-e2e.test.mjs`) — batch handler bodies moved to `batch-write.ts` so the test runs the exact server code; found + fixed the ISBN-formatting rewrite
- [!] 3.3b Manual click-through in a browser — blocked: no Docker (no local Supabase); a Supabase branch is billable and needs the owner's go-ahead. Test plan in IMPORT_FINAL_REPORT.md §5
- [!] 3.4 Re-run `/import-samples` — folder never provided; 4 synthetic samples in the E2E test cover every audit failure
- [x] 3.5 Final report — IMPORT_FINAL_REPORT.md (bugs + fixes, migrations, tests, admin guide)
