// Explicit cell coercion for the bulk importer. Every cell arrives as a raw
// string (no Excel auto-typing); these helpers turn it into a typed value or a
// clear, admin-readable message. Pure + unit-tested (coerce.test.ts).
import { CLEAR_TOKEN } from "./columns";

export type Coerced<T> =
  | { value: T; error?: undefined; warning?: string }
  | { value?: undefined; error: string; warning?: undefined };

const INVISIBLE = /[\uFEFF\u200B-\u200D\u2060]/g;
const SPACES = /[\u00A0\u2007\u202F\u2009\u3000]/g; // NBSP, figure / thin / narrow / ideographic spaces

/** Trim, drop zero-width chars, NBSP → space. Empty → null (never ""). */
export function cleanCell(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).replace(INVISIBLE, "").replace(SPACES, " ").replace(/\r\n?/g, "\n").trim();
  return s === "" ? null : s;
}

export const isClear = (v: string | null) => v != null && v.trim().toUpperCase() === CLEAR_TOKEN;

const EXCEL_ERROR =
  /^#(N\/A|REF!|VALUE!|DIV\/0!|NAME\?|NUM!|NULL!|SPILL!|CALC!|GETTING_DATA|ERROR!?)$/i;
/** Excel error values (#N/A, #REF!…) left by a broken formula. */
export function excelError(v: string | null): string | undefined {
  if (v && EXCEL_ERROR.test(v.trim()))
    return `Excel error ${v.trim()} in this cell — fix the formula or type the value`;
  return undefined;
}

/** A number Excel turned into scientific notation, e.g. 9.78097E+12. */
export const SCIENTIFIC = /^[+-]?\d+(?:\.\d+)?e[+-]?\d+$/i;

/** "Rs. 1,250", "1,250.00", "PKR 999/-", "1 250" → number. */
export function parseNumber(
  raw: string,
  opts: { int?: boolean; min?: number; max?: number; label?: string } = {},
): Coerced<number> {
  const label = opts.label ?? "Value";
  const s = raw
    .trim()
    .replace(/^(?:rs\.?|pkr|₨|rupees?)\s*/i, "")
    .replace(/\s*(?:rs\.?|pkr|₨|\/-|-\/|rupees?)$/i, "")
    .replace(/[\s,']/g, "");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(s))
    return { error: `${label} must be a number (got "${raw}")` };
  const n = Number(s);
  if (!Number.isFinite(n)) return { error: `${label} must be a number (got "${raw}")` };
  if (opts.int && !Number.isInteger(n))
    return { error: `${label} must be a whole number (got "${raw}")` };
  if (opts.min != null && n < opts.min)
    return { error: `${label} must be ${opts.min} or more (got "${raw}")` };
  if (opts.max != null && n > opts.max)
    return { error: `${label} must be ${opts.max} or less (got "${raw}")` };
  return { value: n };
}

const TRUE = new Set([
  "true",
  "yes",
  "y",
  "1",
  "active",
  "published",
  "visible",
  "enabled",
  "on",
  "show",
  "shown",
  "x",
  "✓",
  "✔",
  "haan",
  "han",
]);
const FALSE = new Set([
  "false",
  "no",
  "n",
  "0",
  "draft",
  "hidden",
  "inactive",
  "disabled",
  "off",
  "hide",
  "nahi",
  "nahin",
]);
/** yes/no, true/false, 1/0, active/draft… Anything else is an error (never a silent "no"). */
export function parseBool(raw: string, label = "Value"): Coerced<boolean> {
  const s = raw.trim().toLowerCase();
  if (TRUE.has(s)) return { value: true };
  if (FALSE.has(s)) return { value: false };
  return { error: `${label} must be yes or no (got "${raw}")` };
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
function ymd(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
/** Excel serial day number (1900 date system) → yyyy-mm-dd. */
export function excelSerialToISO(serial: number): string {
  const ms = Math.round((serial - 25569) * 86_400_000); // 25569 = 1970-01-01
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/**
 * 2026-12-31, 2026-12-31T00:00, an Excel serial (46022), 31/12/2026, 31-12-2026,
 * 31 Dec 2026, Dec 31 2026. Slash dates are read day-first (Pakistan); when
 * both parts are ≤ 12 the reading is returned as a warning so the admin can check.
 */
export function parseDate(raw: string, label = "Date"): Coerced<string> {
  const s = raw.trim();
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/.exec(s);
  if (m) {
    const v = ymd(+m[1], +m[2], +m[3]);
    return v ? { value: v } : { error: `${label} is not a real date (got "${raw}")` };
  }
  if (/^\d{4,5}(?:\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n >= 20000 && n <= 80000) return { value: excelSerialToISO(Math.floor(n)) };
  }
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let a = +m[1],
      b = +m[2];
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    let warning: string | undefined;
    if (a <= 12 && b > 12)
      [a, b] = [b, a]; // clearly month/day
    else if (a <= 12 && b <= 12 && a !== b)
      warning = `${label} "${raw}" was read as day/month/year (${a} ${MONTHS[b - 1]} ${y}) — use 2026-12-31 to be sure`;
    const v = ymd(y, b, a);
    return v ? { value: v, warning } : { error: `${label} is not a real date (got "${raw}")` };
  }
  m = /^(\d{1,2})[\s-]+([a-z]{3,9})[\s,-]+(\d{4})$/i.exec(s) ?? null;
  const m2 = m ? null : /^([a-z]{3,9})[\s-]+(\d{1,2})(?:st|nd|rd|th)?,?[\s-]+(\d{4})$/i.exec(s);
  if (m || m2) {
    const [day, mon, year] = m ? [+m[1], m[2], +m[3]] : [+m2![2], m2![1], +m2![3]];
    const mi = MONTHS.indexOf(mon.slice(0, 3).toLowerCase());
    const v = mi >= 0 ? ymd(year, mi + 1, day) : null;
    if (v) return { value: v };
  }
  return { error: `${label} must be a date like 2026-12-31 (got "${raw}")` };
}

/**
 * SKU / ISBN / barcode kept as text. Scientific notation means Excel already
 * destroyed the digits, so it is an error with the fix spelled out.
 */
export function parseCode(raw: string, label: string): Coerced<string> {
  const s = raw.trim();
  if (SCIENTIFIC.test(s)) {
    return {
      error: `${label} looks like ${s} — Excel changed this number. Format the ${label} column as Text in Excel and type the full number again`,
    };
  }
  if (/^\d+\.0+$/.test(s))
    return {
      value: s.replace(/\.0+$/, ""),
      warning: `${label} "${s}" had a trailing ".0" (read as a number) — saved as ${s.replace(/\.0+$/, "")}`,
    };
  if (/[\n\t]/.test(s)) return { error: `${label} must be on one line` };
  return { value: s };
}

/** Digits (and a final X) of an ISBN, used for matching. */
export const normaliseIsbn = (isbn: string) => isbn.replace(/[^0-9Xx]/g, "").toUpperCase();

/** Warnings only: odd ISBNs are stored as typed (they may be barcodes). */
export function isbnWarning(isbn: string): string | undefined {
  const d = normaliseIsbn(isbn);
  if (/^\d{13}$/.test(d)) {
    const sum = [...d.slice(0, 12)].reduce((t, c, i) => t + Number(c) * (i % 2 ? 3 : 1), 0);
    if ((10 - (sum % 10)) % 10 !== Number(d[12]))
      return `ISBN/barcode ${isbn} has a wrong check digit — please double-check it`;
    return undefined;
  }
  if (/^\d{9}[\dX]$/.test(d)) {
    const sum = [...d].reduce((t, c, i) => t + (c === "X" ? 10 : Number(c)) * (10 - i), 0);
    if (sum % 11 !== 0) return `ISBN ${isbn} has a wrong check digit — please double-check it`;
    return undefined;
  }
  return `"${isbn}" is not a 10 or 13 digit ISBN/barcode — saved as typed`;
}

/** Values separated by "|" (or new lines). For tags a plain comma list also works. */
export function splitList(raw: string, opts: { commas?: boolean } = {}): string[] {
  const sep = opts.commas && !/[|\n]/.test(raw) ? /,/ : /[|\n]/;
  return Array.from(
    new Set(
      raw
        .split(sep)
        .map((x) => x.trim())
        .filter(Boolean),
    ),
  );
}

/** Image links separated by "|", new lines, ";" or a comma that starts another link. */
export function splitUrls(raw: string): string[] {
  return raw
    .split(/\s*(?:\||\n|;|,(?=\s*https?:\/\/))\s*/i)
    .map((x) => x.trim())
    .filter(Boolean);
}

export function slugify(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 200)
    .replace(/-+$/, "");
}

/** Short stable hash (FNV-1a, base36) — slug fallback for names with no Latin letters. */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (const ch of s) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36).padStart(7, "0");
}

/** Number → plain digits, never "1e+21" (used when reading numeric Excel cells). */
export function numberToPlainString(n: number): string {
  if (Number.isInteger(n) && Math.abs(n) < 1e21) return BigInt(n).toString();
  const s = String(n);
  if (!/e/i.test(s)) return s;
  return n.toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
}

/** Signs that the text lost its Urdu / accented letters on the way (ANSI save, wrong decoding). */
export function lostCharactersWarning(v: string): string | undefined {
  if (v.includes("\uFFFD"))
    return "contains \uFFFD — the file was not saved as UTF-8 and some letters were lost. In Excel use Save As → CSV UTF-8, or upload the .xlsx";
  if (/\?{3,}/.test(v))
    return 'contains "???" — Urdu letters may have been lost when the file was saved. In Excel use Save As → CSV UTF-8, or upload the .xlsx';
  return undefined;
}

/** Scripts / event handlers in a description (removed when shown on the website). */
export const UNSAFE_HTML = /<\s*(script|iframe|object|embed|form)\b|\son\w+\s*=|javascript:/i;

/** Levenshtein distance (small strings), for "did you mean" suggestions. */
export function distance(a: string, b: string): number {
  if (a === b) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}
