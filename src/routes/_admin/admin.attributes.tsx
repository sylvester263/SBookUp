import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, ArrowUp, ArrowDown, X, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { useCatalog } from "@/components/admin/catalog-shared";
import { adminSaveAttribute, adminAttributeUsage } from "@/lib/catalog-admin.functions";
import type { AttributeDefinition, AttributeOption, AttributeType } from "@/lib/attributes";

export const Route = createFileRoute("/_admin/admin/attributes")({ component: AttributesPage });

const TYPE_LABEL: Record<AttributeType, string> = { select: "Single choice", multiselect: "Multiple choice", number: "Number", text: "Text" };

type Draft = Omit<AttributeDefinition, "id" | "options"> & { id?: string; options: (AttributeOption & { _new?: boolean })[] };
const empty = (): Draft => ({
  key: "", label: "", type: "select", unit: "", help_text: "", options: [], allow_new_options: false,
  is_filterable: true, is_variant_axis: false, sort_order: 0, is_active: true,
});

function AttributesPage() {
  const catalog = useCatalog();
  const [drawer, setDrawer] = useState<Draft | null>(null);
  const defs = catalog.data?.definitions ?? [];
  const usedIn = (id: string) =>
    (catalog.data?.categoryAttributes ?? []).filter((r) => r.attribute_id === id)
      .map((r) => catalog.data?.categories.find((c) => c.id === r.category_id)?.name).filter(Boolean);

  return (
    <AdminShell title="Attributes">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center gap-3">
          <p className="text-sm text-muted-foreground">Product details and filters (Age Group, Author, Size…). Assign them to categories on the Categories screen.</p>
          <Button onClick={() => setDrawer(empty())} className="bg-[#14B8A6] hover:bg-[#0F9488]"><Plus className="h-4 w-4 mr-1" /> Add Attribute</Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground">
              <tr><th className="text-left p-2">Attribute</th><th className="text-left p-2">Type</th><th className="text-left p-2">Options</th><th className="text-left p-2">Categories</th><th className="text-left p-2">Flags</th><th className="p-2"></th></tr>
            </thead>
            <tbody>
              {catalog.isLoading && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {defs.map((d) => (
                <tr key={d.id} className={`border-t hover:bg-slate-50 ${d.is_active === false ? "text-muted-foreground" : ""}`}>
                  <td className="p-2"><div className="font-medium">{d.label}</div><div className="text-xs font-mono text-muted-foreground">{d.key}</div></td>
                  <td className="p-2 text-xs">{TYPE_LABEL[d.type]}{d.unit ? ` (${d.unit})` : ""}</td>
                  <td className="p-2 text-xs max-w-[260px] truncate">{d.options.filter((o) => o.is_active !== false).map((o) => o.label).join(", ") || "—"}</td>
                  <td className="p-2 text-xs max-w-[200px] truncate">{usedIn(d.id!).join(", ") || "—"}</td>
                  <td className="p-2 text-xs space-x-1">
                    {d.is_active === false && <span className="rounded bg-slate-100 px-1.5 py-0.5">Inactive</span>}
                    {d.is_filterable && <span className="rounded bg-teal-50 text-teal-700 px-1.5 py-0.5">Filter</span>}
                    {d.is_variant_axis && <span className="rounded bg-violet-50 text-violet-700 px-1.5 py-0.5">Variant option</span>}
                    {d.allow_new_options && <span className="rounded bg-amber-50 text-amber-700 px-1.5 py-0.5">Open list</span>}
                  </td>
                  <td className="p-2 text-right"><button title="Edit" onClick={() => setDrawer({ ...d, unit: d.unit ?? "", help_text: d.help_text ?? "", options: d.options.map((o) => ({ ...o })) })} className="p-1.5 hover:bg-slate-100 rounded"><Pencil className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          <SheetHeader><SheetTitle>{drawer?.id ? `Edit ${drawer.label}` : "New attribute"}</SheetTitle></SheetHeader>
          {drawer && <AttributeForm key={drawer.id ?? "new"} initial={drawer} onDone={() => setDrawer(null)} />}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function AttributeForm({ initial, onDone }: { initial: Draft; onDone: () => void }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(adminSaveAttribute);
  const usageFn = useServerFn(adminAttributeUsage);
  const [d, setD] = useState<Draft>(initial);
  const [newOpt, setNewOpt] = useState("");
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const usage = useQuery({
    queryKey: ["attr-usage", initial.key],
    queryFn: () => usageFn({ data: { key: initial.key } }),
    enabled: !!initial.id,
  });
  const usageOf = (value: string) => {
    const u = (usage.data ?? []).find((x) => x.value === value);
    return u ? u.products + u.variants : 0;
  };
  const hasOptions = d.type === "select" || d.type === "multiselect";

  function addOption() {
    const v = newOpt.trim();
    if (!v) return;
    if (d.options.some((o) => o.value.toLowerCase() === v.toLowerCase())) return toast.error("That option already exists");
    set("options", [...d.options, { value: v, label: v, is_active: true, _new: true }]);
    setNewOpt("");
  }
  const moveOpt = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= d.options.length) return;
    const next = [...d.options];
    [next[i], next[j]] = [next[j], next[i]];
    set("options", next);
  };
  function removeOpt(i: number) {
    const o = d.options[i];
    const n = usageOf(o.value);
    if (n > 0 && !confirm(`"${o.label}" is used by ${n} product(s)/variant(s). Removing it leaves their value without a matching option.\n\nTip: switch it off (inactive) instead. Remove anyway?`)) return;
    set("options", d.options.filter((_, k) => k !== i));
  }

  async function save(confirmRemoveUsed = false) {
    setBusy(true);
    try {
      await saveFn({ data: { ...d, options: d.options.map(({ _new, ...o }) => o), confirmRemoveUsed } as any });
      toast.success("Saved");
      qc.invalidateQueries({ queryKey: ["admin-catalog"] });
      onDone();
    } catch (e: any) {
      const msg = String(e?.message ?? "Failed");
      if (msg.startsWith("REMOVE_USED:") && confirm(msg.replace("REMOVE_USED: ", "") + "\n\nRemove them anyway?")) return save(true);
      toast.error(msg.replace("REMOVE_USED: ", ""));
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4 mt-4 pb-8">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Label (shown to customers)"><Input value={d.label} onChange={(e) => { set("label", e.target.value); if (!initial.id) set("key", e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^(\d)/, "a_$1").slice(0, 40)); }} /></Field>
        <Field label="Key (used in CSV as attr_<key>)"><Input value={d.key} disabled={!!initial.id} onChange={(e) => set("key", e.target.value)} className="font-mono" /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Type">
          <Select value={d.type} onValueChange={(v) => set("type", v as AttributeType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{(Object.keys(TYPE_LABEL) as AttributeType[]).map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}</SelectContent>
          </Select>
        </Field>
        <Field label="Unit (optional)"><Input value={d.unit ?? ""} onChange={(e) => set("unit", e.target.value)} placeholder="pages" /></Field>
      </div>
      <Field label="Help text (optional)"><Input value={d.help_text ?? ""} onChange={(e) => set("help_text", e.target.value)} placeholder="20-page partition per subject" /></Field>
      <div className="flex flex-wrap gap-5">
        <label className="flex items-center gap-2 text-sm"><Switch checked={d.is_active !== false} onCheckedChange={(v) => set("is_active", v)} /> Active</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!d.is_filterable} onCheckedChange={(v) => set("is_filterable", v)} /> Show as filter</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={!!d.is_variant_axis} onCheckedChange={(v) => set("is_variant_axis", v)} /> Can be a variant option</label>
        {hasOptions && <label className="flex items-center gap-2 text-sm"><Switch checked={!!d.allow_new_options} onCheckedChange={(v) => set("allow_new_options", v)} /> Staff can add options while editing products</label>}
      </div>

      {hasOptions && (
        <div className="border-t pt-4 space-y-2">
          <div className="text-sm font-semibold">Options</div>
          {d.options.map((o, i) => {
            const n = usageOf(o.value);
            return (
              <div key={o._new ? `new-${i}` : o.value} className={`flex items-center gap-2 rounded border px-2 py-1.5 ${o.is_active === false ? "opacity-60" : ""}`}>
                <Input value={o.label} onChange={(e) => set("options", d.options.map((x, k) => (k === i ? { ...x, label: e.target.value, value: x._new ? e.target.value : x.value } : x)))} className="h-8" />
                <span className="text-xs text-muted-foreground whitespace-nowrap" title="Products / variants using it">{initial.id ? `${n} used` : ""}</span>
                <label className="flex items-center gap-1 text-xs"><Switch checked={o.is_active !== false} onCheckedChange={(v) => set("options", d.options.map((x, k) => (k === i ? { ...x, is_active: v } : x)))} /></label>
                <button aria-label="Up" onClick={() => moveOpt(i, -1)} className="p-1 hover:bg-slate-100 rounded"><ArrowUp className="h-3 w-3" /></button>
                <button aria-label="Down" onClick={() => moveOpt(i, 1)} className="p-1 hover:bg-slate-100 rounded"><ArrowDown className="h-3 w-3" /></button>
                <button aria-label="Remove" onClick={() => removeOpt(i)} className="p-1 hover:bg-red-50 text-red-600 rounded">
                  {n > 0 ? <AlertTriangle className="h-3 w-3" /> : <X className="h-3 w-3" />}
                </button>
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">Renaming changes the label only; products keep their value. Switch an option off to hide it without touching products.</p>
          <div className="flex gap-2">
            <Input value={newOpt} onChange={(e) => setNewOpt(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addOption())} placeholder="New option" className="h-9" />
            <Button variant="outline" size="sm" onClick={addOption}>Add</Button>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onDone}>Cancel</Button>
        <Button onClick={() => save()} disabled={busy || !d.label || !d.key} className="bg-[#14B8A6] hover:bg-[#0F9488]">{busy ? "Saving…" : "Save"}</Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><label className="text-xs text-muted-foreground">{label}</label>{children}</div>;
}
