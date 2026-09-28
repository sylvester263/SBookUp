// CSV import / export for products and variants. Every import is validated on the
// server first (dry run): a row-by-row report is shown and nothing is written
// until the file has no errors.
import { useState } from "react";
import Papa from "papaparse";
import { useServerFn } from "@tanstack/react-start";
import { Upload, Download, Loader2, CheckCircle2, AlertTriangle, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useCatalog } from "@/components/admin/catalog-shared";
import {
  adminImportProducts, adminImportVariants, adminExportCatalogProducts, adminExportVariants,
} from "@/lib/catalog-admin.functions";

type Preview = { row: number; slug: string; action: string; errors: string[] };
type Result = { dryRun: boolean; imported: number; errorCount: number; preview: Preview[] };

const csvCell = (c: unknown) => `"${String(c ?? "").replace(/"/g, '""')}"`;
const toCsv = (headers: string[], rows: unknown[][]) => [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\n");
function download(name: string, content: string) {
  const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}
const today = () => new Date().toISOString().slice(0, 10);

export function CatalogImportModal({ open, onClose, onImported }: { open: boolean; onClose: () => void; onImported: () => void }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Import / export CSV</DialogTitle></DialogHeader>
        <Tabs defaultValue="products">
          <TabsList><TabsTrigger value="products">Products</TabsTrigger><TabsTrigger value="variants">Variants (size / colour)</TabsTrigger></TabsList>
          <TabsContent value="products"><ImportPanel kind="products" onImported={onImported} /></TabsContent>
          <TabsContent value="variants"><ImportPanel kind="variants" onImported={onImported} /></TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function ImportPanel({ kind, onImported }: { kind: "products" | "variants"; onImported: () => void }) {
  const catalog = useCatalog();
  const importFn = useServerFn(kind === "products" ? adminImportProducts : adminImportVariants);
  const exportFn = useServerFn(kind === "products" ? adminExportCatalogProducts : adminExportVariants);
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [fileName, setFileName] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState<"" | "check" | "import" | "export">("");

  const defs = catalog.data?.definitions ?? [];
  const templateHeaders = kind === "products"
    ? ["name", "slug", "categories", "sku", "isbn", "brand", "edition", "description", "price", "sale_price", "cost_price", "stock_quantity",
       "low_stock_threshold", "weight_grams", "sell_unit", "pack_size", "unit_label", "is_active", "is_featured", "is_new_arrival",
       "new_arrival_until", "tags", "images", ...defs.filter((d) => !d.is_variant_axis).map((d) => `attr_${d.key}`)]
    : ["product_sku", "product_slug", "variant_sku", "name", "price", "stock", "is_active", "image_url", ...defs.filter((d) => d.is_variant_axis).map((d) => `option_${d.key}`)];
  const example: Record<string, string> = kind === "products"
    ? { name: "Floral Wrapping Sheet", categories: "gift-wrapping-sheets|gifts", price: "600", stock_quantity: "20", sell_unit: "pack", pack_size: "6", unit_label: "sheet", attr_paper_size: "A3" }
    : { product_sku: "COSTUME-SPIDEY", variant_sku: "SPIDEY-6-7Y-RED", price: "", stock: "5", option_clothing_size: "6-7Y", option_colour: "Red" };

  function onFile(f: File | undefined) {
    if (!f) return;
    setResult(null);
    setFileName(f.name);
    Papa.parse<Record<string, unknown>>(f, {
      header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase(),
      complete: (res) => {
        if (res.errors.length) toast.warning(`CSV warning: ${res.errors[0].message}`);
        if (res.data.length > 1000) { toast.error("Please import at most 1,000 rows at a time"); setRows(null); return; }
        setRows(res.data);
        check(res.data);
      },
      error: (e) => toast.error(e.message),
    });
  }

  async function check(data = rows) {
    if (!data?.length) return;
    setBusy("check");
    try { setResult((await importFn({ data: { rows: data, dryRun: true } })) as Result); }
    catch (e: any) { toast.error(e?.message ?? "Check failed"); }
    finally { setBusy(""); }
  }

  async function runImport() {
    if (!rows?.length) return;
    setBusy("import");
    try {
      const r = (await importFn({ data: { rows, dryRun: false } })) as Result;
      setResult(r);
      if (r.dryRun) toast.error("The file has errors — nothing was imported");
      else { toast.success(`Imported ${r.imported} ${kind}`); onImported(); }
    } catch (e: any) { toast.error(e?.message ?? "Import failed"); }
    finally { setBusy(""); }
  }

  async function doExport() {
    setBusy("export");
    try {
      const { headers, rows: out } = await exportFn();
      download(`${kind}_${today()}.csv`, toCsv(headers, out));
    } catch (e: any) { toast.error(e?.message ?? "Export failed"); }
    finally { setBusy(""); }
  }

  const errorRows = result?.preview.filter((p) => p.errors.length) ?? [];
  return (
    <div className="space-y-4 pt-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => download(`${kind}_template.csv`, toCsv(templateHeaders, [templateHeaders.map((h) => example[h] ?? "")]))}>
          <FileText className="h-4 w-4 mr-1" /> Template
        </Button>
        <Button variant="outline" size="sm" onClick={doExport} disabled={busy !== ""}>
          {busy === "export" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Export all {kind}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        {kind === "products"
          ? <>Upserts by <b>slug</b>. <b>categories</b> = slugs separated by “|”, primary first. Attributes go in <b>attr_&lt;key&gt;</b> columns (multiple values separated by “|”). <b>sell_unit</b> is item or pack; pack size defaults from the category.</>
          : <>Matches the product by <b>product_sku</b> (or <b>product_slug</b>). One row per variant with an <b>option_&lt;key&gt;</b> column for each size / colour. Existing variants are updated (matched by variant_sku or options). Blank price = product price.</>}
      </p>
      <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-lg p-6 text-sm text-muted-foreground hover:bg-slate-50 cursor-pointer">
        <Upload className="h-6 w-6" />
        {fileName ? <span className="text-foreground font-medium">{fileName} — {rows?.length ?? 0} rows</span> : "Choose a CSV file"}
        <input type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
      </label>

      {busy === "check" && <div className="text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Checking every row…</div>}
      {result && (
        <div className="space-y-3">
          {result.errorCount ? (
            <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> {result.errorCount} of {result.preview.length} rows have problems. Fix them and upload again — nothing has been imported.</span>
              <Button size="sm" variant="outline" onClick={() => download(`${kind}_import_errors.csv`, toCsv(["row", "slug", "errors"], errorRows.map((r) => [r.row, r.slug, r.errors.join("; ")])))}>Error report</Button>
            </div>
          ) : result.dryRun ? (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" /> All {result.preview.length} rows are valid: {result.preview.filter((p) => p.action === "create").length} new, {result.preview.filter((p) => p.action === "update").length} updates.
            </div>
          ) : (
            <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Imported {result.imported} rows.</div>
          )}
          <div className="max-h-72 overflow-y-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-muted-foreground sticky top-0"><tr><th className="p-1.5 text-left">Row</th><th className="p-1.5 text-left">{kind === "products" ? "Slug" : "Product"}</th><th className="p-1.5 text-left">Action</th><th className="p-1.5 text-left">Problems</th></tr></thead>
              <tbody>
                {[...errorRows, ...result.preview.filter((p) => !p.errors.length)].map((p) => (
                  <tr key={p.row} className={`border-t ${p.errors.length ? "bg-red-50/50" : ""}`}>
                    <td className="p-1.5">{p.row}</td><td className="p-1.5 font-mono">{p.slug}</td><td className="p-1.5">{p.action}</td>
                    <td className="p-1.5 text-red-700">{p.errors.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.dryRun && !result.errorCount && (
            <div className="flex justify-end">
              <Button onClick={runImport} disabled={busy !== ""} className="bg-[#14B8A6] hover:bg-[#0F9488]">
                {busy === "import" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : null} Import {result.preview.length} rows
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
