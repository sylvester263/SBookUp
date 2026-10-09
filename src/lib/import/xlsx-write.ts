// .xlsx files for the bulk importer (template, export, error report), written
// with ExcelJS. Loaded on demand by the import dialog only. ISBN / SKU columns
// are formatted as Text so Excel keeps every digit; dropdowns come from a
// hidden "Lists" sheet built from the LIVE categories and attributes.
import type { Workbook, Worksheet } from "exceljs";
import { categoryPath } from "./categories";
import {
  ATTRIBUTE_PREFIX,
  CLEAR_TOKEN,
  EXAMPLE_SKU_PREFIX,
  OPTION_PREFIX,
  PRODUCT_COLUMNS,
  VARIANT_COLUMNS,
  type ColumnDef,
} from "./columns";
import {
  exportProductRows,
  exportVariantRows,
  productAttributeKeys,
  productHeaders,
  variantHeaders,
  variantOptionKeys,
  type Cell,
  type ExportProduct,
  type ExportSheet,
  type ExportVariant,
} from "./export-rows";
import { effectiveAttributesFor } from "@/lib/catalog-import";
import type { Issue, ImportContext } from "./types";

const DATA_ROWS = 2000; // rows covered by dropdowns / Text format
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0F766E" } } as const;
const ERROR_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE2E2" } } as const;
const WARN_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } } as const;

type ValidationSheet = Worksheet & {
  dataValidations: { add: (range: string, v: Record<string, unknown>) => void };
};

async function newWorkbook(): Promise<Workbook> {
  const mod = (await import("exceljs")) as unknown as {
    Workbook?: new () => Workbook;
    default?: { Workbook: new () => Workbook };
  };
  const W = mod.Workbook ?? mod.default!.Workbook;
  const wb = new W();
  wb.creator = "SchoolBooksExperts admin";
  wb.created = new Date();
  return wb;
}

const colLetter = (n: number) => {
  let s = "";
  for (let x = n; x > 0; x = Math.floor((x - 1) / 26))
    s = String.fromCharCode(65 + ((x - 1) % 26)) + s;
  return s;
};

function columnDef(
  header: string,
  ctx: ImportContext,
): { def?: ColumnDef; attrKey?: string; optionKey?: string } {
  if (header.startsWith(ATTRIBUTE_PREFIX))
    return { attrKey: header.slice(ATTRIBUTE_PREFIX.length) };
  if (header.startsWith(OPTION_PREFIX)) return { optionKey: header.slice(OPTION_PREFIX.length) };
  void ctx;
  return { def: [...PRODUCT_COLUMNS, ...VARIANT_COLUMNS].find((c) => c.key === header) };
}

/** Header row + column widths + Text format + notes + dropdowns. */
function setUpSheet(
  ws: Worksheet,
  headers: string[],
  kind: "products" | "variants",
  ctx: ImportContext,
  lists: Map<string, string>,
) {
  const defs = kind === "products" ? PRODUCT_COLUMNS : VARIANT_COLUMNS;
  ws.columns = headers.map((h) => {
    const { def, attrKey, optionKey } = columnDef(h, ctx);
    const d = def && defs.includes(def) ? def : undefined;
    return {
      header: h,
      key: h,
      width: d?.width ?? (attrKey || optionKey ? 16 : 14),
      style: d?.textFormat ? { numFmt: "@" } : {},
    };
  });
  const head = ws.getRow(1);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } };
  head.fill = HEADER_FILL;
  head.height = 20;
  ws.views = [{ state: "frozen", ySplit: 1, xSplit: kind === "products" ? 2 : 1 }];
  const vs = ws as ValidationSheet;
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 1);
    const { def, attrKey, optionKey } = columnDef(h, ctx);
    const key = attrKey ?? optionKey;
    const attr = key ? ctx.definitions.find((d) => d.key === key) : undefined;
    const note =
      def && defs.includes(def)
        ? def.help + (def.requiredOnCreate ? " (Required for new products.)" : "")
        : attr
          ? `${attr.label}${attr.unit ? ` (${attr.unit})` : ""}. ${attr.help_text ?? ""}`
          : "";
    if (note) cell.note = note;
    const range = `${colLetter(i + 1)}2:${colLetter(i + 1)}${DATA_ROWS}`;
    const dropdown = (source: string, strict: boolean) =>
      vs.dataValidations.add(range, {
        type: "list",
        allowBlank: true,
        formulae: [source],
        showErrorMessage: strict,
        errorStyle: "warning",
        error: "This value is not in the list. Check the Instructions sheet.",
      });
    if (def?.kind === "bool") dropdown('"yes,no"', true);
    else if (def?.kind === "sell_unit") dropdown('"item,pack"', true);
    else if (def?.kind === "categories" && lists.has("categories"))
      dropdown(lists.get("categories")!, false);
    else if (key && lists.has(key)) dropdown(lists.get(key)!, false);
  });
}

/** Hidden sheet with dropdown sources; returns name → absolute range formula. */
function buildLists(wb: Workbook, ctx: ImportContext): Map<string, string> {
  const ws = wb.addWorksheet("Lists", { state: "hidden" });
  const out = new Map<string, string>();
  const columns: [string, string[]][] = [
    [
      "categories",
      ctx.categories
        .filter((c) => c.is_active !== false)
        .map((c) => c.slug)
        .sort(),
    ],
  ];
  for (const d of ctx.definitions.filter(
    (x) => x.is_active !== false && (x.type === "select" || x.type === "multiselect"),
  )) {
    columns.push([d.key, d.options.filter((o) => o.is_active !== false).map((o) => o.value)]);
  }
  columns.forEach(([name, values], i) => {
    if (!values.length) return;
    const col = colLetter(i + 1);
    ws.getCell(`${col}1`).value = name;
    values.forEach((v, r) => (ws.getCell(`${col}${r + 2}`).value = v));
    out.set(name, `Lists!$${col}$2:$${col}$${values.length + 1}`);
  });
  return out;
}

function writeRows(ws: Worksheet, sheet: { headers: string[]; rows: Cell[][] }) {
  for (const r of sheet.rows) ws.addRow(r.map((v) => (v == null ? null : v)));
}

function exampleRows(ctx: ImportContext, attrKeys: string[]): Cell[][] {
  const headers = productHeaders(attrKeys);
  const cats = [...ctx.categories]
    .filter((c) => c.is_active !== false)
    .sort((a, b) =>
      categoryPath(a.id, ctx.categories).localeCompare(categoryPath(b.id, ctx.categories)),
    );
  return cats.map((c) => {
    const pack = c.default_sell_unit === "pack";
    const v: Record<string, Cell> = {
      sku: `${EXAMPLE_SKU_PREFIX}${c.slug}`.toUpperCase(),
      name: `EXAMPLE – ${c.name} item`,
      categories: c.slug,
      price: pack ? 600 : 500,
      stock_quantity: 10,
      sell_unit: pack ? "pack" : "item",
      pack_size: pack ? (c.default_pack_size ?? null) : null,
      unit_label: pack ? (c.default_unit_label ?? null) : null,
      is_active: "yes",
    };
    for (const a of effectiveAttributesFor([c.id], ctx)) {
      if (a.variant_axis || !attrKeys.includes(a.key)) continue;
      const first = a.options.find((o) => o.is_active !== false)?.value;
      v[ATTRIBUTE_PREFIX + a.key] =
        a.type === "number" ? 1 : a.type === "text" ? null : (first ?? null);
    }
    return headers.map((h) => v[h] ?? null);
  });
}

function addInstructions(
  wb: Workbook,
  ctx: ImportContext,
  attrKeys: string[],
  optionKeys: string[],
) {
  const ws = wb.addWorksheet("Instructions");
  ws.columns = [{ width: 26 }, { width: 22 }, { width: 70 }, { width: 40 }];
  const title = (t: string) => {
    ws.addRow([]);
    const r = ws.addRow([t]);
    r.font = { bold: true, size: 13, color: { argb: "FF0F766E" } };
  };
  const tableHead = (cells: string[]) => {
    const r = ws.addRow(cells);
    r.font = { bold: true };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE2E8F0" } };
  };
  const wrap = () =>
    ws.getRow(ws.rowCount).eachCell((c) => (c.alignment = { wrapText: true, vertical: "top" }));

  const h = ws.addRow(["How to bulk upload products"]);
  h.font = { bold: true, size: 16 };
  for (const line of [
    "1. Fill the Products sheet: one row per product. Grey EXAMPLE rows are skipped by the importer — delete them or leave them.",
    "2. Sizes / colours (e.g. costumes) go in the Variants sheet: one row per size + colour, with the product's SKU in product_sku.",
    "3. Upload the file in Admin → Products → Bulk import. Check the preview, then import.",
    `4. Updating products: blank cells and missing columns change nothing. Type ${CLEAR_TOKEN} to empty a value.`,
    "5. Existing products are found by SKU, then ISBN, then slug (you can change this on the upload screen).",
    "6. Pack products (e.g. Gift Wrapping Sheets, Money Folders): the price is for ONE PACK and stock counts packs.",
  ])
    ws.addRow([line]);

  title("Common mistakes");
  for (const line of [
    "• ISBN / SKU / barcode turned into 9.78E+12: keep those columns formatted as Text (they are in this file). If you paste, use Paste Special → Values.",
    "• Categories: use the slugs listed below (e.g. gift-wrapping-sheets), separated by | with the main category first.",
    '• Saving as CSV: choose "CSV UTF-8" or Urdu text turns into ????. Uploading this .xlsx file is safest.',
    '• Prices: numbers only are best; "Rs. 1,250" is also understood.',
    "• Image links must be public. Google Drive: Share → Anyone with the link.",
  ])
    ws.addRow([line]);

  title("Products sheet columns");
  tableHead(["Column", "Required?", "What to type", "Example"]);
  for (const c of PRODUCT_COLUMNS) {
    ws.addRow([c.key, c.requiredOnCreate ? "New products" : "", c.help, c.example ?? ""]);
    wrap();
  }
  for (const k of attrKeys) {
    const d = ctx.definitions.find((x) => x.key === k)!;
    const used = ctx.categoryAttributes.filter(
      (ca) => ca.attribute_id === d.id && !ca.is_variant_axis,
    );
    const req = used
      .filter((u) => u.is_required)
      .map((u) => ctx.categories.find((c) => c.id === u.category_id)?.slug)
      .filter(Boolean);
    ws.addRow([
      ATTRIBUTE_PREFIX + k,
      req.length ? `In: ${req.join(", ")}` : "",
      `${d.label} — ${typeLabel(d.type)}${allowed(d)}`,
      d.options.find((o) => o.is_active !== false)?.value ?? "",
    ]);
    wrap();
  }

  title("Variants sheet columns");
  tableHead(["Column", "Required?", "What to type", "Example"]);
  for (const c of VARIANT_COLUMNS) {
    ws.addRow([
      c.key,
      c.key === "product_sku" ? "Yes (or product_slug)" : "",
      c.help,
      c.example ?? "",
    ]);
    wrap();
  }
  for (const k of optionKeys) {
    const d = ctx.definitions.find((x) => x.key === k)!;
    ws.addRow([
      OPTION_PREFIX + k,
      "Yes, where it is a variant option",
      `${d.label}${allowed(d)}`,
      d.options[0]?.value ?? "",
    ]);
    wrap();
  }

  title("Categories (use the slug)");
  tableHead(["Slug", "Sold by", "Category", "Attributes (* = required, ° = per variant)"]);
  const sorted = [...ctx.categories].sort((a, b) =>
    categoryPath(a.id, ctx.categories).localeCompare(categoryPath(b.id, ctx.categories)),
  );
  for (const c of sorted) {
    const attrs = effectiveAttributesFor([c.id], ctx).map(
      (a) => `${a.label}${a.is_required ? "*" : ""}${a.variant_axis ? "°" : ""}`,
    );
    const sold =
      c.default_sell_unit === "pack"
        ? `pack of ${c.default_pack_size ?? "?"}${c.default_unit_label ? ` ${c.default_unit_label}s` : ""}`
        : "item";
    ws.addRow([
      c.slug,
      sold,
      categoryPath(c.id, ctx.categories) + (c.is_active === false ? " (hidden)" : ""),
      attrs.join(", "),
    ]);
    wrap();
  }
}

const typeLabel = (t: string) =>
  ({
    select: "pick one value",
    multiselect: 'one or more values separated by "|"',
    number: "a number",
    text: "free text",
  })[t] ?? t;
function allowed(d: ImportContext["definitions"][number]) {
  const opts = d.options.filter((o) => o.is_active !== false).map((o) => o.value);
  if (d.type !== "select" && d.type !== "multiselect") return "";
  if (!opts.length)
    return d.allow_new_options ? ". Any value (new values are added to the list)." : "";
  return `. Allowed: ${opts.join(", ")}${d.allow_new_options ? " (new values are added to the list)" : ""}.`;
}

function styleExamples(ws: Worksheet) {
  ws.eachRow((row, n) => {
    if (n > 1) row.font = { italic: true, color: { argb: "FF64748B" } };
  });
}

/** The downloadable template, generated from the live categories / attributes. */
export async function buildTemplateWorkbook(ctx: ImportContext): Promise<Workbook> {
  const wb = await newWorkbook();
  const attrKeys = productAttributeKeys(ctx);
  const optionKeys = variantOptionKeys(ctx);
  const products = wb.addWorksheet("Products");
  const variants = wb.addWorksheet("Variants");
  addInstructions(wb, ctx, attrKeys, optionKeys);
  const lists = buildLists(wb, ctx);
  setUpSheet(products, productHeaders(attrKeys), "products", ctx, lists);
  writeRows(products, { headers: [], rows: exampleRows(ctx, attrKeys) });
  styleExamples(products);
  setUpSheet(variants, variantHeaders(optionKeys), "variants", ctx, lists);
  const axisCat = ctx.categories.find((c) =>
    effectiveAttributesFor([c.id], ctx).some((a) => a.variant_axis),
  );
  if (axisCat) {
    const axes = effectiveAttributesFor([axisCat.id], ctx).filter((a) => a.variant_axis);
    const v: Record<string, Cell> = {
      product_sku: `${EXAMPLE_SKU_PREFIX}${axisCat.slug}`.toUpperCase(),
      variant_sku: `${EXAMPLE_SKU_PREFIX}${axisCat.slug}-1`.toUpperCase(),
      stock: 5,
      is_active: "yes",
    };
    for (const a of axes)
      v[OPTION_PREFIX + a.key] = a.options.find((o) => o.is_active !== false)?.value ?? null;
    variants.addRow(variantHeaders(optionKeys).map((h) => v[h] ?? null));
    styleExamples(variants);
  }
  return wb;
}

/** Export in the import format (same headers) — edit and upload it again. */
export async function buildExportWorkbook(
  ctx: ImportContext,
  products: ExportProduct[],
  variants: ExportVariant[],
): Promise<{ wb: Workbook; sheets: { products: ExportSheet; variants: ExportSheet } }> {
  const wb = await newWorkbook();
  const p = exportProductRows(ctx, products);
  const v = exportVariantRows(ctx, variants);
  const pws = wb.addWorksheet("Products");
  const vws = wb.addWorksheet("Variants");
  addInstructions(
    wb,
    ctx,
    p.headers
      .filter((h) => h.startsWith(ATTRIBUTE_PREFIX))
      .map((h) => h.slice(ATTRIBUTE_PREFIX.length)),
    v.headers.filter((h) => h.startsWith(OPTION_PREFIX)).map((h) => h.slice(OPTION_PREFIX.length)),
  );
  const lists = buildLists(wb, ctx);
  setUpSheet(pws, p.headers, "products", ctx, lists);
  writeRows(pws, p);
  const descCol = p.headers.indexOf("description") + 1;
  for (const t of p.tooLong)
    pws.getCell(t.row, descCol).note =
      "This description is longer than Excel allows, so it was left blank. A blank cell keeps the current description.";
  setUpSheet(vws, v.headers, "variants", ctx, lists);
  writeRows(vws, v);
  return { wb, sheets: { products: p, variants: v } };
}

export type ReportSheet = {
  name: string;
  headers: string[];
  /** 1-based column numbers that hold codes (kept as Text). */
  textColumns: number[];
  rows: { rowNumber: number; cells: string[]; issues: Issue[] }[];
};

/** The rows that failed, exactly as uploaded, with "errors" / "warnings" columns at the end. Fix and upload again. */
export async function buildErrorReportWorkbook(sheets: ReportSheet[]): Promise<Workbook> {
  const wb = await newWorkbook();
  for (const s of sheets) {
    if (!s.rows.length) continue;
    const ws = wb.addWorksheet(s.name);
    ws.columns = [...s.headers, "errors", "warnings", "row in your file"].map((h, i) => ({
      header: h,
      key: `c${i}`,
      width: i >= s.headers.length ? 50 : 16,
      style: s.textColumns.includes(i + 1) ? { numFmt: "@" } : {},
    }));
    const head = ws.getRow(1);
    head.font = { bold: true, color: { argb: "FFFFFFFF" } };
    head.fill = HEADER_FILL;
    ws.views = [{ state: "frozen", ySplit: 1 }];
    for (const r of s.rows) {
      const errors = r.issues.filter((i) => i.level === "error");
      const warnings = r.issues.filter((i) => i.level === "warning");
      const fmt = (list: Issue[]) => list.map((i) => `${i.column}: ${i.message}`).join("\n");
      const row = ws.addRow([
        ...r.cells.map((c) => (c === "" ? null : c)),
        fmt(errors),
        fmt(warnings),
        r.rowNumber,
      ]);
      row.alignment = { vertical: "top" };
      row.getCell(s.headers.length + 1).alignment = { wrapText: true, vertical: "top" };
      row.getCell(s.headers.length + 1).font = { color: { argb: "FFB91C1C" } };
      row.getCell(s.headers.length + 2).alignment = { wrapText: true, vertical: "top" };
      for (const iss of r.issues) {
        const idx = s.headers.findIndex((h) => h.trim() === iss.column.trim());
        if (idx < 0) continue;
        const cell = row.getCell(idx + 1);
        cell.fill = iss.level === "error" ? ERROR_FILL : cell.fill?.type ? cell.fill : WARN_FILL;
        cell.note = [typeof cell.note === "string" ? cell.note : "", iss.message]
          .filter(Boolean)
          .join("\n");
      }
    }
  }
  if (!wb.worksheets.length) wb.addWorksheet("Products").addRow(["No problems found"]);
  return wb;
}

export async function workbookToBlob(wb: Workbook): Promise<Blob> {
  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
