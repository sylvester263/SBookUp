// Drives an import from the browser: categories → product batches → variant
// batches → images, with progress and safe cancel between batches. Server calls
// are injected (deps) so this is testable without a network.
import type { BatchRowResult } from "./batch-write";
import type { Issue, MappedRow, MatchBy, ProductPlan, VariantPlan } from "./types";

export const MAX_BATCH_ROWS = 100;
export const MAX_BATCH_BYTES = 900_000; // stays well under serverless body limits

export type FetchedImage =
  | { ok: true; contentType: string; base64: string; bytes: number }
  | { ok: false; message: string };
type BatchCall = (input: {
  fileName: string;
  matchBy: MatchBy;
  headerOf: Record<string, string>;
  rows: MappedRow[];
}) => Promise<{ results: BatchRowResult[]; batchFailed: boolean }>;

export type RunDeps = {
  createCategories: (names: string[]) => Promise<{ created: string[] }>;
  productsBatch: BatchCall;
  variantsBatch: BatchCall;
  fetchImage: (url: string) => Promise<FetchedImage>;
  /** Compress (existing WebP pipeline) and upload; returns the public URL. */
  storeImage: (file: File) => Promise<string>;
  applyImages: (input: {
    products: { id: string; images: string[] }[];
    variants: { id: string; image_url: string | null }[];
  }) => Promise<unknown>;
  finish: (input: FinishInput) => Promise<unknown>;
};

export type Counts = { created: number; updated: number; skipped: number; failed: number };
export type FinishInput = {
  fileName: string;
  matchBy: MatchBy;
  mode: "valid_only" | "all";
  cancelled: boolean;
  products: Counts;
  variants: Counts;
  images: { copied: number; failed: number };
};

export type RunInput = {
  fileName: string;
  matchBy: MatchBy;
  mode: "valid_only" | "all";
  storagePrefix: string;
  categoriesToCreate: string[];
  products?: { rows: MappedRow[]; headerOf: Record<string, string>; plans: ProductPlan[] };
  variants?: { rows: MappedRow[]; headerOf: Record<string, string>; plans: VariantPlan[] };
};

export type RunProgress = {
  phase: "categories" | "products" | "variants" | "images" | "done";
  done: number;
  total: number;
};

export type RunResult = {
  products: Map<number, BatchRowResult>;
  variants: Map<number, BatchRowResult>;
  imageIssues: Issue[];
  counts: { products: Counts; variants: Counts; images: { copied: number; failed: number } };
  cancelled: boolean;
  stoppedBy?: string;
};

/** Rows → batches of at most 100 rows and ~900 KB of JSON. */
export function chunkRows(
  rows: MappedRow[],
  maxRows = MAX_BATCH_ROWS,
  maxBytes = MAX_BATCH_BYTES,
): MappedRow[][] {
  const out: MappedRow[][] = [];
  let cur: MappedRow[] = [];
  let bytes = 0;
  for (const r of rows) {
    const size = JSON.stringify(r).length;
    if (cur.length && (cur.length >= maxRows || bytes + size > maxBytes)) {
      out.push(cur);
      cur = [];
      bytes = 0;
    }
    cur.push(r);
    bytes += size;
  }
  if (cur.length) out.push(cur);
  return out;
}

const NOT_SAVED = "Not saved: another row in the same batch failed";
const ownFailure = (r: BatchRowResult) =>
  r.outcome === "invalid" ||
  r.issues.some(
    (i) => i.level === "error" && i.column === "row" && !i.message.startsWith(NOT_SAVED),
  );

function base64ToFile(b64: string, type: string, name: string): File {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new File([bytes], name, { type });
}

function countOf(results: Map<number, BatchRowResult>, notSent: number): Counts {
  const all = [...results.values()];
  return {
    created: all.filter((r) => r.outcome === "created").length,
    updated: all.filter((r) => r.outcome === "updated").length,
    skipped: all.filter((r) => r.outcome === "skipped").length + notSent,
    failed: all.filter((r) => r.outcome === "invalid" || r.outcome === "failed").length,
  };
}

export async function runImport(
  input: RunInput,
  deps: RunDeps,
  onProgress: (p: RunProgress) => void,
  isCancelled: () => boolean,
): Promise<RunResult> {
  const result: RunResult = {
    products: new Map(),
    variants: new Map(),
    imageIssues: [],
    counts: {
      products: { created: 0, updated: 0, skipped: 0, failed: 0 },
      variants: { created: 0, updated: 0, skipped: 0, failed: 0 },
      images: { copied: 0, failed: 0 },
    },
    cancelled: false,
  };

  // ---- 1. missing categories (admin toggle)
  if (input.categoriesToCreate.length) {
    onProgress({ phase: "categories", done: 0, total: 1 });
    await deps.createCategories(input.categoriesToCreate);
  }

  // ---- 2/3. batches
  const runSheet = async (
    kind: "products" | "variants",
    sheet: {
      rows: MappedRow[];
      headerOf: Record<string, string>;
      plans: (ProductPlan | VariantPlan)[];
    },
    call: BatchCall,
    exclude: Map<number, string>,
  ) => {
    const out = kind === "products" ? result.products : result.variants;
    const sendable = new Set(
      sheet.plans
        .filter((p) => p.status !== "error" && p.action !== "skip" && !exclude.has(p.row))
        .map((p) => p.row),
    );
    for (const p of sheet.plans) {
      if (p.action === "skip") out.set(p.row, { row: p.row, outcome: "skipped", issues: p.issues });
      else if (exclude.has(p.row)) {
        out.set(p.row, {
          row: p.row,
          outcome: "failed",
          issues: [
            ...p.issues,
            {
              row: p.row,
              column: "product_sku",
              value: null,
              level: "error",
              message: exclude.get(p.row)!,
            },
          ],
        });
      }
    }
    const notSent = sheet.plans.filter((p) => p.status === "error").length;
    const batches = chunkRows(sheet.rows.filter((r) => sendable.has(r.rowNumber)));
    let done = 0;
    for (const batch of batches) {
      if (isCancelled()) {
        result.cancelled = true;
        break;
      }
      onProgress({ phase: kind, done, total: batches.length });
      let res = await call({
        fileName: input.fileName,
        matchBy: input.matchBy,
        headerOf: sheet.headerOf,
        rows: batch,
      });
      if (res.batchFailed && input.mode === "valid_only") {
        // Retry once without the rows that failed themselves.
        const bad = new Set(res.results.filter(ownFailure).map((r) => r.row));
        const retry = batch.filter((r) => !bad.has(r.rowNumber));
        for (const r of res.results)
          if (bad.has(r.row))
            out.set(r.row, { ...r, outcome: r.outcome === "invalid" ? "invalid" : "failed" });
        if (retry.length)
          res = await call({
            fileName: input.fileName,
            matchBy: input.matchBy,
            headerOf: sheet.headerOf,
            rows: retry,
          });
        else res = { results: [], batchFailed: false };
      }
      for (const r of res.results) out.set(r.row, r);
      done++;
      if (res.batchFailed && input.mode === "all") {
        result.stoppedBy = `A batch of ${kind} failed and was rolled back, so the import stopped. Rows imported before it are saved.`;
        break;
      }
    }
    onProgress({ phase: kind, done, total: batches.length });
    return notSent;
  };

  let pNotSent = 0;
  if (input.products?.rows.length)
    pNotSent = await runSheet("products", input.products, deps.productsBatch, new Map());
  result.counts.products = countOf(result.products, pNotSent);

  let vNotSent = 0;
  if (input.variants?.rows.length && !result.cancelled && !result.stoppedBy) {
    // Variants whose new parent product (same file) was not saved can't be imported.
    const exclude = new Map<number, string>();
    for (const v of input.variants.plans) {
      if (!v.parentInFile || v.productId) continue;
      const parent = input.products?.plans.find(
        (p) => v.productKey && (p.sku === v.productKey || p.slug === v.productKey),
      );
      const saved =
        parent && ["created", "updated"].includes(result.products.get(parent.row)?.outcome ?? "");
      if (!saved)
        exclude.set(
          v.row,
          `The product in row ${parent?.row ?? "?"} of the Products sheet was not saved`,
        );
    }
    vNotSent = await runSheet("variants", input.variants, deps.variantsBatch, exclude);
  }
  result.counts.variants = countOf(result.variants, vNotSent);

  // ---- 4. images (after the rows are saved; a failed image never fails a product)
  type Task = {
    kind: "product" | "variant";
    id: string;
    row: number;
    column: string;
    sources: string[];
    existing: string[];
  };
  const tasks: Task[] = [];
  for (const p of input.products?.plans ?? []) {
    const r = result.products.get(p.row);
    if (!r?.id || p.images == null || !["created", "updated"].includes(r.outcome)) continue;
    tasks.push({
      kind: "product",
      id: r.id,
      row: p.row,
      column: input.products!.headerOf.images ?? "images",
      sources: p.images,
      existing: p.existingImages,
    });
  }
  for (const v of input.variants?.plans ?? []) {
    const r = result.variants.get(v.row);
    if (!r?.id || v.image === undefined || !["created", "updated"].includes(r.outcome)) continue;
    tasks.push({
      kind: "variant",
      id: r.id,
      row: v.row,
      column: input.variants!.headerOf.image_url ?? "image_url",
      sources: v.image ? [v.image] : [],
      existing: v.existingImage ? [v.existingImage] : [],
    });
  }
  const pending: {
    products: { id: string; images: string[] }[];
    variants: { id: string; image_url: string | null }[];
  } = { products: [], variants: [] };
  const flush = async () => {
    if (!pending.products.length && !pending.variants.length) return;
    const body = { products: pending.products.splice(0), variants: pending.variants.splice(0) };
    await deps.applyImages(body);
  };
  let tDone = 0;
  const work = async (t: Task) => {
    const urls: string[] = [];
    for (const src of t.sources) {
      if (src.startsWith(input.storagePrefix) || t.existing.includes(src)) {
        urls.push(src);
        continue;
      }
      try {
        const got = await deps.fetchImage(src);
        if (!got.ok) throw new Error(got.message);
        const ext = got.contentType.split("/")[1]?.replace("jpeg", "jpg") ?? "img";
        urls.push(
          await deps.storeImage(
            base64ToFile(
              got.base64,
              got.contentType,
              `import-${t.id.slice(0, 8)}-${urls.length + 1}.${ext}`,
            ),
          ),
        );
        result.counts.images.copied++;
      } catch (e) {
        result.counts.images.failed++;
        result.imageIssues.push({
          row: t.row,
          column: t.column,
          value: src,
          level: "warning",
          message: `Image not copied: ${e instanceof Error ? e.message : String(e)}`,
        });
      }
    }
    // All links failed → keep the current images. CLEAR (no sources) empties them.
    const keepOld = t.sources.length > 0 && urls.length === 0;
    if (!keepOld && urls.join("|") !== t.existing.join("|")) {
      if (t.kind === "product") pending.products.push({ id: t.id, images: urls });
      else pending.variants.push({ id: t.id, image_url: urls[0] ?? null });
    }
    if (pending.products.length + pending.variants.length >= 20) await flush();
  };
  for (let i = 0; i < tasks.length; i += 3) {
    if (isCancelled()) {
      result.cancelled = true;
      break;
    }
    onProgress({ phase: "images", done: tDone, total: tasks.length });
    await Promise.all(tasks.slice(i, i + 3).map(work));
    tDone = Math.min(tasks.length, i + 3);
  }
  await flush();
  onProgress({ phase: "done", done: tasks.length, total: tasks.length });

  await deps.finish({
    fileName: input.fileName,
    matchBy: input.matchBy,
    mode: input.mode,
    cancelled: result.cancelled,
    products: result.counts.products,
    variants: result.counts.variants,
    images: result.counts.images,
  });
  return result;
}
