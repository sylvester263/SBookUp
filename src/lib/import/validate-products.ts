// Validates Products-sheet rows and turns them into write payloads. Runs in the
// browser for the preview AND again on the server for every batch (the server
// never trusts the browser's result). Collects every problem of every row.
//
// Update rules: a column that is missing from the sheet, or a blank cell, never
// changes an existing product; "CLEAR" empties a value. New products need name,
// price and categories.
import { effectiveAttributesFor } from "@/lib/catalog-import";
import { buildAttributeSchema, type AttributeCell } from "./attribute-schema";
import { categoryPath, resolveCategories } from "./categories";
import {
  UNSAFE_HTML,
  excelError,
  isClear,
  isbnWarning,
  lostCharactersWarning,
  normaliseIsbn,
  parseBool,
  parseCode,
  parseDate,
  parseNumber,
  shortHash,
  slugify,
  splitList,
  splitUrls,
} from "./coerce";
import { EXAMPLE_SKU_PREFIX, PRODUCT_COLUMNS, type ColumnDef } from "./columns";
import {
  statusOf,
  type ExistingProduct,
  type ImportContext,
  type Issue,
  type MappedRow,
  type MatchBy,
  type ProductPayload,
  type ProductPlan,
} from "./types";

export type ProductValidationOptions = {
  matchBy: MatchBy;
  createMissingCategories: boolean;
  /** field id → header text as typed in the file (for messages and the error report). */
  headerOf: Record<string, string>;
};

const MAX_PRICE = 10_000_000;

type Cell = { kind: "blank" } | { kind: "clear" } | { kind: "value"; raw: string };

/** Reads cells of one row and records issues against the column the admin used. */
export function rowReader(
  row: MappedRow,
  headerOf: Record<string, string>,
  columns: ColumnDef[] = PRODUCT_COLUMNS,
) {
  const defs = new Map(columns.map((c) => [c.key, c]));
  const issues: Issue[] = [];
  const column = (f: string) =>
    headerOf[f] ?? f.replace(/^attr:/, "attr_").replace(/^option:/, "option_");
  const add = (
    level: Issue["level"],
    f: string,
    message: string,
    value: string | null = row.values[f] ?? null,
  ) => issues.push({ row: row.rowNumber, column: column(f), value, message, level });
  const bad = new Set<string>();
  for (const [f, v] of Object.entries(row.values)) {
    const e = excelError(v);
    if (e) {
      add("error", f, e);
      bad.add(f);
    }
  }
  const cell = (f: string, clearable = defs.get(f)?.clearable ?? false): Cell => {
    const v = row.values[f];
    if (v == null || bad.has(f)) return { kind: "blank" };
    if (isClear(v)) {
      if (!clearable) {
        add(
          "error",
          f,
          `${column(f)} can't be cleared — leave the cell blank to keep the current value`,
        );
        return { kind: "blank" };
      }
      return { kind: "clear" };
    }
    return { kind: "value", raw: v };
  };
  return {
    issues,
    column,
    error: (f: string, m: string, v?: string | null) => add("error", f, m, v),
    warn: (f: string, m: string, v?: string | null) => add("warning", f, m, v),
    cell,
    def: (f: string) => defs.get(f),
    has: (f: string) => cell(f).kind !== "blank",
  };
}
export type RowReader = ReturnType<typeof rowReader>;

/** Number cell helper: value | null (CLEAR) | undefined (blank / invalid). */
export function readNumber(
  rd: RowReader,
  f: string,
  opts: { int?: boolean; min?: number; max?: number },
): number | null | undefined {
  const c = rd.cell(f);
  if (c.kind === "blank") return undefined;
  if (c.kind === "clear") return null;
  const n = parseNumber(c.raw, { ...opts, label: rd.column(f) });
  if (n.error) {
    rd.error(f, n.error);
    return undefined;
  }
  return n.value;
}
export function readBool(rd: RowReader, f: string): boolean | undefined {
  const c = rd.cell(f);
  if (c.kind !== "value") return undefined;
  const b = parseBool(c.raw, rd.column(f));
  if (b.error) rd.error(f, b.error);
  return b.value;
}
export function readText(rd: RowReader, f: string): string | null | undefined {
  const c = rd.cell(f);
  if (c.kind === "blank") return undefined;
  if (c.kind === "clear") return null;
  const max = rd.def(f)?.maxLength;
  if (max && c.raw.length > max)
    rd.error(f, `${rd.column(f)} is too long (${c.raw.length} characters, max ${max})`);
  const lost = lostCharactersWarning(c.raw);
  if (lost) rd.warn(f, `${rd.column(f)} ${lost}`);
  return c.raw;
}
export function readCode(rd: RowReader, f: string, label: string): string | null | undefined {
  const c = rd.cell(f);
  if (c.kind === "blank") return undefined;
  if (c.kind === "clear") return null;
  const r = parseCode(c.raw, label);
  if (r.error !== undefined) {
    rd.error(f, r.error);
    return undefined;
  }
  if (r.warning) rd.warn(f, r.warning);
  const max = rd.def(f)?.maxLength ?? 80;
  if (r.value.length > max) rd.error(f, `${label} is too long (max ${max} characters)`);
  return r.value;
}
export function readUrl(rd: RowReader, f: string, u: string): boolean {
  let ok = false;
  try {
    const url = new URL(u);
    ok = url.protocol === "http:" || url.protocol === "https:";
  } catch {
    ok = false;
  }
  if (!ok) rd.error(f, `"${u}" is not a web link (it must start with https://)`, u);
  else if (/drive\.google\.com\/drive\/(u\/\d+\/)?folders\//i.test(u))
    rd.error(f, "This is a Google Drive FOLDER link — use the link of each image file instead", u);
  return ok;
}

const SELL_UNIT: Record<string, "item" | "pack"> = {
  item: "item",
  items: "item",
  piece: "item",
  pieces: "item",
  pcs: "item",
  each: "item",
  single: "item",
  unit: "item",
  pack: "pack",
  packs: "pack",
  packet: "pack",
  box: "pack",
  set: "pack",
  bundle: "pack",
};

const effective = (p: ExistingProduct) =>
  p.sale_price != null && Number(p.sale_price) < Number(p.price)
    ? Number(p.sale_price)
    : Number(p.price);
const sameStored = (stored: unknown, raw: string) => {
  const s = Array.isArray(stored) ? stored.join("|") : stored == null ? "" : String(stored);
  return s.trim().toLowerCase() === raw.trim().toLowerCase();
};
const describe = (p: ExistingProduct) => `"${p.name}"${p.sku ? ` (SKU ${p.sku})` : ""}`;

export function planProducts(
  rows: MappedRow[],
  ctx: ImportContext,
  existing: ExistingProduct[],
  opts: ProductValidationOptions,
): ProductPlan[] {
  const bySku = new Map<string, ExistingProduct>();
  const bySlug = new Map<string, ExistingProduct>();
  const byIsbn = new Map<string, ExistingProduct[]>();
  for (const p of existing) {
    if (p.sku) bySku.set(p.sku, p);
    bySlug.set(p.slug, p);
    if (p.isbn)
      byIsbn.set(normaliseIsbn(p.isbn), [...(byIsbn.get(normaliseIsbn(p.isbn)) ?? []), p]);
  }
  const usedSlugs = new Set<string>();
  const catById = new Map(ctx.categories.map((c) => [c.id, c]));

  const plans = rows.map((row): ProductPlan => {
    const rd = rowReader(row, opts.headerOf);
    const plan: ProductPlan = {
      row: row.rowNumber,
      status: "ok",
      action: "create",
      name: null,
      sku: null,
      slug: null,
      issues: rd.issues,
      images: null,
      existingImages: [],
      newOptions: {},
      categoriesToCreate: [],
      categoryIds: [],
    };
    const set: ProductPayload["set"] = {};

    // ---- identity
    const sku = readCode(rd, "sku", "SKU");
    plan.sku = sku ?? null;
    if (sku && sku.toUpperCase().startsWith(EXAMPLE_SKU_PREFIX)) {
      rd.warn("sku", "Example row from the template — skipped");
      plan.status = "skipped";
      plan.action = "skip";
      return plan;
    }
    const isbn = readCode(rd, "isbn", "ISBN");
    if (isbn) {
      const w = isbnWarning(isbn);
      if (w) rd.warn("isbn", w);
    }
    const name = readText(rd, "name");
    plan.name = name ?? null;
    const slugCell = rd.cell("slug");
    let explicitSlug: string | undefined;
    if (slugCell.kind === "value") {
      explicitSlug = slugify(slugCell.raw);
      if (!explicitSlug) rd.error("slug", "slug must contain letters a-z or numbers");
      else if (explicitSlug !== slugCell.raw.trim().toLowerCase())
        rd.warn("slug", `slug will be saved as "${explicitSlug}"`);
    }
    const autoSlug = name ? slugify(name) : "";

    // ---- match an existing product
    let match: ExistingProduct | undefined;
    const order: ("sku" | "isbn" | "slug")[] =
      opts.matchBy === "auto" ? ["sku", "isbn", "slug"] : [opts.matchBy];
    for (const key of order) {
      let cand: ExistingProduct | undefined;
      if (key === "sku") cand = sku ? bySku.get(sku) : undefined;
      else if (key === "isbn" && isbn) {
        const list = byIsbn.get(normaliseIsbn(isbn)) ?? [];
        if (list.length > 1) {
          // Auto mode falls through to the slug; "Match by ISBN" can't choose.
          if (opts.matchBy === "isbn")
            rd.error(
              "isbn",
              `ISBN matches ${list.length} products (${list.map(describe).join(", ")}) — add the SKU to say which one`,
            );
          continue;
        }
        cand = list[0];
      } else if (key === "slug") cand = bySlug.get(explicitSlug || autoSlug);
      // In auto mode a fallback match must not belong to a product with another SKU.
      if (cand && opts.matchBy === "auto" && key !== "sku" && sku && cand.sku && cand.sku !== sku) {
        if (key === "isbn")
          rd.warn(
            "isbn",
            `This ISBN is also on ${describe(cand)} — a new product will be created for SKU ${sku}`,
          );
        cand = undefined;
      }
      if (cand) {
        match = cand;
        plan.matchedBy = key;
        break;
      }
    }
    if (opts.matchBy !== "auto" && !match) {
      const key = opts.matchBy;
      if (
        (key === "sku" && !sku) ||
        (key === "isbn" && !isbn) ||
        (key === "slug" && !explicitSlug && !autoSlug)
      ) {
        rd.error(
          key === "slug" ? "slug" : key,
          `${key.toUpperCase()} is empty — it is needed to find the product (Match by ${key.toUpperCase()})`,
        );
      }
    }
    const isCreate = !match;
    plan.action = isCreate ? "create" : "update";
    plan.productId = match?.id;
    plan.existingImages = match?.images ?? [];

    // ---- name / slug / codes
    if (name !== undefined && name !== null) set.name = name;
    if (isCreate && !name) rd.error("name", "name is required for new products", null);
    if (isCreate) {
      let slug = explicitSlug;
      if (slug && bySlug.has(slug)) {
        rd.error("slug", `slug "${slug}" is already used by ${describe(bySlug.get(slug)!)}`);
      } else if (!slug && name) {
        let base = autoSlug;
        if (!base) {
          base = sku ? slugify(sku) : "";
          base = base || `item-${shortHash(name)}`;
          rd.warn(
            "name",
            `The name has no English letters, so the web address was set to "${base}". Add a slug column to choose it`,
          );
        }
        slug = base;
        for (let n = 2; bySlug.has(slug) || usedSlugs.has(slug); n++) slug = `${base}-${n}`;
        if (slug !== base)
          rd.warn("slug", `"${base}" is already used, so the web address will be "${slug}"`);
      }
      if (slug) {
        usedSlugs.add(slug);
        set.slug = slug;
        plan.slug = slug;
      }
    } else {
      plan.slug = match!.slug;
      if (explicitSlug && explicitSlug !== match!.slug) {
        const other = bySlug.get(explicitSlug);
        if (other && other.id !== match!.id)
          rd.error("slug", `slug "${explicitSlug}" is already used by ${describe(other)}`);
        else {
          set.slug = explicitSlug;
          plan.slug = explicitSlug;
          rd.warn(
            "slug",
            `The web address changes from "${match!.slug}" to "${explicitSlug}" — old links will stop working`,
          );
        }
      }
    }
    if (sku !== undefined && (isCreate || sku !== match!.sku)) {
      const other = sku ? bySku.get(sku) : undefined;
      if (other && other.id !== match?.id)
        rd.error("sku", `SKU ${sku} is already used by ${describe(other)}`);
      else set.sku = sku;
    }
    // Same digits as stored (e.g. matched by ISBN) → keep the stored formatting.
    if (
      isbn !== undefined &&
      (isCreate ||
        isbn === null ||
        !match!.isbn ||
        normaliseIsbn(isbn) !== normaliseIsbn(match!.isbn))
    ) {
      set.isbn = isbn;
    }
    for (const f of ["brand", "edition"] as const) {
      const t = readText(rd, f);
      if (t !== undefined) set[f] = t;
    }

    // ---- categories
    let categoryIds = match?.category_ids ?? [];
    let categoriesChanged = false;
    const catCell = rd.cell("categories");
    if (catCell.kind === "value") {
      const res = resolveCategories(catCell.raw, ctx.categories);
      for (const u of res.unknown) {
        if (opts.createMissingCategories) {
          plan.categoriesToCreate.push(u.token);
          rd.warn("categories", `Category "${u.token}" doesn't exist yet — it will be created`);
        } else {
          rd.error(
            "categories",
            `Unknown category "${u.token}".${u.suggestions.length ? ` Did you mean: ${u.suggestions.join(", ")}?` : ""} Use a slug from the Instructions sheet`,
          );
        }
      }
      for (const id of res.ids) {
        const c = catById.get(id);
        if (c && c.is_active === false)
          rd.warn("categories", `Category "${c.name}" is hidden on the website`);
      }
      if (!res.unknown.length || opts.createMissingCategories) {
        categoriesChanged = isCreate || res.ids.join() !== categoryIds.join();
        categoryIds = res.ids;
      }
    }
    if (
      isCreate &&
      !categoryIds.length &&
      !plan.categoriesToCreate.length &&
      catCell.kind !== "value"
    ) {
      rd.error(
        "categories",
        'categories is required for new products (slugs separated by "|", main category first)',
        null,
      );
    }
    plan.categoryIds = categoryIds;
    const primary = categoryIds[0] ? catById.get(categoryIds[0]) : undefined;

    // ---- prices
    const price = readNumber(rd, "price", { min: 0, max: MAX_PRICE });
    const sale = readNumber(rd, "sale_price", { min: 0, max: MAX_PRICE });
    const compare = readNumber(rd, "compare_at_price", { min: 0, max: MAX_PRICE });
    const cost = readNumber(rd, "cost_price", { min: 0, max: MAX_PRICE });
    if (compare != null) {
      const pay = price ?? (match ? effective(match) : undefined);
      if (sale !== undefined)
        rd.error("compare_at_price", "Fill either sale_price or compare_at_price, not both");
      else if (pay == null) rd.error("price", "price is required for new products", null);
      else if (compare <= pay)
        rd.error(
          "compare_at_price",
          `compare_at_price (${compare}) must be higher than price (${pay}), the price the customer pays`,
        );
      else {
        set.price = compare;
        set.sale_price = pay;
      }
    } else if (compare === null) {
      if (match && sale === undefined) {
        set.price = price ?? effective(match);
        set.sale_price = null;
      }
    } else {
      if (price != null) set.price = price;
      if (sale !== undefined) set.sale_price = sale;
      if (isCreate && price == null && !rd.issues.some((i) => i.column === rd.column("price")))
        rd.error("price", "price is required for new products", null);
    }
    const finalPrice = (set.price as number | undefined) ?? match?.price;
    const finalSale = "sale_price" in set ? (set.sale_price as number | null) : match?.sale_price;
    if (
      finalSale != null &&
      finalPrice != null &&
      Number(finalSale) >= Number(finalPrice) &&
      (price !== undefined || sale !== undefined)
    ) {
      rd.warn(
        "sale_price",
        `sale_price (${finalSale}) is not lower than price (${finalPrice}), so no discount will show`,
      );
    }
    if (cost !== undefined) set.cost_price = cost;
    if (cost != null && finalPrice != null && cost > Number(finalPrice))
      rd.warn(
        "cost_price",
        `cost_price (${cost}) is higher than the selling price (${finalPrice})`,
      );

    // ---- numbers / flags / dates
    const stock = readNumber(rd, "stock_quantity", { int: true, min: 0, max: 10_000_000 });
    if (stock != null) set.stock_quantity = stock;
    const low = readNumber(rd, "low_stock_threshold", { int: true, min: 0, max: 1_000_000 });
    if (low != null) set.low_stock_threshold = low;
    const weight = readNumber(rd, "weight_grams", { int: true, min: 0, max: 1_000_000 });
    if (weight !== undefined) set.weight_grams = weight;
    for (const f of ["is_active", "is_featured", "is_new_arrival"] as const) {
      const b = readBool(rd, f);
      if (b !== undefined) set[f] = b;
    }
    const until = rd.cell("new_arrival_until");
    if (until.kind === "clear") set.new_arrival_until = null;
    else if (until.kind === "value") {
      const d = parseDate(until.raw, rd.column("new_arrival_until"));
      if (d.error !== undefined) rd.error("new_arrival_until", d.error);
      else {
        set.new_arrival_until = d.value;
        if (d.warning) rd.warn("new_arrival_until", d.warning);
      }
    }
    const tags = rd.cell("tags");
    if (tags.kind === "clear") set.tags = [];
    else if (tags.kind === "value") {
      const list = splitList(tags.raw, { commas: true });
      if (list.length > 20) rd.error("tags", `At most 20 tags (found ${list.length})`);
      const long = list.find((t) => t.length > 40);
      if (long) rd.error("tags", `Tag "${long}" is too long (max 40 characters)`);
      set.tags = list;
    }
    const desc = readText(rd, "description");
    if (desc !== undefined) {
      set.description = desc;
      if (desc && UNSAFE_HTML.test(desc))
        rd.warn(
          "description",
          "The description contains scripts or event handlers — they are removed when shown on the website",
        );
    }

    // ---- pack pricing (defaults from the main category)
    const suCell = rd.cell("sell_unit");
    let sellUnit: "item" | "pack" | undefined;
    if (suCell.kind === "value") {
      sellUnit = SELL_UNIT[suCell.raw.trim().toLowerCase()];
      if (!sellUnit)
        rd.error("sell_unit", `sell_unit must be "item" or "pack" (got "${suCell.raw}")`);
    }
    const packSize = readNumber(rd, "pack_size", { int: true, min: 2, max: 1000 });
    const unitLabel = readText(rd, "unit_label");
    if (isCreate || sellUnit || packSize != null || unitLabel !== undefined) {
      const unit =
        sellUnit ??
        (isCreate
          ? ((primary?.default_sell_unit as "item" | "pack" | null) ?? "item")
          : (match!.sell_unit as "item" | "pack"));
      if (unit === "pack") {
        const size =
          packSize ??
          (isCreate || sellUnit ? null : match!.pack_size) ??
          primary?.default_pack_size ??
          null;
        if (!size)
          rd.error(
            "pack_size",
            "pack_size is required for pack products (this category has no default pack size)",
            null,
          );
        set.sell_unit = "pack";
        set.pack_size = size;
        set.unit_label =
          unitLabel !== undefined
            ? unitLabel
            : (match?.unit_label ?? primary?.default_unit_label ?? null);
      } else {
        if (packSize != null)
          rd.warn("pack_size", "pack_size is ignored because this product is sold per item");
        set.sell_unit = "item";
        set.pack_size = null;
        set.unit_label = null;
      }
    }

    // ---- images (copied to storage after the rows are saved)
    const imgCell = rd.cell("images");
    if (imgCell.kind === "clear") plan.images = [];
    else {
      let urls: string[] = [];
      if (imgCell.kind === "value") urls = splitUrls(imgCell.raw);
      else {
        const legacy = Object.keys(row.values)
          .filter((f) => f.startsWith("image:"))
          .sort();
        for (const f of legacy) {
          const c = rd.cell(f, true);
          if (c.kind === "value") urls.push(...splitUrls(c.raw));
        }
      }
      if (urls.length) {
        const field =
          imgCell.kind === "value"
            ? "images"
            : (Object.keys(row.values).find((f) => f.startsWith("image:")) ?? "images");
        const okUrls = urls.filter((u) => readUrl(rd, field, u));
        if (okUrls.length > 10)
          rd.error(field, `At most 10 images per product (found ${okUrls.length})`);
        plan.images = okUrls;
      }
    }

    // ---- attributes (validated against the final categories, incl. inherited)
    const applicable = effectiveAttributesFor(categoryIds, ctx);
    const attrInput: Record<string, string | null> = {};
    const unset: string[] = [];
    for (const f of Object.keys(row.values).filter((k) => k.startsWith("attr:"))) {
      const key = f.slice(5);
      const c = rd.cell(f, true);
      if (c.kind === "blank") continue;
      const raw = c.kind === "clear" ? "CLEAR" : c.raw;
      // Unchanged values (e.g. an export uploaded again) are never re-validated.
      if (c.kind === "value" && match && sameStored(match.attributes?.[key], raw)) continue;
      const def = applicable.find((a) => a.key === key);
      if (!def) {
        if (c.kind === "clear") unset.push(key);
        else if (!(match && sameStored(match.attributes?.[key], raw))) {
          const label = ctx.definitions.find((d) => d.key === key)?.label ?? key;
          const where =
            categoryIds.map((id) => categoryPath(id, ctx.categories)).join(", ") || "no category";
          rd.error(f, `"${label}" doesn't apply to ${where} — leave this cell blank`);
        }
      } else if (def.variant_axis) {
        if (!(match && sameStored(match.attributes?.[key], raw)))
          rd.warn(f, `${def.label} is chosen per variant here — put it in the Variants sheet`);
      } else attrInput[key] = raw;
    }
    const built = buildAttributeSchema(applicable, {
      isCreate,
      existing: match?.attributes ?? null,
      categoriesChanged,
    });
    const parsed = built.schema.safeParse(attrInput);
    const attributesSet: Record<string, unknown> = {};
    if (!parsed.success) {
      for (const iss of parsed.error.issues) {
        const key = String(iss.path[0] ?? "");
        rd.error(`attr:${key}`, iss.message, attrInput[key] ?? null);
      }
    } else {
      for (const [k, v] of Object.entries(
        parsed.data as Record<string, AttributeCell | undefined>,
      )) {
        if (v?.unset) unset.push(k);
        else if (v?.set !== undefined) attributesSet[k] = v.set;
      }
      if (!isCreate && !categoriesChanged) {
        const missing = built.missingRequired(
          parsed.data as Record<string, AttributeCell | undefined>,
        );
        if (missing.length)
          rd.warn(
            "categories",
            `Required for this category but empty on the product: ${missing.join(", ")}`,
            null,
          );
      }
    }
    plan.newOptions = built.newOptions;

    plan.payload = {
      row: row.rowNumber,
      id: match?.id ?? null,
      set,
      attributes_set: attributesSet,
      attributes_unset: unset,
      category_ids: categoriesChanged ? categoryIds : null,
    };
    plan.status = statusOf(rd.issues);
    return plan;
  });

  // ---- duplicates inside the file (every involved row gets the error)
  const live = plans.filter((p) => p.action !== "skip");
  const dupes = (
    key: (p: ProductPlan) => string | null | undefined,
    column: (p: ProductPlan) => string,
    what: string,
    level: Issue["level"] = "error",
  ) => {
    const groups = new Map<string, ProductPlan[]>();
    for (const p of live) {
      const k = key(p);
      if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    for (const [k, list] of groups) {
      if (list.length < 2) continue;
      for (const p of list) {
        const others = list
          .filter((o) => o !== p)
          .map((o) => o.row)
          .join(", ");
        p.issues.push({
          row: p.row,
          column: column(p),
          value: k,
          message: `${what} "${k}" is also used in row ${others}`,
          level,
        });
      }
    }
  };
  const col = (f: string) => opts.headerOf[f] ?? f;
  dupes(
    (p) => (p.payload?.set.sku as string | undefined) ?? (p.action === "update" ? null : p.sku),
    () => col("sku"),
    "SKU",
  );
  dupes(
    (p) => (p.action === "create" || p.payload?.set.slug ? p.slug : null),
    () => col("slug"),
    "slug",
  );
  dupes(
    (p) => p.productId,
    () => col(opts.matchBy === "auto" ? "sku" : opts.matchBy),
    "The same existing product",
  );
  dupes(
    (p) => (p.payload?.set.isbn ? normaliseIsbn(String(p.payload.set.isbn)) : null),
    () => col("isbn"),
    "ISBN",
    "warning",
  );
  for (const p of plans) if (p.action !== "skip") p.status = statusOf(p.issues);
  return plans;
}

/** New attribute options of the rows that will be written, merged by key. */
export function collectNewOptions(
  plans: { newOptions: Record<string, string[]>; status: string }[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const p of plans) {
    if (p.status === "error" || p.status === "skipped") continue;
    for (const [k, vals] of Object.entries(p.newOptions))
      out[k] = Array.from(new Set([...(out[k] ?? []), ...vals]));
  }
  return out;
}
