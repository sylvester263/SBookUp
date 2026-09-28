import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, Pencil, X, Upload } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, useDebounced } from "@/components/admin/Pager";
import {
  adminListProducts, adminUpsertProduct, adminDeleteProduct, adminBulkProducts,
  adminListCategories, adminGetUploadUrl, adminBulkUpsertProducts, adminExportProducts,
  adminListVariants, adminUpsertVariant, adminDeleteVariant,
} from "@/lib/admin.functions";
import { supabase } from "@/integrations/supabase/client";
import { CatalogImportModal } from "@/components/admin/CatalogImportModal";
import { useCatalog, flattenTree } from "@/components/admin/catalog-shared";
import { ProductForm } from "@/components/admin/ProductForm";


export const Route = createFileRoute("/_admin/admin/products")({
  component: ProductsPage,
});

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

type Product = any;

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function emptyProduct(): Product {
  return {
    id: undefined, name: "", slug: "", sku: "", isbn: "", category_id: null,
    brand: "", author: "", publisher: "", edition: "", description: "",
    cost_price: null, price: 0, sale_price: null,
    stock_quantity: 0, low_stock_threshold: 5, weight_grams: null,
    is_active: true, is_featured: false, images: [], tags: [],
  };
}

function normalizeProduct(p: any): Product {
  const base = emptyProduct();
  if (!p) return base;
  return {
    ...base,
    ...p,
    name: p.name ?? "",
    slug: p.slug ?? "",
    sku: p.sku ?? "",
    isbn: p.isbn ?? "",
    brand: p.brand ?? "",
    author: p.author ?? "",
    publisher: p.publisher ?? "",
    edition: p.edition ?? "",
    description: p.description ?? "",
    category_id: p.category_id ?? null,
    price: p.price ?? 0,
    sale_price: p.sale_price ?? null,
    cost_price: p.cost_price ?? null,
    stock_quantity: p.stock_quantity ?? 0,
    low_stock_threshold: p.low_stock_threshold ?? 5,
    weight_grams: p.weight_grams ?? null,
    is_active: p.is_active ?? true,
    is_featured: p.is_featured ?? false,
    images: Array.isArray(p.images) ? p.images : [],
    tags: Array.isArray(p.tags) ? p.tags : [],
  };
}

class ProductFormErrorBoundary extends React.Component<
  { children: React.ReactNode; onReset?: () => void },
  { hasError: boolean; error: Error | null }
> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, info: any) { console.error("Product form crash:", error, info); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h3 className="text-lg font-bold text-gray-800 mb-2">Form failed to load</h3>
          <p className="text-sm text-gray-500 mb-4">{this.state.error?.message || "Unknown error"}</p>
          <button
            onClick={() => { this.setState({ hasError: false, error: null }); this.props.onReset?.(); }}
            className="px-6 py-2 bg-teal-700 text-white rounded-full text-sm"
          >Try Again</button>
        </div>
      );
    }
    return this.props.children;
  }
}

function ProductsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListProducts);
  const catsFn = useServerFn(adminListCategories);
  const upsertFn = useServerFn(adminUpsertProduct);
  const deleteFn = useServerFn(adminDeleteProduct);
  const bulkFn = useServerFn(adminBulkProducts);
  const uploadFn = useServerFn(adminGetUploadUrl);
  const bulkUpsertFn = useServerFn(adminBulkUpsertProducts);
  const exportFn = useServerFn(adminExportProducts);

  const cats = useQuery({ queryKey: ["admin-cats"], queryFn: () => catsFn() });

  const [bulkOpen, setBulkOpen] = useState(false);
  const [exporting, setExporting] = useState(false);


  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [stockFilter, setStockFilter] = useState<string>("all");
  const [attrKey, setAttrKey] = useState<string>("all");
  const [attrValue, setAttrValue] = useState<string>("all");
  const catalog = useCatalog();
  const catTree = useMemo(() => flattenTree(catalog.data?.categories ?? []), [catalog.data]);
  const filterDefs = (catalog.data?.definitions ?? []).filter((d) => d.is_active !== false && (d.type === "select" || d.type === "multiselect"));
  const attrDef = filterDefs.find((d) => d.key === attrKey);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [drawer, setDrawer] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);

  // Server-side search, filters and pagination (50 per page)
  const filters = { q: debouncedQ || undefined, categoryId: catFilter === "all" ? undefined : catFilter, status: statusFilter as "all" | "active" | "draft", stock: stockFilter as "all" | "low" | "out", attrKey: attrKey !== "all" && attrValue !== "all" ? attrKey : undefined, attrValue: attrKey !== "all" && attrValue !== "all" ? attrValue : undefined };
  const filterKey = JSON.stringify(filters);
  useEffect(() => { setPage(1); setSelected(new Set()); }, [filterKey]);
  const products = useQuery({
    queryKey: ["admin-products", filters, page],
    queryFn: () => listFn({ data: { ...filters, page, pageSize: 50 } }),
    placeholderData: (prev) => prev,
  });
  const filtered: Product[] = (products.data?.rows ?? []) as Product[];

  function toggleAll() {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((p) => p.id)));
  }

  async function runBulk(op: "activate" | "deactivate" | "delete") {
    if (!selected.size) return;
    if (op === "delete" && !confirm(`Delete ${selected.size} products?`)) return;
    try {
      await bulkFn({ data: { ids: Array.from(selected), op } });
      toast.success("Done");
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["admin-products"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    }
  }

  async function deleteOne(id: string) {
    if (!confirm("Delete this product?")) return;
    await deleteFn({ data: { id } });
    qc.invalidateQueries({ queryKey: ["admin-products"] });
    toast.success("Deleted");
  }



  return (
    <AdminShell title="Products">
      <div className="bg-white rounded-xl border">
        <div className="p-4 flex flex-wrap gap-3 items-center border-b">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, SKU, ISBN…" className="pl-9" />
          </div>
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {catTree.map(({ c, depth }) => <SelectItem key={c.id} value={c.id}>{"\u00A0\u00A0".repeat(depth)}{depth ? "↳ " : ""}{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={attrKey} onValueChange={(v) => { setAttrKey(v); setAttrValue("all"); }}>
            <SelectTrigger className="w-[150px]"><SelectValue placeholder="Attribute" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any attribute</SelectItem>
              {filterDefs.map((d) => <SelectItem key={d.key} value={d.key}>{d.label}{d.is_variant_axis ? " (variant)" : ""}</SelectItem>)}
            </SelectContent>
          </Select>
          {attrDef && (
            <Select value={attrValue} onValueChange={setAttrValue}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Any {attrDef.label}</SelectItem>
                {attrDef.options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="draft">Draft</SelectItem>
            </SelectContent>
          </Select>
          <Select value={stockFilter} onValueChange={setStockFilter}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All stock</SelectItem>
              <SelectItem value="low">Low stock</SelectItem>
              <SelectItem value="out">Out of stock</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            onClick={() => setBulkOpen(true)}
            className="border-teal-600 text-teal-700 hover:bg-teal-50 rounded-full"
          >
            <Upload className="h-4 w-4 mr-1" /> Import / Export CSV
          </Button>
          <Button onClick={() => setDrawer(emptyProduct())} className="bg-[#14B8A6] hover:bg-[#0F9488] rounded-full">
            <Plus className="h-4 w-4 mr-1" /> Add Product
          </Button>

        </div>

        {selected.size > 0 && (
          <div className="px-4 py-2 bg-amber-50 border-b flex items-center gap-2 text-sm">
            <span>{selected.size} selected</span>
            <Button size="sm" variant="outline" onClick={() => runBulk("activate")}>Activate</Button>
            <Button size="sm" variant="outline" onClick={() => runBulk("deactivate")}>Deactivate</Button>
            <Button size="sm" variant="outline" className="text-red-600" onClick={() => runBulk("delete")}>Delete</Button>
            <button className="ml-auto text-xs" onClick={() => setSelected(new Set())}>Clear</button>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground">
              <tr>
                <th className="p-2 w-10"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} /></th>
                <th className="text-left p-2">Image</th>
                <th className="text-left p-2">Name</th>
                <th className="text-left p-2">SKU</th>
                <th className="text-left p-2">Category</th>
                <th className="text-left p-2">Price</th>
                <th className="text-left p-2">Stock</th>
                <th className="text-left p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {products.isLoading && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {filtered.map((p) => (
                <tr key={p.id} className="border-t hover:bg-slate-50">
                  <td className="p-2"><input type="checkbox" checked={selected.has(p.id)} onChange={(e) => {
                    const s = new Set(selected); e.target.checked ? s.add(p.id) : s.delete(p.id); setSelected(s);
                  }} /></td>
                  <td className="p-2">
                    {(Array.isArray(p.images) && p.images[0]) ? <img src={p.images[0]} className="h-10 w-10 rounded object-cover" alt="" /> : <div className="h-10 w-10 rounded bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">No image</div>}
                  </td>
                  <td className="p-2 max-w-[260px] truncate">{p.name}</td>
                  <td className="p-2 text-xs font-mono text-muted-foreground">{p.sku ?? "—"}</td>
                  <td className="p-2 text-xs">{p.categories?.name ?? "—"}</td>
                  <td className="p-2">{pkr(Number(p.price))}</td>
                  <td className="p-2"><span className={`text-xs font-semibold ${p.stock_quantity === 0 ? "text-red-600" : p.stock_quantity <= p.low_stock_threshold ? "text-amber-600" : "text-slate-700"}`}>{p.stock_quantity}</span></td>
                  <td className="p-2">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${p.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                      {p.is_active ? "Active" : "Draft"}
                    </span>
                  </td>
                  <td className="p-2">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setDrawer(normalizeProduct(p))} className="p-1.5 hover:bg-slate-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deleteOne(p.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!products.isLoading && !filtered.length && <tr><td colSpan={9} className="p-8 text-center text-muted-foreground">No products found</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={50} total={products.data?.total ?? 0} onPage={(p) => { setPage(p); setSelected(new Set()); }} loading={products.isFetching} />
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drawer?.id ? "Edit product" : "New product"}</SheetTitle>
          </SheetHeader>
          {drawer && (
            <ProductFormErrorBoundary onReset={() => setDrawer(null)}>
              <ProductForm
                product={drawer}
                upsertFn={upsertFn}
                uploadFn={uploadFn}
                onSaved={() => qc.invalidateQueries({ queryKey: ["admin-products"] })}
                onClose={() => setDrawer(null)}
              />
            </ProductFormErrorBoundary>
          )}
        </SheetContent>
      </Sheet>
      <CatalogImportModal
        open={bulkOpen}
        onClose={() => setBulkOpen(false)}
        onImported={() => { qc.invalidateQueries({ queryKey: ["admin-products"] }); qc.invalidateQueries({ queryKey: ["admin-catalog"] }); }}
      />
    </AdminShell>

  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
