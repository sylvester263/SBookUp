import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ArrowUp, ArrowDown, Upload, X, Lock } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { useCatalog, flattenTree, categoryPath, type AdminCategory } from "@/components/admin/catalog-shared";
import { adminDeleteCategory, adminGetUploadUrl } from "@/lib/admin.functions";
import { adminSaveCategory, adminReorderCategories, adminSetCategoryAttributes } from "@/lib/catalog-admin.functions";
import { effectiveAttributesFor } from "@/lib/catalog-import";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_admin/admin/categories")({ component: CategoriesPage });

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

type Draft = Omit<AdminCategory, "id" | "product_count"> & { id?: string };
function empty(parent_id: string | null = null): Draft {
  return {
    name: "", slug: "", parent_id, description: "", image_url: "", display_order: 999, is_active: true,
    show_in_nav: !!parent_id, show_on_home: false, seo_title: "", seo_description: "",
    default_sell_unit: "item", default_pack_size: null, default_unit_label: "",
  };
}

function CategoriesPage() {
  const qc = useQueryClient();
  const catalog = useCatalog();
  const reorderFn = useServerFn(adminReorderCategories);
  const deleteFn = useServerFn(adminDeleteCategory);
  const [drawer, setDrawer] = useState<Draft | null>(null);
  const tree = useMemo(() => flattenTree(catalog.data?.categories ?? []), [catalog.data]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-catalog"] });

  async function move(c: AdminCategory, siblings: AdminCategory[], dir: -1 | 1) {
    const i = siblings.findIndex((s) => s.id === c.id);
    const j = i + dir;
    if (j < 0 || j >= siblings.length) return;
    const ids = siblings.map((s) => s.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await reorderFn({ data: { ids } }); refresh(); } catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  async function del(c: AdminCategory) {
    if (!confirm(`Delete "${c.name}"?`)) return;
    try { await deleteFn({ data: { id: c.id } }); refresh(); toast.success("Deleted"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <AdminShell title="Categories">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center gap-3">
          <p className="text-sm text-muted-foreground">Category tree. Use the arrows to change the order (it's also the menu order).</p>
          <Button onClick={() => setDrawer(empty())} className="bg-[#14B8A6] hover:bg-[#0F9488]"><Plus className="h-4 w-4 mr-1" /> Add Category</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground">
              <tr><th className="text-left p-2">Name</th><th className="text-left p-2">Slug</th><th className="text-left p-2">Products</th><th className="text-left p-2">Shown</th><th className="text-left p-2">Order</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {catalog.isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {tree.map(({ c, depth, siblings }) => (
                <tr key={c.id} className="border-t hover:bg-slate-50">
                  <td className="p-2">
                    <span style={{ paddingLeft: depth * 20 }} className={c.is_active ? "" : "text-muted-foreground line-through"}>
                      {depth > 0 && "↳ "}{c.name}
                    </span>
                    {c.default_sell_unit === "pack" && <span className="ml-2 text-[10px] rounded bg-amber-100 text-amber-800 px-1.5 py-0.5">pack of {c.default_pack_size}</span>}
                  </td>
                  <td className="p-2 text-xs font-mono text-muted-foreground">{c.slug}</td>
                  <td className="p-2">{c.product_count}</td>
                  <td className="p-2 text-xs space-x-1">
                    {!c.is_active && <span className="rounded bg-slate-100 px-1.5 py-0.5">Hidden</span>}
                    {c.is_active && c.show_in_nav && <span className="rounded bg-teal-50 text-teal-700 px-1.5 py-0.5">Menu</span>}
                    {c.is_active && c.show_on_home && <span className="rounded bg-violet-50 text-violet-700 px-1.5 py-0.5">Home</span>}
                  </td>
                  <td className="p-2">
                    <div className="flex gap-0.5">
                      <button aria-label="Move up" disabled={siblings[0]?.id === c.id} onClick={() => move(c, siblings, -1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button aria-label="Move down" disabled={siblings[siblings.length - 1]?.id === c.id} onClick={() => move(c, siblings, 1)} className="p-1 rounded hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                  <td className="p-2"><div className="flex gap-1 justify-end">
                    <button title="Add sub-category" onClick={() => setDrawer(empty(c.id))} className="p-1.5 hover:bg-slate-100 rounded"><Plus className="h-3.5 w-3.5" /></button>
                    <button title="Edit" onClick={() => setDrawer({ ...c, description: c.description ?? "", image_url: c.image_url ?? "", seo_title: c.seo_title ?? "", seo_description: c.seo_description ?? "", default_unit_label: c.default_unit_label ?? "" })} className="p-1.5 hover:bg-slate-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                    <button title="Delete" onClick={() => del(c)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div></td>
                </tr>
              ))}
              {!catalog.isLoading && !tree.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No categories yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{drawer?.id ? "Edit category" : "New category"}</SheetTitle></SheetHeader>
          {drawer && catalog.data && (
            <CategoryForm key={drawer.id ?? "new"} initial={drawer} onDone={() => { setDrawer(null); refresh(); }} />
          )}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function CategoryForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const catalog = useCatalog();
  const data = catalog.data!;
  const saveFn = useServerFn(adminSaveCategory);
  const setAttrsFn = useServerFn(adminSetCategoryAttributes);
  const uploadFn = useServerFn(adminGetUploadUrl);
  const [c, setC] = useState<Draft>(initial);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setC((p) => ({ ...p, [k]: v }));

  // Own assignments (editable) and inherited ones (read-only, from parents)
  const own = data.categoryAttributes.filter((r) => r.category_id === initial.id).sort((a, b) => a.sort_order - b.sort_order);
  const [attrs, setAttrs] = useState(own.map((r) => ({ attribute_id: r.attribute_id, is_required: r.is_required, is_variant_axis: r.is_variant_axis })));
  const inherited = c.parent_id ? effectiveAttributesFor([c.parent_id], data) : [];
  const defById = new Map(data.definitions.map((d) => [d.id, d]));
  const available = data.definitions.filter((d) => !attrs.some((a) => a.attribute_id === d.id) && !inherited.some((i) => i.key === d.key));

  // Parent options: not itself or its own descendants
  const blocked = new Set<string>();
  if (initial.id) {
    const walk = (id: string) => { blocked.add(id); data.categories.filter((x) => x.parent_id === id).forEach((x) => walk(x.id)); };
    walk(initial.id);
  }
  const parents = data.categories.filter((p) => !blocked.has(p.id));

  async function uploadImage(file: File) {
    try {
      const { prepareUpload, toWebpPath } = await import("@/lib/image-upload");
      const { blob, contentType } = await prepareUpload(file);
      const safe = "category-" + toWebpPath(file.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
      const { token, path, publicUrl } = await uploadFn({ data: { bucket: "product-images", filename: safe } });
      const { error } = await supabase.storage.from("product-images").uploadToSignedUrl(path, token, blob, { contentType } as any);
      if (error) throw error;
      set("image_url", publicUrl);
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
  }

  async function save() {
    setBusy(true);
    try {
      const { id } = await saveFn({
        data: {
          ...c,
          default_pack_size: c.default_sell_unit === "pack" ? Number(c.default_pack_size) || null : null,
          display_order: Number(c.display_order) || 0,
        } as any,
      });
      await setAttrsFn({ data: { category_id: id, items: attrs } });
      toast.success("Saved");
      onDone();
    } catch (e: any) { toast.error(e?.message ?? "Failed"); }
    finally { setBusy(false); }
  }

  const moveAttr = (i: number, dir: -1 | 1) => setAttrs((list) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    return next;
  });

  return (
    <div className="space-y-4 mt-4 pb-8">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Name"><Input value={c.name} onChange={(e) => { set("name", e.target.value); if (!initial.id) set("slug", slugify(e.target.value)); }} /></Field>
        <Field label="Slug (URL)"><Input value={c.slug} onChange={(e) => set("slug", slugify(e.target.value))} /></Field>
      </div>
      <Field label="Parent">
        <Select value={c.parent_id ?? "none"} onValueChange={(v) => set("parent_id", v === "none" ? null : v)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No parent (top-level)</SelectItem>
            {parents.map((p) => <SelectItem key={p.id} value={p.id}>{categoryPath(p.id, data.categories)}</SelectItem>)}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Description"><Textarea rows={3} value={c.description ?? ""} onChange={(e) => set("description", e.target.value)} /></Field>
      <Field label="Image">
        <div className="flex items-center gap-3">
          {c.image_url ? (
            <div className="relative"><img src={c.image_url} alt="" className="h-16 w-16 rounded object-cover border" />
              <button type="button" onClick={() => set("image_url", "")} className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-0.5"><X className="h-3 w-3" /></button></div>
          ) : null}
          <label className="inline-flex items-center gap-2 text-sm cursor-pointer border rounded-md px-3 py-2 hover:bg-slate-50">
            <Upload className="h-4 w-4" /> Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
          </label>
        </div>
      </Field>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm"><Switch checked={c.is_active} onCheckedChange={(v) => set("is_active", v)} /> Active</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={c.show_in_nav} onCheckedChange={(v) => set("show_in_nav", v)} /> Show in menu</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={c.show_on_home} onCheckedChange={(v) => set("show_on_home", v)} /> Show on homepage</label>
      </div>

      <div className="border-t pt-4 space-y-3">
        <div className="text-sm font-semibold">Selling unit (pre-fills new products)</div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="Sold by">
            <Select value={c.default_sell_unit} onValueChange={(v) => set("default_sell_unit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="item">Single item</SelectItem><SelectItem value="pack">Pack</SelectItem></SelectContent>
            </Select>
          </Field>
          {c.default_sell_unit === "pack" && <>
            <Field label="Pack size"><Input type="number" min={2} value={c.default_pack_size ?? ""} onChange={(e) => set("default_pack_size", e.target.value === "" ? null : Number(e.target.value))} /></Field>
            <Field label="Unit name"><Input value={c.default_unit_label ?? ""} onChange={(e) => set("default_unit_label", e.target.value)} placeholder="sheet" /></Field>
          </>}
        </div>
      </div>

      <div className="border-t pt-4 space-y-3">
        <div className="text-sm font-semibold">SEO</div>
        <Field label="SEO title (blank = category name)"><Input value={c.seo_title ?? ""} onChange={(e) => set("seo_title", e.target.value)} maxLength={120} /></Field>
        <Field label="SEO description (blank = description)"><Textarea rows={2} value={c.seo_description ?? ""} onChange={(e) => set("seo_description", e.target.value)} maxLength={300} /></Field>
      </div>

      <div className="border-t pt-4 space-y-2">
        <div className="text-sm font-semibold">Attributes & filters</div>
        <p className="text-xs text-muted-foreground">Products in this category get these fields, and the category page shows them as filters. Sub-categories inherit them.</p>
        {inherited.length > 0 && (
          <div className="space-y-1">
            {inherited.map((a) => (
              <div key={a.key} className="flex items-center gap-2 text-sm rounded border border-dashed px-2 py-1.5 text-muted-foreground">
                <Lock className="h-3.5 w-3.5" /> {a.label} <span className="text-xs">(from parent{a.is_required ? ", required" : ""}{a.variant_axis ? ", variant option" : ""})</span>
              </div>
            ))}
          </div>
        )}
        {attrs.map((a, i) => {
          const d = defById.get(a.attribute_id);
          return (
            <div key={a.attribute_id} className="flex items-center gap-2 text-sm rounded border px-2 py-1.5">
              <span className="flex-1">{d?.label ?? "?"} <span className="text-xs text-muted-foreground">({d?.key})</span></span>
              <label className="flex items-center gap-1 text-xs"><Switch checked={a.is_required} onCheckedChange={(v) => setAttrs((l) => l.map((x, k) => (k === i ? { ...x, is_required: v } : x)))} /> Required</label>
              {d?.is_variant_axis && (
                <label className="flex items-center gap-1 text-xs"><Switch checked={a.is_variant_axis} onCheckedChange={(v) => setAttrs((l) => l.map((x, k) => (k === i ? { ...x, is_variant_axis: v } : x)))} /> Variant option</label>
              )}
              <button aria-label="Up" onClick={() => moveAttr(i, -1)} className="p-1 hover:bg-slate-100 rounded"><ArrowUp className="h-3 w-3" /></button>
              <button aria-label="Down" onClick={() => moveAttr(i, 1)} className="p-1 hover:bg-slate-100 rounded"><ArrowDown className="h-3 w-3" /></button>
              <button aria-label="Remove" onClick={() => setAttrs((l) => l.filter((_, k) => k !== i))} className="p-1 hover:bg-red-50 text-red-600 rounded"><X className="h-3 w-3" /></button>
            </div>
          );
        })}
        {available.length > 0 && (
          <Select value="" onValueChange={(id) => setAttrs((l) => [...l, { attribute_id: id, is_required: false, is_variant_axis: false }])}>
            <SelectTrigger className="w-60"><SelectValue placeholder="+ Add attribute" /></SelectTrigger>
            <SelectContent>{available.map((d) => <SelectItem key={d.id} value={d.id}>{d.label} ({d.key})</SelectItem>)}</SelectContent>
          </Select>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={save} disabled={busy || !c.name || !c.slug} className="bg-[#14B8A6] hover:bg-[#0F9488]">{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label className="text-xs text-muted-foreground">{label}</label>{children}</div>;
}
