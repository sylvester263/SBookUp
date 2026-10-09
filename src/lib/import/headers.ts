// Header matching for the bulk importer: canonical keys, aliases (old / human
// column names), attribute columns (attr_<key>, the key, or the label) and
// variant option columns (option_<key>, the key, or the label).
import type { AttributeDefinition } from "@/lib/attributes";
import {
  ATTRIBUTE_PREFIX,
  LEGACY_IMAGE_COLUMN,
  OPTION_PREFIX,
  PRODUCT_COLUMNS,
  VARIANT_COLUMNS,
  normaliseHeader,
  type ColumnDef,
} from "./columns";

export type SheetKind = "products" | "variants";

/** Field id: a column key ("price"), "attr:<key>", "option:<key>" or "image:<n>". */
export type FieldId = string;

export type ResolvedColumn = { index: number; header: string; field: FieldId | null };
export type HeaderResult = {
  columns: ResolvedColumn[];
  /** field → the header text the admin used (for error messages / reports). */
  headerOf: Record<FieldId, string>;
  /** Headers that matched nothing (ignored, reported as a file warning). */
  unknown: string[];
  /** Two headers for the same field: the first one is used. */
  duplicates: string[];
  /** Same label used by several attributes (e.g. "Size"): ignored, with a hint. */
  ambiguous: string[];
};

// English spelling variants accepted in attribute / option headers.
const SYNONYMS: Record<string, string> = {
  color: "colour",
  colors: "colour",
  colours: "colour",
  sizes: "size",
};
const syn = (s: string) =>
  s
    .split(" ")
    .map((w) => SYNONYMS[w] ?? w)
    .join(" ");

export function columnsFor(kind: SheetKind): ColumnDef[] {
  return kind === "products" ? PRODUCT_COLUMNS : VARIANT_COLUMNS;
}

/** header (normalised) → field, for the fixed columns of a sheet kind. */
function fixedLookup(kind: SheetKind): Map<string, FieldId> {
  const m = new Map<string, FieldId>();
  for (const c of columnsFor(kind)) {
    m.set(normaliseHeader(c.key), c.key);
    for (const a of c.aliases ?? [])
      if (!m.has(normaliseHeader(a))) m.set(normaliseHeader(a), c.key);
  }
  if (kind === "products") {
    // Legacy columns from the first importer: author / publisher became attributes.
    m.set("author", "attr:author");
    m.set("publisher", "attr:publisher");
  }
  return m;
}

export function resolveHeaders(
  headers: string[],
  kind: SheetKind,
  definitions: AttributeDefinition[],
): HeaderResult {
  const fixed = fixedLookup(kind);
  const defs = definitions.filter((d) => d.is_active !== false);
  const byKey = new Map(defs.map((d) => [normaliseHeader(d.key), d.key]));
  const byLabel = new Map<string, string[]>();
  for (const d of defs) {
    const l = syn(normaliseHeader(d.label));
    byLabel.set(l, [...(byLabel.get(l) ?? []), d.key]);
  }
  const prefix = kind === "products" ? ATTRIBUTE_PREFIX : OPTION_PREFIX;
  const tag = kind === "products" ? "attr" : "option";
  const pfx = normaliseHeader(prefix); // "attr" / "option"

  const out: HeaderResult = {
    columns: [],
    headerOf: {},
    unknown: [],
    duplicates: [],
    ambiguous: [],
  };
  headers.forEach((header, index) => {
    const h = normaliseHeader(header);
    let field: FieldId | null = null;
    if (!h) {
      out.columns.push({ index, header, field: null });
      return;
    }
    if (fixed.has(h)) field = fixed.get(h)!;
    else if (h.startsWith(pfx + " ") && byKey.has(syn(h.slice(pfx.length + 1))))
      field = `${tag}:${byKey.get(syn(h.slice(pfx.length + 1)))}`;
    else if (h.startsWith(pfx + " "))
      field = null; // attr_<unknown key>
    else if (byKey.has(syn(h))) field = `${tag}:${byKey.get(syn(h))}`;
    else if (byLabel.has(syn(h))) {
      const keys = byLabel.get(syn(h))!;
      // Variants: prefer the attributes that are variant axes somewhere (Size = clothing size).
      const pick =
        kind === "variants"
          ? keys.filter((k) => defs.find((d) => d.key === k)?.is_variant_axis)
          : keys;
      if (pick.length === 1) field = `${tag}:${pick[0]}`;
      else out.ambiguous.push(header);
    } else if (kind === "products" && LEGACY_IMAGE_COLUMN.test(h)) {
      field = `image:${LEGACY_IMAGE_COLUMN.exec(h)![1]}`;
    }
    if (field && out.headerOf[field] !== undefined) {
      out.duplicates.push(header);
      field = null;
    } else if (field) out.headerOf[field] = header.trim() || field;
    else if (!out.ambiguous.includes(header)) out.unknown.push(header);
    out.columns.push({ index, header, field });
  });
  return out;
}

/** How many headers are recognised — used to find the header row and to tell a Variants sheet from a Products sheet. */
export function knownHeaderCount(cells: string[], kind: SheetKind): number {
  const fixed = fixedLookup(kind);
  const pfx = kind === "products" ? "attr " : "option ";
  return cells.filter((c) => {
    const h = normaliseHeader(c);
    return h && (fixed.has(h) || h.startsWith(pfx));
  }).length;
}

/** A sheet is a variants sheet when it has the variant key columns and no product name/categories. */
export function looksLikeVariants(headers: string[]): boolean {
  const hs = new Set(headers.map(normaliseHeader));
  const hasVariantKey =
    hs.has("product sku") ||
    hs.has("product slug") ||
    hs.has("variant sku") ||
    hs.has("parent sku");
  return hasVariantKey && !hs.has("categories") && !hs.has("category");
}
