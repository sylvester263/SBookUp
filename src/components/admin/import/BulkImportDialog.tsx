// Bulk import / export of products and variants (Excel or CSV).
// Step 1 upload → Step 2 preview (every row checked, nothing written) → Step 3
// import in batches with progress and cancel → summary + error report.
// Parsing, validation and the batch runner live in src/lib/import/ (tested).
import { useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { adminGetUploadUrl } from "@/lib/admin.functions";
import {
  importApplyImages,
  importContext,
  importCreateCategories,
  importExportData,
  importFetchImage,
  importFinish,
  importLookup,
  importProductsBatch,
  importVariantsBatch,
  type BatchRowResult,
} from "@/lib/import/import.functions";
import { resolveHeaders, type HeaderResult } from "@/lib/import/headers";
import { isBlankRow, mapRows } from "@/lib/import/map-rows";
import type { SheetData } from "@/lib/import/read-workbook";
import { runImport, type RunProgress, type RunResult } from "@/lib/import/run-import";
import { productLookupKeys } from "@/lib/import/server-helpers";
import {
  summarise,
  type ExistingProduct,
  type ExistingVariant,
  type ImportContext,
  type Issue,
  type MappedRow,
  type MatchBy,
  type ProductPlan,
  type RowStatus,
  type VariantPlan,
} from "@/lib/import/types";
import { planProducts } from "@/lib/import/validate-products";
import { planVariants } from "@/lib/import/validate-variants";

type SheetPrep = { sheet: SheetData; headers: HeaderResult; rows: MappedRow[] };
type Prepared = {
  fileName: string;
  warnings: string[];
  products?: SheetPrep;
  variants?: SheetPrep;
};
type Step = "upload" | "preview" | "importing" | "done";
type Ctx = ImportContext & { isAdmin: boolean; storagePrefix: string };

const CODE_FIELDS = new Set(["sku", "isbn", "product_sku", "variant_sku"]);
const today = () => new Date().toISOString().slice(0, 10);

export function BulkImportDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const ctxFn = useServerFn(importContext);
  const lookupFn = useServerFn(importLookup);
  const createCatsFn = useServerFn(importCreateCategories);
  const productsFn = useServerFn(importProductsBatch);
  const variantsFn = useServerFn(importVariantsBatch);
  const fetchImageFn = useServerFn(importFetchImage);
  const applyImagesFn = useServerFn(importApplyImages);
  const finishFn = useServerFn(importFinish);
  const exportFn = useServerFn(importExportData);
  const uploadUrlFn = useServerFn(adminGetUploadUrl);
  const ctxQ = useQuery({
    queryKey: ["import-context"],
    queryFn: () => ctxFn() as Promise<Ctx>,
    enabled: open,
    staleTime: 0,
  });
  const ctx = ctxQ.data;

  const [step, setStep] = useState<Step>("upload");
  const [busy, setBusy] = useState<"" | "reading" | "template" | "export" | "report">("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [existing, setExisting] = useState<{
    products: ExistingProduct[];
    variants: ExistingVariant[];
  }>({ products: [], variants: [] });
  const [matchBy, setMatchBy] = useState<MatchBy>("auto");
  const [createMissing, setCreateMissing] = useState(false);
  const [mode, setMode] = useState<"valid_only" | "all">("valid_only");
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const [run, setRun] = useState<RunResult | null>(null);
  const cancelRef = useRef(false);
  const [cancelling, setCancelling] = useState(false);

  const plans = useMemo(() => {
    if (!prepared || !ctx) return null;
    const productPlans = prepared.products
      ? planProducts(prepared.products.rows, ctx, existing.products, {
          matchBy,
          createMissingCategories: createMissing && ctx.isAdmin,
          headerOf: prepared.products.headers.headerOf,
        })
      : [];
    const variantPlans = prepared.variants
      ? planVariants(
          prepared.variants.rows,
          ctx,
          existing.products,
          existing.variants,
          productPlans,
          { headerOf: prepared.variants.headers.headerOf },
        )
      : [];
    return { products: productPlans, variants: variantPlans };
  }, [prepared, ctx, existing, matchBy, createMissing]);

  function reset() {
    setStep("upload");
    setPrepared(null);
    setRun(null);
    setProgress(null);
    setFileError(null);
    cancelRef.current = false;
    setCancelling(false);
  }

  async function onFile(file: File | undefined) {
    if (!file || !ctx) return;
    setFileError(null);
    setBusy("reading");
    try {
      const { readWorkbook } = await import("@/lib/import/read-workbook");
      const wb = readWorkbook(await file.arrayBuffer(), file.name, "products");
      const warnings = [...wb.warnings];
      const prep = (
        sheet: SheetData | undefined,
        kind: "products" | "variants",
      ): SheetPrep | undefined => {
        if (!sheet) return undefined;
        const headers = resolveHeaders(sheet.headers, kind, ctx.definitions);
        const label = `Sheet "${sheet.sheetName}"`;
        if (headers.unknown.filter(Boolean).length)
          warnings.push(
            `${label}: these columns were not recognised and are ignored: ${headers.unknown.filter(Boolean).join(", ")}. Check the spelling against the template.`,
          );
        if (headers.duplicates.length)
          warnings.push(
            `${label}: duplicate columns ignored (the first one is used): ${headers.duplicates.join(", ")}.`,
          );
        if (headers.ambiguous.length)
          warnings.push(
            `${label}: "${headers.ambiguous.join('", "')}" could mean more than one attribute — use the attr_… / option_… column name from the template.`,
          );
        const rows = mapRows(sheet.rows, headers).filter((r) => !isBlankRow(r));
        return { sheet, headers, rows };
      };
      const p: Prepared = {
        fileName: file.name,
        warnings,
        products: prep(wb.products, "products"),
        variants: prep(wb.variants, "variants"),
      };
      if (
        p.products &&
        !["name", "sku", "slug", "isbn"].some((f) => p.products!.headers.headerOf[f])
      ) {
        throw new Error(
          'The Products sheet needs at least a "name", "sku", "slug" or "isbn" column. Download the template to see the expected columns.',
        );
      }
      const allRows = [...(p.products?.rows ?? []), ...(p.variants?.rows ?? [])];
      const keys = productLookupKeys(allRows);
      const variantSkus = (p.variants?.rows ?? [])
        .map((r) => r.values.variant_sku)
        .filter((s): s is string => !!s);
      const found = await lookupFn({ data: { ...keys, variantSkus } });
      setExisting({
        products: found.products as ExistingProduct[],
        variants: found.variants as ExistingVariant[],
      });
      setPrepared(p);
      setStep("preview");
    } catch (e) {
      setFileError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy("");
    }
  }

  async function downloadTemplate() {
    if (!ctx) return;
    setBusy("template");
    try {
      const x = await import("@/lib/import/xlsx-write");
      x.downloadBlob(
        await x.workbookToBlob(await x.buildTemplateWorkbook(ctx)),
        "products-import-template.xlsx",
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Template failed");
    } finally {
      setBusy("");
    }
  }

  async function downloadExport() {
    if (!ctx) return;
    setBusy("export");
    try {
      const data = await exportFn();
      const x = await import("@/lib/import/xlsx-write");
      const { wb, sheets } = await x.buildExportWorkbook(ctx, data.products, data.variants);
      x.downloadBlob(await x.workbookToBlob(wb), `products-export-${today()}.xlsx`);
      if (sheets.products.tooLong.length)
        toast.warning(
          `${sheets.products.tooLong.length} description(s) are too long for Excel and were left blank (blank keeps them unchanged on import).`,
        );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy("");
    }
  }

  /** Original rows that have errors (or failed during the import) + errors / warnings columns. */
  async function downloadReport() {
    if (!prepared || !plans) return;
    setBusy("report");
    try {
      const x = await import("@/lib/import/xlsx-write");
      const sheetFor = (
        name: string,
        prep: SheetPrep | undefined,
        list: (ProductPlan | VariantPlan)[],
        results?: Map<number, BatchRowResult>,
        extra: Issue[] = [],
      ) => {
        if (!prep) return null;
        const byRow = new Map(prep.sheet.rows.map((r) => [r.rowNumber, r.cells]));
        const rows = list
          .map((p) => {
            const res = results?.get(p.row);
            const issues = dedupe([
              ...p.issues,
              ...(res?.issues ?? []),
              ...extra.filter((i) => i.row === p.row),
            ]);
            const failed = res
              ? res.outcome === "failed" || res.outcome === "invalid"
              : p.status === "error";
            return failed ? { rowNumber: p.row, cells: byRow.get(p.row) ?? [], issues } : null;
          })
          .filter((r): r is NonNullable<typeof r> => !!r);
        const textColumns = prep.headers.columns
          .filter((c) => c.field && CODE_FIELDS.has(c.field))
          .map((c) => c.index + 1);
        return { name, headers: prep.sheet.headers, textColumns, rows };
      };
      const sheets = [
        sheetFor("Products", prepared.products, plans.products, run?.products, run?.imageIssues),
        sheetFor("Variants", prepared.variants, plans.variants, run?.variants, run?.imageIssues),
      ].filter((s): s is NonNullable<typeof s> => !!s);
      const base = prepared.fileName.replace(/\.[^.]+$/, "");
      x.downloadBlob(
        await x.workbookToBlob(await x.buildErrorReportWorkbook(sheets)),
        `${base}-errors.xlsx`,
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Report failed");
    } finally {
      setBusy("");
    }
  }

  async function startImport() {
    if (!prepared || !plans || !ctx) return;
    cancelRef.current = false;
    setCancelling(false);
    setStep("importing");
    setProgress({ phase: "products", done: 0, total: 1 });
    const categoriesToCreate =
      createMissing && ctx.isAdmin
        ? Array.from(
            new Set(
              plans.products
                .filter((p) => p.status !== "error")
                .flatMap((p) => p.categoriesToCreate),
            ),
          )
        : [];
    try {
      const result = await runImport(
        {
          fileName: prepared.fileName,
          matchBy,
          mode,
          storagePrefix: ctx.storagePrefix,
          categoriesToCreate,
          products: prepared.products && {
            rows: prepared.products.rows,
            headerOf: prepared.products.headers.headerOf,
            plans: plans.products,
          },
          variants: prepared.variants && {
            rows: prepared.variants.rows,
            headerOf: prepared.variants.headers.headerOf,
            plans: plans.variants,
          },
        },
        {
          createCategories: (names) => createCatsFn({ data: { names } }),
          productsBatch: (input) => productsFn({ data: input }),
          variantsBatch: (input) => variantsFn({ data: input }),
          fetchImage: (url) => fetchImageFn({ data: { url } }),
          storeImage: async (file) => {
            const { prepareUpload, toWebpPath } = await import("@/lib/image-upload");
            const { blob, contentType } = await prepareUpload(file);
            const { token, path, publicUrl } = await uploadUrlFn({
              data: { bucket: "product-images", filename: toWebpPath(file.name) },
            });
            const { error } = await supabase.storage
              .from("product-images")
              .uploadToSignedUrl(path, token, blob, { contentType });
            if (error) throw error;
            return publicUrl;
          },
          applyImages: (input) => applyImagesFn({ data: input }),
          finish: (input) => finishFn({ data: input }),
        },
        setProgress,
        () => cancelRef.current,
      );
      setRun(result);
      setStep("done");
      onImported();
    } catch (e) {
      toast.error(
        `Import stopped: ${e instanceof Error ? e.message : String(e)}. Rows saved before this point are kept.`,
      );
      setStep("preview");
    }
  }

  const productSummary = plans ? summarise(plans.products) : null;
  const variantSummary = plans ? summarise(plans.variants) : null;
  const errorCount = (productSummary?.errors ?? 0) + (variantSummary?.errors ?? 0);
  const importable =
    (productSummary ? productSummary.create + productSummary.update : 0) +
    (variantSummary ? variantSummary.create + variantSummary.update : 0);
  const pendingCategories = plans
    ? Array.from(new Set(plans.products.flatMap((p) => p.categoriesToCreate)))
    : [];

  return (
    <Dialog open={open} onOpenChange={(o) => !o && step !== "importing" && (reset(), onClose())}>
      <DialogContent className="sm:max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Bulk import / export products</DialogTitle>
          <DialogDescription>
            Excel (.xlsx, .xls) or CSV. Nothing is saved until you check the preview and press
            Import.
          </DialogDescription>
        </DialogHeader>
        <Steps step={step} />

        {ctxQ.isLoading && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading categories…
          </div>
        )}
        {ctxQ.error && (
          <div className="text-sm text-red-700">
            Could not load categories: {(ctxQ.error as Error).message}
          </div>
        )}

        {ctx && step === "upload" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={downloadTemplate} disabled={busy !== ""}>
                {busy === "template" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <FileSpreadsheet className="h-4 w-4 mr-1" />
                )}{" "}
                Download template (.xlsx)
              </Button>
              <Button variant="outline" size="sm" onClick={downloadExport} disabled={busy !== ""}>
                {busy === "export" ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1" />
                )}{" "}
                Export all products (.xlsx)
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              The template has a <b>Products</b> sheet, a <b>Variants</b> sheet (sizes / colours)
              and an <b>Instructions</b> sheet with every column, the category slugs and the allowed
              values. An export uses the same columns: edit it and upload it again. Blank cells keep
              the current value; type <b>CLEAR</b> to empty one.
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-xs">Find existing products by</Label>
                <Select value={matchBy} onValueChange={(v) => setMatchBy(v as MatchBy)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto">SKU, then ISBN, then slug (recommended)</SelectItem>
                    <SelectItem value="sku">SKU only</SelectItem>
                    <SelectItem value="isbn">ISBN only</SelectItem>
                    <SelectItem value="slug">Slug only</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[11px] text-muted-foreground">
                  Rows that match an existing product update it; other rows create new products.
                </p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs flex items-center gap-2">
                  <Switch
                    checked={createMissing}
                    onCheckedChange={setCreateMissing}
                    disabled={!ctx.isAdmin}
                  />{" "}
                  Create missing categories
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  {ctx.isAdmin
                    ? "Off: unknown categories are errors. On: they are created (top level, or “Parent > Child”)."
                    : "Admins only."}
                </p>
              </div>
            </div>
            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-8 text-sm text-muted-foreground hover:bg-slate-50 cursor-pointer">
              {busy === "reading" ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <Upload className="h-6 w-6" />
              )}
              {busy === "reading"
                ? "Reading and checking the file…"
                : "Choose an Excel or CSV file"}
              <input
                type="file"
                className="hidden"
                accept=".xlsx,.xls,.xlsm,.csv,.ods,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
                disabled={busy !== ""}
                onChange={(e) => {
                  void onFile(e.target.files?.[0]);
                  e.target.value = "";
                }}
              />
            </label>
            {fileError && (
              <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex gap-2">
                <XCircle className="h-4 w-4 mt-0.5 shrink-0" /> {fileError}
              </div>
            )}
          </div>
        )}

        {ctx && step === "preview" && prepared && plans && (
          <div className="space-y-4">
            <div className="text-sm">
              <b>{prepared.fileName}</b> — nothing has been saved yet.
            </div>
            {prepared.warnings.length > 0 && (
              <ul className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 space-y-1 list-disc pl-6">
                {prepared.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <div className="grid sm:grid-cols-2 gap-3">
              {productSummary && prepared.products && (
                <SummaryCard title="Products" s={productSummary} />
              )}
              {variantSummary && prepared.variants && (
                <SummaryCard title="Variants" s={variantSummary} />
              )}
            </div>
            {pendingCategories.length > 0 && (
              <div className="text-xs rounded-md border border-sky-200 bg-sky-50 p-2 text-sky-900">
                New categories that will be created: {pendingCategories.join(", ")}
              </div>
            )}
            <Tabs defaultValue={prepared.products ? "products" : "variants"}>
              <TabsList>
                {prepared.products && (
                  <TabsTrigger value="products">Products ({plans.products.length})</TabsTrigger>
                )}
                {prepared.variants && (
                  <TabsTrigger value="variants">Variants ({plans.variants.length})</TabsTrigger>
                )}
              </TabsList>
              {prepared.products && (
                <TabsContent value="products">
                  <PlanTable kind="products" plans={plans.products} />
                </TabsContent>
              )}
              {prepared.variants && (
                <TabsContent value="variants">
                  <PlanTable kind="variants" plans={plans.variants} />
                </TabsContent>
              )}
            </Tabs>
            {errorCount > 0 && (
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as "valid_only" | "all")}
                className="rounded-md border p-3 space-y-2"
              >
                <Label className="flex items-start gap-2 font-normal text-sm">
                  <RadioGroupItem value="valid_only" className="mt-0.5" />{" "}
                  <span>
                    Import the {importable} valid rows now and skip the {errorCount} rows with
                    errors (fix them later with the error report).
                  </span>
                </Label>
                <Label className="flex items-start gap-2 font-normal text-sm">
                  <RadioGroupItem value="all" className="mt-0.5" />{" "}
                  <span>
                    Fix the errors first — download the error report, correct the rows and upload
                    again.
                  </span>
                </Label>
              </RadioGroup>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={reset}>
                  Choose another file
                </Button>
                {(errorCount > 0 ||
                  (productSummary?.warnings ?? 0) + (variantSummary?.warnings ?? 0) > 0) && (
                  <Button variant="outline" onClick={downloadReport} disabled={busy !== ""}>
                    {busy === "report" ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}{" "}
                    Error report (.xlsx)
                  </Button>
                )}
              </div>
              <Button
                onClick={startImport}
                disabled={!importable || (errorCount > 0 && mode === "all")}
                className="bg-[#14B8A6] hover:bg-[#0F9488]"
              >
                Import {importable} row{importable === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === "importing" && progress && (
          <div className="space-y-4 py-4">
            <div className="text-sm font-medium">{phaseLabel(progress)}</div>
            <Progress value={progress.total ? (progress.done / progress.total) * 100 : 0} />
            <div className="text-xs text-muted-foreground">
              Keep this window open. Each batch is saved completely or not at all.
            </div>
            <Button
              variant="outline"
              disabled={cancelling}
              onClick={() => {
                cancelRef.current = true;
                setCancelling(true);
              }}
            >
              {cancelling ? "Stopping after this batch…" : "Cancel"}
            </Button>
          </div>
        )}

        {step === "done" && run && (
          <div className="space-y-4">
            <div
              className={`rounded-md border p-3 text-sm flex items-start gap-2 ${run.cancelled || run.stoppedBy ? "border-amber-200 bg-amber-50 text-amber-900" : "border-emerald-200 bg-emerald-50 text-emerald-900"}`}
            >
              {run.cancelled || run.stoppedBy ? (
                <AlertTriangle className="h-4 w-4 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-4 w-4 mt-0.5" />
              )}
              <span>
                {run.stoppedBy ??
                  (run.cancelled
                    ? "Import cancelled. Everything saved before you cancelled is kept."
                    : "Import finished.")}
              </span>
            </div>
            <div className="grid sm:grid-cols-3 gap-3 text-sm">
              {prepared?.products && <CountCard title="Products" c={run.counts.products} />}
              {prepared?.variants && <CountCard title="Variants" c={run.counts.variants} />}
              {(run.counts.images.copied > 0 || run.counts.images.failed > 0) && (
                <div className="rounded-md border p-3">
                  <div className="font-medium mb-1">Images</div>
                  {run.counts.images.copied} copied ·{" "}
                  <span className={run.counts.images.failed ? "text-amber-700" : ""}>
                    {run.counts.images.failed} failed (old image kept)
                  </span>
                </div>
              )}
            </div>
            {run.imageIssues.length > 0 && (
              <ul className="max-h-32 overflow-y-auto text-xs text-amber-800 list-disc pl-5">
                {run.imageIssues.slice(0, 50).map((i, n) => (
                  <li key={n}>
                    Row {i.row}: {i.message} ({i.value})
                  </li>
                ))}
              </ul>
            )}
            <div className="flex flex-wrap justify-between gap-2">
              <div className="flex gap-2">
                <Button variant="outline" onClick={downloadReport} disabled={busy !== ""}>
                  <Download className="h-4 w-4 mr-1" /> Report of failed rows (.xlsx)
                </Button>
                {ctx?.isAdmin && (
                  <Button variant="outline" asChild>
                    <Link to="/admin/logs" search={{ entity: "product_import" }}>
                      Activity log
                    </Link>
                  </Button>
                )}
              </div>
              <Button onClick={reset}>Import another file</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function dedupe(issues: Issue[]): Issue[] {
  const seen = new Set<string>();
  return issues.filter((i) => {
    const k = `${i.level}|${i.column}|${i.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function phaseLabel(p: RunProgress) {
  const n = `${Math.min(p.done + 1, p.total)} of ${p.total}`;
  switch (p.phase) {
    case "categories":
      return "Creating missing categories…";
    case "products":
      return `Saving products — batch ${n}`;
    case "variants":
      return `Saving variants — batch ${n}`;
    case "images":
      return `Copying images — product ${n}`;
    default:
      return "Finishing…";
  }
}

function Steps({ step }: { step: Step }) {
  const items: [Step[], string][] = [
    [["upload"], "1. Upload"],
    [["preview"], "2. Preview & check"],
    [["importing", "done"], "3. Import"],
  ];
  return (
    <ol className="flex gap-2 text-xs">
      {items.map(([s, label]) => (
        <li
          key={label}
          className={`rounded-full px-3 py-1 ${s.includes(step) ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-600"}`}
        >
          {label}
        </li>
      ))}
    </ol>
  );
}

function SummaryCard({ title, s }: { title: string; s: ReturnType<typeof summarise> }) {
  return (
    <div className="rounded-md border p-3 text-sm">
      <div className="font-medium mb-1">
        {title}: {s.total} rows
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="text-emerald-700">{s.create} new</span>
        <span className="text-sky-700">{s.update} update</span>
        <span className={s.warnings ? "text-amber-700" : "text-muted-foreground"}>
          {s.warnings} with warnings
        </span>
        <span className={s.errors ? "text-red-700 font-medium" : "text-muted-foreground"}>
          {s.errors} with errors
        </span>
        {s.skipped > 0 && (
          <span className="text-muted-foreground">{s.skipped} example rows skipped</span>
        )}
      </div>
    </div>
  );
}

function CountCard({
  title,
  c,
}: {
  title: string;
  c: { created: number; updated: number; skipped: number; failed: number };
}) {
  return (
    <div className="rounded-md border p-3">
      <div className="font-medium mb-1">{title}</div>
      <div className="text-xs space-x-2">
        <span className="text-emerald-700">{c.created} created</span>
        <span className="text-sky-700">{c.updated} updated</span>
        <span className="text-muted-foreground">{c.skipped} skipped</span>
        <span className={c.failed ? "text-red-700 font-medium" : "text-muted-foreground"}>
          {c.failed} failed
        </span>
      </div>
    </div>
  );
}

const STATUS_STYLE: Record<RowStatus, string> = {
  ok: "bg-emerald-50/60",
  warning: "bg-amber-50",
  error: "bg-red-50",
  skipped: "bg-slate-50 text-muted-foreground",
};
const PAGE = 100;

function PlanTable({
  kind,
  plans,
}: {
  kind: "products" | "variants";
  plans: (ProductPlan | VariantPlan)[];
}) {
  const [filter, setFilter] = useState<"all" | "error" | "warning" | "create" | "update">("all");
  const [page, setPage] = useState(0);
  const shown = plans.filter((p) =>
    filter === "all"
      ? true
      : filter === "error" || filter === "warning"
        ? p.status === filter
        : p.action === filter && p.status !== "error",
  );
  const slice = shown.slice(page * PAGE, page * PAGE + PAGE);
  const pages = Math.max(1, Math.ceil(shown.length / PAGE));
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs">
        <Select
          value={filter}
          onValueChange={(v) => {
            setFilter(v as typeof filter);
            setPage(0);
          }}
        >
          <SelectTrigger className="h-8 w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All rows</SelectItem>
            <SelectItem value="error">Errors only</SelectItem>
            <SelectItem value="warning">Warnings only</SelectItem>
            <SelectItem value="create">New only</SelectItem>
            <SelectItem value="update">Updates only</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-muted-foreground">{shown.length} rows</span>
        {pages > 1 && (
          <span className="ml-auto flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={page === 0}
              onClick={() => setPage(page - 1)}
            >
              Prev
            </Button>
            {page + 1} / {pages}
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={page + 1 >= pages}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </span>
        )}
      </div>
      <div className="max-h-[45vh] overflow-auto border rounded-md">
        <table className="w-full text-xs">
          <thead className="bg-slate-100 text-muted-foreground sticky top-0">
            <tr>
              <th className="p-1.5 text-left w-12">Row</th>
              <th className="p-1.5 text-left w-24">Action</th>
              <th className="p-1.5 text-left">{kind === "products" ? "Product" : "Variant"}</th>
              <th className="p-1.5 text-left">Problems (column: message)</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((p) => (
              <tr key={p.row} className={`border-t align-top ${STATUS_STYLE[p.status]}`}>
                <td className="p-1.5 font-mono">{p.row}</td>
                <td className="p-1.5">{actionLabel(p)}</td>
                <td className="p-1.5">{describe(p)}</td>
                <td className="p-1.5">
                  {p.issues.map((i, n) => (
                    <div
                      key={n}
                      className={i.level === "error" ? "text-red-700" : "text-amber-800"}
                    >
                      <b>{i.column}</b>: {i.message}
                      {i.value != null && i.value !== "" && !i.message.includes(i.value) ? (
                        <span className="text-muted-foreground">
                          {" "}
                          (“{i.value.length > 60 ? `${i.value.slice(0, 60)}…` : i.value}”)
                        </span>
                      ) : null}
                    </div>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function actionLabel(p: ProductPlan | VariantPlan) {
  if (p.status === "skipped") return "Skip";
  if (p.status === "error") return <span className="text-red-700 font-medium">Error</span>;
  if (p.action === "update")
    return (
      <span className="text-sky-700">
        Update{"matchedBy" in p && p.matchedBy ? ` (by ${p.matchedBy.toUpperCase()})` : ""}
      </span>
    );
  return <span className="text-emerald-700">New</span>;
}

function describe(p: ProductPlan | VariantPlan) {
  if ("variantSku" in p) {
    const opts = Object.values(p.options).join(" / ");
    return (
      <span>
        {p.productKey ?? "—"}
        {opts ? ` · ${opts}` : ""}
        {p.variantSku ? <span className="text-muted-foreground"> · {p.variantSku}</span> : null}
      </span>
    );
  }
  return (
    <span>
      {p.name ?? <span className="text-muted-foreground">(no name)</span>}
      {p.sku ? <span className="text-muted-foreground"> · {p.sku}</span> : null}
    </span>
  );
}
