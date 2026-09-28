import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminListBundles, adminUpsertBundle, adminDeleteBundle, adminListProductsLite } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/bundles")({ component: BundlesPage });

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;
const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

function empty() {
  return {
    id: undefined, name: "", slug: "", description: "", school_name: "", class_level: "", exam_board: "",
    image_url: "", total_price: 0, discounted_price: 0, is_active: true,
    items: [] as { product_id: string; quantity: number }[],
  };
}

function BundlesPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListBundles);
  const upsertFn = useServerFn(adminUpsertBundle);
  const deleteFn = useServerFn(adminDeleteBundle);
  const productsFn = useServerFn(adminListProductsLite);

  const bundles = useQuery({ queryKey: ["admin-bundles"], queryFn: () => listFn() });
  const products = useQuery({ queryKey: ["admin-products-lite"], queryFn: () => productsFn() });
  const [drawer, setDrawer] = useState<any | null>(null);

  async function del(id: string) {
    if (!confirm("Delete this bundle?")) return;
    try { await deleteFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["admin-bundles"] }); toast.success("Deleted"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <AdminShell title="Bundles">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center">
          <p className="text-sm text-muted-foreground">School & exam-board bundles.</p>
          <Button onClick={() => setDrawer(empty())} className="bg-[#14B8A6] hover:bg-[#0F9488]"><Plus className="h-4 w-4 mr-1" /> Add Bundle</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground">
            <tr><th className="text-left p-2">Name</th><th className="text-left p-2">School</th><th className="text-left p-2">Items</th><th className="text-left p-2">Price</th><th className="text-left p-2">Status</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {bundles.isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {(bundles.data ?? []).map((b: any) => (
              <tr key={b.id} className="border-t hover:bg-slate-50">
                <td className="p-2"><div className="font-medium">{b.name}</div><div className="text-xs text-muted-foreground">{b.class_level}</div></td>
                <td className="p-2 text-xs">{b.school_name ?? "—"}</td>
                <td className="p-2">{b.bundle_items?.length ?? 0}</td>
                <td className="p-2"><div>{pkr(Number(b.discounted_price))}</div><div className="text-xs line-through text-muted-foreground">{pkr(Number(b.total_price))}</div></td>
                <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded-full ${b.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{b.is_active ? "Active" : "Hidden"}</span></td>
                <td className="p-2"><div className="flex gap-1">
                  <button onClick={() => setDrawer({ ...b, items: (b.bundle_items ?? []).map((it: any) => ({ product_id: it.product_id, quantity: it.quantity })) })} className="p-1.5 hover:bg-slate-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => del(b.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                </div></td>
              </tr>
            ))}
            {!bundles.isLoading && !(bundles.data ?? []).length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No bundles yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-2xl overflow-y-auto">
          <SheetHeader><SheetTitle>{drawer?.id ? "Edit bundle" : "New bundle"}</SheetTitle></SheetHeader>
          {drawer && (
            <BundleForm
              bundle={drawer}
              products={products.data ?? []}
              onSave={async (v: any) => {
                try { await upsertFn({ data: v }); toast.success("Saved"); setDrawer(null); qc.invalidateQueries({ queryKey: ["admin-bundles"] }); }
                catch (e: any) { toast.error(e?.message ?? "Failed"); }
              }}
              onCancel={() => setDrawer(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function BundleForm({ bundle, products, onSave, onCancel }: any) {
  const [b, setB] = useState(bundle);
  const [search, setSearch] = useState("");
  const set = (k: string, v: any) => setB((p: any) => ({ ...p, [k]: v }));

  const productMap = useMemo(() => new Map(products.map((p: any) => [p.id, p])), [products]);
  const computedTotal = useMemo(() => b.items.reduce((s: number, it: any) => {
    const p: any = productMap.get(it.product_id); return s + (p ? Number(p.price) * it.quantity : 0);
  }, 0), [b.items, productMap]);

  const filtered = useMemo(() => {
    if (!search) return [];
    const k = search.toLowerCase();
    return products.filter((p: any) => p.name.toLowerCase().includes(k) || (p.sku ?? "").toLowerCase().includes(k)).slice(0, 8);
  }, [search, products]);

  function addItem(pid: string) {
    if (b.items.some((it: any) => it.product_id === pid)) return;
    set("items", [...b.items, { product_id: pid, quantity: 1 }]);
    setSearch("");
  }

  return (
    <div className="space-y-3 mt-4">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs">Name</label><Input value={b.name} onChange={(e) => { set("name", e.target.value); if (!b.id && !b.slug) set("slug", slugify(e.target.value)); }} /></div>
        <div><label className="text-xs">Slug</label><Input value={b.slug} onChange={(e) => set("slug", slugify(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <div><label className="text-xs">School</label><Input value={b.school_name} onChange={(e) => set("school_name", e.target.value)} /></div>
        <div><label className="text-xs">Class</label><Input value={b.class_level} onChange={(e) => set("class_level", e.target.value)} /></div>
        <div><label className="text-xs">Exam board</label><Input value={b.exam_board} onChange={(e) => set("exam_board", e.target.value)} /></div>
      </div>
      <div><label className="text-xs">Description</label><Textarea rows={3} value={b.description} onChange={(e) => set("description", e.target.value)} /></div>
      <div><label className="text-xs">Cover image URL</label><Input value={b.image_url} onChange={(e) => set("image_url", e.target.value)} /></div>

      <div className="border rounded-lg p-3">
        <div className="font-medium text-sm mb-2">Products in bundle</div>
        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products to add…" className="pl-9" />
          {filtered.length > 0 && (
            <div className="absolute z-10 left-0 right-0 mt-1 bg-white border rounded shadow max-h-60 overflow-y-auto">
              {filtered.map((p: any) => (
                <button key={p.id} type="button" onClick={() => addItem(p.id)} className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex justify-between">
                  <span>{p.name}</span><span className="text-muted-foreground">{pkr(Number(p.price))}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1">
          {b.items.map((it: any, i: number) => {
            const p: any = productMap.get(it.product_id);
            return (
              <div key={it.product_id} className="flex items-center gap-2 text-sm border rounded px-2 py-1.5">
                <span className="flex-1 truncate">{p?.name ?? it.product_id}</span>
                <span className="text-xs text-muted-foreground">{pkr(Number(p?.price ?? 0))}</span>
                <Input type="number" min={1} value={it.quantity} onChange={(e) => {
                  const next = [...b.items]; next[i] = { ...it, quantity: Math.max(1, Number(e.target.value)) }; set("items", next);
                }} className="w-16 h-7" />
                <button type="button" onClick={() => set("items", b.items.filter((_: any, j: number) => j !== i))} className="text-red-600"><X className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
          {!b.items.length && <p className="text-xs text-muted-foreground py-2">No items yet.</p>}
        </div>
        <div className="text-xs text-muted-foreground mt-2">Items total: {pkr(computedTotal)}</div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs">Total price (PKR)</label><Input type="number" value={b.total_price} onChange={(e) => set("total_price", Number(e.target.value))} /></div>
        <div><label className="text-xs">Discounted price (PKR)</label><Input type="number" value={b.discounted_price} onChange={(e) => set("discounted_price", Number(e.target.value))} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={b.is_active} onCheckedChange={(v) => set("is_active", v)} /> Active</label>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({
          ...b,
          description: b.description || undefined,
          image_url: b.image_url || undefined,
          school_name: b.school_name || undefined,
          class_level: b.class_level || undefined,
          exam_board: b.exam_board || undefined,
        })} className="bg-[#14B8A6] hover:bg-[#0F9488]">Save</Button>
      </div>
    </div>
  );
}
