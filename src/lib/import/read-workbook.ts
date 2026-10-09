// Reads an uploaded .xlsx / .xls / .csv into plain string rows (browser only —
// the import dialog loads this module on demand). Every cell becomes the raw
// text the admin typed: no Excel auto-typing, numbers in full digits, Excel
// dates as yyyy-mm-dd, error cells as "#N/A" so the validator can explain them.
import * as XLSX from "xlsx";
import Papa from "papaparse";
import { cleanCell, numberToPlainString, excelSerialToISO } from "./coerce";
import { knownHeaderCount, looksLikeVariants, type SheetKind } from "./headers";

export type SheetRow = { rowNumber: number; cells: string[] };
export type SheetData = {
  sheetName: string;
  headerRow: number;
  headers: string[];
  rows: SheetRow[];
};
export type WorkbookData = {
  products?: SheetData;
  variants?: SheetData;
  /** File-level notes (encoding fallback, hidden sheets skipped, headerless columns…). */
  warnings: string[];
};

export const ACCEPTED_EXTENSIONS = [".xlsx", ".xlsm", ".xls", ".csv", ".txt", ".ods"];
export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_ROWS = 5000;

export class ImportFileError extends Error {}

const ext = (name: string) => /\.[^.]+$/.exec(name.toLowerCase())?.[0] ?? "";
const isZip = (b: Uint8Array) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
const isOle = (b: Uint8Array) => b[0] === 0xd0 && b[1] === 0xcf && b[2] === 0x11 && b[3] === 0xe0; // old .xls

/** UTF-8 (with or without BOM), UTF-16 ("Unicode Text" from Excel), else Windows-1252 with a warning. */
export function decodeText(bytes: Uint8Array, warnings: string[]): string {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)
    return new TextDecoder("utf-8").decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe)
    return new TextDecoder("utf-16le").decode(bytes.subarray(2));
  if (bytes[0] === 0xfe && bytes[1] === 0xff)
    return new TextDecoder("utf-16be").decode(bytes.subarray(2));
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    warnings.push(
      'This CSV is not saved as UTF-8 (Excel\'s plain "CSV" format), so Urdu and some special letters may be lost. In Excel use File → Save As → "CSV UTF-8", or upload the .xlsx file instead.',
    );
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** One Excel cell → the text the admin meant. */
export function cellToString(cell: XLSX.CellObject | undefined): string {
  if (!cell || cell.t === "z") return "";
  switch (cell.t) {
    case "s":
      return String(cell.v ?? "");
    case "b":
      return cell.v ? "TRUE" : "FALSE";
    case "e":
      return cell.w ?? "#ERROR";
    case "d":
      return cell.v instanceof Date ? cell.v.toISOString().slice(0, 10) : String(cell.w ?? "");
    case "n": {
      const v = cell.v as number;
      const fmt = typeof cell.z === "string" ? cell.z : "General";
      if (fmt !== "General" && XLSX.SSF.is_date(fmt)) return excelSerialToISO(v);
      // Codes formatted with leading zeros (format 00000) or as Text keep what Excel shows.
      if ((/^0+$/.test(fmt) || fmt === "@") && cell.w) return cell.w;
      return numberToPlainString(v); // full digits, never 9.78E+12
    }
    default:
      return String(cell.w ?? cell.v ?? "");
  }
}

function sheetToMatrix(ws: XLSX.WorkSheet): { matrix: string[][]; firstRow: number } {
  const ref = ws["!ref"];
  if (!ref) return { matrix: [], firstRow: 1 };
  const range = XLSX.utils.decode_range(ref);
  // Merged cells: every cell of the merge gets the top-left value (e.g. a category merged down a block).
  const merged = new Map<string, string>();
  for (const m of ws["!merges"] ?? []) {
    const v = cellToString(ws[XLSX.utils.encode_cell(m.s)] as XLSX.CellObject | undefined);
    for (let r = m.s.r; r <= m.e.r; r++)
      for (let c = m.s.c; c <= m.e.c; c++) merged.set(`${r},${c}`, v);
  }
  const matrix: string[][] = [];
  for (let r = range.s.r; r <= range.e.r; r++) {
    const row: string[] = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      row.push(
        merged.get(`${r},${c}`) ??
          cellToString(ws[XLSX.utils.encode_cell({ r, c })] as XLSX.CellObject | undefined),
      );
    }
    matrix.push(row);
  }
  return { matrix, firstRow: range.s.r + 1 };
}

/** Header row = first of the top 10 rows with ≥2 known headers (a title row above it is fine). */
function toSheetData(
  sheetName: string,
  matrix: string[][],
  firstRow: number,
  kind: SheetKind,
  warnings: string[],
): SheetData {
  const nonEmpty = (row: string[]) => row.some((c) => cleanCell(c) != null);
  let h = matrix.findIndex((row, i) => i < 10 && knownHeaderCount(row, kind) >= 2);
  if (h < 0) h = matrix.findIndex(nonEmpty);
  if (h < 0) return { sheetName, headerRow: firstRow, headers: [], rows: [] };
  const headers = matrix[h].map((c) => cleanCell(c) ?? "");
  // Drop trailing columns that have neither a header nor data.
  let width = headers.length;
  const hasData = (c: number) => matrix.slice(h + 1).some((row) => cleanCell(row[c]) != null);
  while (width > 0 && !headers[width - 1] && !hasData(width - 1)) width--;
  headers.length = width;
  headers.forEach((hd, c) => {
    if (!hd && hasData(c))
      warnings.push(
        `Sheet "${sheetName}": column ${XLSX.utils.encode_col(c)} has data but no header — it was ignored.`,
      );
  });
  const rows: SheetRow[] = [];
  for (let i = h + 1; i < matrix.length; i++) {
    const cells = matrix[i].slice(0, width);
    if (!nonEmpty(cells)) continue; // fully empty rows are skipped; row numbers stay Excel's
    rows.push({ rowNumber: firstRow + i, cells });
  }
  if (rows.length > MAX_ROWS)
    throw new ImportFileError(
      `Sheet "${sheetName}" has ${rows.length} rows. Please import at most ${MAX_ROWS} rows per file.`,
    );
  return { sheetName, headerRow: firstRow + h, headers, rows };
}

/**
 * kind = what the admin chose to upload. A workbook with "Products" and
 * "Variants" sheets is read in one go; otherwise the first visible sheet is used.
 */
export function readWorkbook(
  data: ArrayBuffer,
  fileName: string,
  kind: SheetKind = "products",
): WorkbookData {
  const warnings: string[] = [];
  const bytes = new Uint8Array(data);
  const e = ext(fileName);
  if (bytes.length > MAX_FILE_BYTES)
    throw new ImportFileError(
      `The file is ${(bytes.length / 1048576).toFixed(1)} MB. The limit is ${MAX_FILE_BYTES / 1048576} MB — split it into smaller files.`,
    );
  if (!ACCEPTED_EXTENSIONS.includes(e) && !isZip(bytes) && !isOle(bytes)) {
    throw new ImportFileError(
      `"${fileName}" is not a spreadsheet. Upload an Excel file (.xlsx or .xls) or a CSV file.`,
    );
  }

  const textFile = (e === ".csv" || e === ".txt") && !isZip(bytes) && !isOle(bytes);
  if (textFile) {
    const text = decodeText(bytes, warnings);
    const parsed = Papa.parse<string[]>(text, {
      header: false,
      skipEmptyLines: false,
      delimiter: guessDelimiter(text),
    });
    const matrix = parsed.data.map((r) => r.map((c) => String(c ?? "")));
    const sheetKind: SheetKind =
      matrix.length && looksLikeVariants(matrix.find((r) => r.some((c) => c.trim())) ?? [])
        ? "variants"
        : kind;
    return checkNotEmpty({
      [sheetKind]: toSheetData(fileName, matrix, 1, sheetKind, warnings),
      warnings,
    });
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, {
      type: "array",
      cellDates: false,
      cellNF: true,
      cellText: true,
      dense: false,
    });
  } catch {
    throw new ImportFileError(
      `"${fileName}" could not be opened. If it is password-protected or damaged, open it in Excel and save it again as .xlsx.`,
    );
  }
  const visible = wb.SheetNames.filter((_, i) => !wb.Workbook?.Sheets?.[i]?.Hidden);
  const hidden = wb.SheetNames.filter((n) => !visible.includes(n) && !/^lists$/i.test(n));
  if (hidden.length) warnings.push(`Hidden sheet(s) ignored: ${hidden.join(", ")}.`);
  const named = (n: string) => visible.find((s) => s.trim().toLowerCase() === n);
  const read = (name: string, k: SheetKind) => {
    const { matrix, firstRow } = sheetToMatrix(wb.Sheets[name]);
    return toSheetData(name, matrix, firstRow, k, warnings);
  };

  const out: WorkbookData = { warnings };
  const pSheet = named("products");
  const vSheet = named("variants");
  if (pSheet) out.products = read(pSheet, "products");
  if (vSheet) out.variants = read(vSheet, "variants");
  if (!pSheet && !vSheet) {
    const first = visible[0];
    if (!first) throw new ImportFileError("The workbook has no visible sheets.");
    const { matrix } = sheetToMatrix(wb.Sheets[first]);
    const headerGuess = matrix.find((r) => r.some((c) => c.trim())) ?? [];
    const k: SheetKind = looksLikeVariants(headerGuess) ? "variants" : kind;
    out[k] = read(first, k);
    if (visible.length > 1)
      warnings.push(
        `Only the first sheet "${first}" was read. Name your sheets "Products" and "Variants" to import both.`,
      );
  }
  return checkNotEmpty(out);
}

function checkNotEmpty(out: WorkbookData): WorkbookData {
  if (!out.products?.rows.length && !out.variants?.rows.length)
    throw new ImportFileError("No product rows were found in this file.");
  return out;
}

/** The separator used most in the first line (outside quotes): , ; tab or |. Excel in some locales saves ";". */
export function guessDelimiter(text: string): string {
  const first = (text.split(/\r?\n/).find((l) => l.trim()) ?? "").replace(/"[^"]*"/g, "");
  const counts = [",", ";", "\t", "|"].map((d) => [d, first.split(d).length - 1] as const);
  const best = counts.reduce((a, b) => (b[1] > a[1] ? b : a));
  return best[1] > 0 ? best[0] : ",";
}
