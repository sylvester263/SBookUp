// Server side of one import batch: re-validate the rows against the live
// catalog (the browser preview is never trusted), then write the valid ones in
// ONE transaction through public.import_products_batch / import_variants_batch.
// Takes the caller's Supabase client so it runs with their own (staff) session;
// used by the server functions and by the end-to-end test.
import type { Json } from "@/integrations/supabase/types";
import {
  dbIssue,
  loadImportContext,
  lookupProducts,
  lookupVariants,
  parseBatchFailure,
  productLookupKeys,
  type Db,
} from "./server-helpers";
import type { Issue, MappedRow, MatchBy, ProductPlan, VariantPlan } from "./types";
import { collectNewOptions, planProducts } from "./validate-products";
import { planVariants } from "./validate-variants";

export type RowOutcome = "created" | "updated" | "skipped" | "invalid" | "failed";
export type BatchRowResult = {
  row: number;
  outcome: RowOutcome;
  id?: string;
  slug?: string | null;
  sku?: string | null;
  issues: Issue[];
};
export type BatchInput = {
  fileName: string;
  matchBy: MatchBy;
  headerOf: Record<string, string>;
  rows: MappedRow[];
};
export type BatchOutput = { results: BatchRowResult[]; batchFailed: boolean };

const ROLLED_BACK = "Not saved: another row in the same batch failed, so the batch was rolled back";

async function write(
  db: Db,
  fn: "import_products_batch" | "import_variants_batch",
  plans: (ProductPlan | VariantPlan)[],
  toWrite: (ProductPlan | VariantPlan)[],
  base: (p: ProductPlan | VariantPlan) => Omit<BatchRowResult, "outcome" | "issues">,
): Promise<BatchOutput> {
  const results = new Map<number, BatchRowResult>(
    plans.map((p) => [
      p.row,
      {
        ...base(p),
        outcome: p.status === "error" ? "invalid" : p.action === "skip" ? "skipped" : "failed",
        issues: p.issues,
      },
    ]),
  );
  let batchFailed = false;
  if (toWrite.length) {
    const { data: out, error } = await db.rpc(fn, {
      p_rows: toWrite.map((p) => p.payload) as unknown as Json,
      p_new_options: collectNewOptions(toWrite) as unknown as Json,
    });
    if (error) {
      batchFailed = true;
      const rowErrors = parseBatchFailure(error);
      if (!rowErrors) throw new Error(error.message);
      const failedRows = new Set(rowErrors.map((e) => e.row));
      for (const e of rowErrors) results.get(e.row)?.issues.push(dbIssue(e));
      for (const p of toWrite) {
        if (!failedRows.has(p.row)) {
          results.get(p.row)?.issues.push({
            row: p.row,
            column: "row",
            value: null,
            level: "error",
            message: ROLLED_BACK,
          });
        }
      }
    } else {
      for (const r of (out ?? []) as unknown as {
        row: number;
        id: string;
        action: "created" | "updated";
      }[]) {
        const res = results.get(r.row);
        if (res) Object.assign(res, { outcome: r.action, id: r.id });
      }
    }
  }
  return { results: plans.map((p) => results.get(p.row)!), batchFailed };
}

export async function writeProductsBatch(db: Db, input: BatchInput): Promise<BatchOutput> {
  const ctx = await loadImportContext(db);
  const existing = await lookupProducts(db, productLookupKeys(input.rows));
  const plans = planProducts(input.rows, ctx, existing, {
    matchBy: input.matchBy,
    createMissingCategories: false, // created before the first batch (admin toggle)
    headerOf: input.headerOf,
  });
  const toWrite = plans.filter((p) => p.status !== "error" && p.action !== "skip" && p.payload);
  return write(db, "import_products_batch", plans, toWrite, (p) => ({
    row: p.row,
    slug: (p as ProductPlan).slug,
    sku: (p as ProductPlan).sku,
  }));
}

export async function writeVariantsBatch(db: Db, input: BatchInput): Promise<BatchOutput> {
  const ctx = await loadImportContext(db);
  const products = await lookupProducts(db, productLookupKeys(input.rows));
  const variants = await lookupVariants(db, {
    product_ids: products.map((p) => p.id),
    skus: input.rows.map((r) => r.values.variant_sku).filter((s): s is string => !!s),
  });
  const plans = planVariants(input.rows, ctx, products, variants, [], { headerOf: input.headerOf });
  const toWrite = plans.filter(
    (p) => p.status !== "error" && p.action !== "skip" && p.payload?.product_id,
  );
  return write(db, "import_variants_batch", plans, toWrite, (p) => ({
    row: p.row,
    sku: (p as VariantPlan).variantSku,
  }));
}
