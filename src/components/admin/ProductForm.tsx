// Admin product form: details, multi-category + dynamic attributes, pricing
// (incl. packs), new-arrival flag, images, and the variant matrix editor.
import React, { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Upload, X, Star, Wand2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useCatalog, flattenTree } from "@/components/admin/catalog-shared";
import { adminGetProductCategories, adminSaveVariants } from "@/lib/catalog-admin.functions";
import { adminListVariants, adminDeleteVariant } from "@/lib/admin.functions";
import { effectiveAttributesFor, variantCombinations, comboKey } from "@/lib/catalog-import";
import { validateProductAttributes, type EffectiveAttribute } from "@/lib/attributes";
import { formatPackPrice } from "@/lib/pricing";

const slugify = (s: string) => s.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const numOrNull = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function ProductForm({ product, upsertFn, uploadFn, onSaved, onClose }: {
  product: any; upsertFn: any; uploadFn: any; onSaved: () => void; onClose: () => void;
}) {
  const catalog = useCatalog();
  const getCatsFn = useServerFn(adminGetProductCategories);
  const [p, setP] = useState<any>(() => ({
    sell_unit: "item", pack_size: null, is_new_arrival: false,
    ...product,
    attributes: { ...(product.attributes ?? {}) },
    new_arrival_until: product.new_arrival_until ?? "",
    unit_label: product.unit_label ?? "",
  }));
  const [catIds, setCatIds] = useState<string[]>([]);
  const [primary, setPrimary] = useState<string | null>(null);
  const [loadedCats, setLoadedCats] = useState(!product.id);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: string, v: any) => setP((prev: any) => ({ ...prev, [k]: v }));
  const setAttr = (k: string, v: any) => setP((prev: any) => ({ ...prev, attributes: { ...prev.attributes, [k]: v } }));

  useEffect(() => {
    if (!product.id) return;
    getCatsFn({ data: { productId: product.id } })
      .then((r) => { setCatIds(r.category_ids); setPrimary(r.primary_category_id ?? r.category_ids[0] ?? null); })
      .catch(() => toast.error("Couldn't load categories"))
      .finally(() => setLoadedCats(true));
  }, [product.id, getCatsFn]);

  const data = catalog.data;
  const applicable: EffectiveAttribute[] = useMemo(() => (data && catIds.length ? effectiveAttributesFor(catIds, data) : []), [data, catIds]);
  const productAttrs = applicable.filter((a) => !a.variant_axis);
  const axes = applicable.filter((a) => a.variant_axis);
  const storedOnly = Object.keys(p.attributes ?? {}).filter((k) => !applicable.some((a) => a.key === k));

  function toggleCategory(id: string, on: boolean) {
    setCatIds((ids) => {
      const next = on ? Array.from(new Set([...ids, id])) : ids.filter((x) => x !== id);
      if (!next.includes(primary ?? "")) choosePrimary(next[0] ?? null);
      return next;
    });
  }
  function choosePrimary(id: string | null) {
    setPrimary(id);
    // Pre-fill the selling unit from the category (new products, or still at defaults)
    const cat = data?.categories.find((c) => c.id === id);
    if (cat && (!p.id || (p.sell_unit === "item" && !p.pack_size))) {
      setP((prev: any) => ({
        ...prev,
        sell_unit: cat.default_sell_unit ?? "item",
        pack_size: cat.default_sell_unit === "pack" ? cat.default_pack_size : null,
        unit_label: cat.default_sell_unit === "pack" ? cat.default_unit_label ?? "" : "",
      }));
    }
  }

  async function uploadImage(file: File) {
    try {
      const { prepareUpload, toWebpPath } = await import("@/lib/image-upload");
      const { blob, contentType } = await prepareUpload(file);
      const safeName = toWebpPath(file.name.replace(/[^a-zA-Z0-9._-]/g, "_"));
      const { token, path, publicUrl } = await uploadFn({ data: { bucket: "product-images", filename: safeName } });
      const { error } = await supabase.storage.from("product-images").uploadToSignedUrl(path, token, blob, { contentType } as any);
      if (error) throw error;
      set("images", [...(p.images ?? []), publicUrl]);
    } catch (e: any) { toast.error(e?.message ?? "Upload failed"); }
  }

  async function save() {
    if (!catIds.length) { setErrors({ categories: "Choose at least one category" }); return toast.error("Choose at least one category"); }
    // Same validation as the server, so problems show next to the fields
    const applicableKeys = new Set(applicable.map((a) => a.key));
    const submitted = Object.fromEntries(Object.entries(p.attributes ?? {}).filter(([k]) => applicableKeys.has(k)));
    const check = validateProductAttributes(submitted, applicable);
    if (Object.keys(check.errors).length) { setErrors(check.errors); return toast.error("Please fix the highlighted fields"); }
    if (p.sell_unit === "pack" && !(Number(p.pack_size) >= 2)) { setErrors({ pack_size: "Pack size must be 2 or more" }); return toast.error("Pack size must be 2 or more"); }
    setErrors({});
    setBusy(true);
    try {
      const payload = {
        id: p.id, name: p.name, slug: p.slug || slugify(p.name), sku: p.sku ?? "", isbn: p.isbn ?? "",
        brand: p.brand ?? "", edition: p.edition ?? "", description: p.description ?? "",
        price: Number(p.price), sale_price: numOrNull(p.sale_price), cost_price: numOrNull(p.cost_price),
        stock_quantity: Number(p.stock_quantity) || 0, low_stock_threshold: Number(p.low_stock_threshold) || 0,
        weight_grams: numOrNull(p.weight_grams), is_active: !!p.is_active, is_featured: !!p.is_featured,
        images: p.images ?? [], tags: p.tags ?? [],
        category_ids: catIds, primary_category_id: primary ?? catIds[0], attributes: submitted,
        sell_unit: p.sell_unit, pack_size: p.sell_unit === "pack" ? Number(p.pack_size) : null, unit_label: p.unit_label || null,
        is_new_arrival: !!p.is_new_arrival, new_arrival_until: p.new_arrival_until || null,
      };
      const { id } = await upsertFn({ data: payload });
      toast.success(p.id ? "Saved" : "Created — you can now add variants");
      if (!p.id) set("id", id); // stay open so variants can be added
      onSaved();
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
    finally { setBusy(false); }
  }

  const tree = data ? flattenTree(data.categories) : [];

  return (
    <Tabs defaultValue="basic" className="mt-4">
      <TabsList className="grid grid-cols-5 w-full">
        <TabsTrigger value="basic">Details</TabsTrigger>
        <TabsTrigger value="categories">Categories{errors.categories || Object.keys(errors).some((k) => k !== "categories" && k !== "pack_size") ? " •" : ""}</TabsTrigger>
        <TabsTrigger value="pricing">Pricing</TabsTrigger>
        <TabsTrigger value="variants">Variants</TabsTrigger>
        <TabsTrigger value="media">Images</TabsTrigger>
      </TabsList>

      <TabsContent value="basic" className="space-y-3 pt-4">
        <F label="Name"><Input value={p.name} onChange={(e) => { set("name", e.target.value); if (!p.id) set("slug", slugify(e.target.value)); }} /></F>
        <div className="grid grid-cols-2 gap-3">
          <F label="Slug"><Input value={p.slug} onChange={(e) => set("slug", slugify(e.target.value))} /></F>
          <F label="SKU"><Input value={p.sku ?? ""} onChange={(e) => set("sku", e.target.value)} /></F>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <F label="ISBN"><Input value={p.isbn ?? ""} onChange={(e) => set("isbn", e.target.value)} /></F>
          <F label="Brand"><Input value={p.brand ?? ""} onChange={(e) => set("brand", e.target.value)} /></F>
          <F label="Edition"><Input value={p.edition ?? ""} onChange={(e) => set("edition", e.target.value)} /></F>
        </div>
        <F label="Description"><Textarea rows={5} value={p.description ?? ""} onChange={(e) => set("description", e.target.value)} /></F>
        <div className="flex flex-wrap items-center gap-6 pt-2">
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!p.is_active} onCheckedChange={(v) => set("is_active", v)} /> Active</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!p.is_featured} onCheckedChange={(v) => set("is_featured", v)} /> Featured</label>
          <label className="flex items-center gap-2 text-sm"><Switch checked={!!p.is_new_arrival} onCheckedChange={(v) => set("is_new_arrival", v)} /> New arrival</label>
          {p.is_new_arrival && (
            <label className="flex items-center gap-2 text-sm">until <Input type="date" className="h-8 w-40" value={p.new_arrival_until ?? ""} onChange={(e) => set("new_arrival_until", e.target.value)} /></label>
          )}
        </div>
      </TabsContent>

      <TabsContent value="categories" className="space-y-4 pt-4">
        <div>
          <Label className="text-xs">Categories — tick every category the product belongs to, and pick one ★ primary (used for its URL and breadcrumbs)</Label>
          {errors.categories && <p className="text-xs text-red-600 mt-1">{errors.categories}</p>}
          <div className="mt-2 max-h-64 overflow-y-auto border rounded-md divide-y">
            {!loadedCats || catalog.isLoading ? <div className="p-3 text-sm text-muted-foreground">Loading…</div> : tree.map(({ c, depth }) => {
              const on = catIds.includes(c.id);
              return (
                <div key={c.id} className="flex items-center gap-2 px-2 py-1.5 text-sm" style={{ paddingLeft: 8 + depth * 18 }}>
                  <Checkbox checked={on} onCheckedChange={(v) => toggleCategory(c.id, !!v)} id={`cat-${c.id}`} />
                  <label htmlFor={`cat-${c.id}`} className={`flex-1 cursor-pointer ${c.is_active ? "" : "text-muted-foreground"}`}>{c.name}{!c.is_active && " (hidden)"}</label>
                  {on && (
                    <button type="button" onClick={() => choosePrimary(c.id)} title="Make primary"
                      className={`flex items-center gap-1 text-xs rounded px-1.5 py-0.5 ${primary === c.id ? "bg-amber-100 text-amber-800" : "text-muted-foreground hover:bg-slate-100"}`}>
                      <Star className={`h-3 w-3 ${primary === c.id ? "fill-current" : ""}`} /> {primary === c.id ? "Primary" : "Make primary"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-3">
          <Label className="text-xs">Details for the selected categories</Label>
          {!catIds.length && <p className="text-sm text-muted-foreground">Choose a category to see its fields.</p>}
          {catIds.length > 0 && !productAttrs.length && <p className="text-sm text-muted-foreground">These categories have no extra fields.</p>}
          <div className="grid grid-cols-2 gap-3">
            {productAttrs.map((a) => (
              <AttributeField key={a.key} def={a} value={p.attributes?.[a.key]} error={errors[a.key]} onChange={(v) => setAttr(a.key, v)} />
            ))}
          </div>
          {axes.length > 0 && <p className="text-xs text-muted-foreground">{axes.map((a) => a.label).join(" and ")} are set per variant (Variants tab).</p>}
          {storedOnly.length > 0 && (
            <p className="text-xs text-muted-foreground">Also stored (not used by these categories, kept as-is): {storedOnly.map((k) => `${k}: ${String(p.attributes[k])}`).join(", ")}</p>
          )}
        </div>
      </TabsContent>

      <TabsContent value="pricing" className="space-y-3 pt-4">
        <div className="grid grid-cols-3 gap-3">
          <F label="Sold by">
            <Select value={p.sell_unit ?? "item"} onValueChange={(v) => set("sell_unit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="item">Single item</SelectItem><SelectItem value="pack">Pack</SelectItem></SelectContent>
            </Select>
          </F>
          {p.sell_unit === "pack" && <>
            <F label="Pack size" error={errors.pack_size}><Input type="number" min={2} value={p.pack_size ?? ""} onChange={(e) => set("pack_size", e.target.value)} /></F>
            <F label="Unit name"><Input value={p.unit_label ?? ""} onChange={(e) => set("unit_label", e.target.value)} placeholder="sheet" /></F>
          </>}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <F label="Cost (PKR)"><Input type="number" value={p.cost_price ?? ""} onChange={(e) => set("cost_price", e.target.value)} /></F>
          <F label={p.sell_unit === "pack" ? "Price per pack (PKR)" : "Price (PKR)"}><Input type="number" value={p.price} onChange={(e) => set("price", e.target.value)} /></F>
          <F label="Sale price"><Input type="number" value={p.sale_price ?? ""} onChange={(e) => set("sale_price", e.target.value)} /></F>
        </div>
        {p.sell_unit === "pack" && Number(p.pack_size) >= 2 && Number(p.price) > 0 && (
          <p className="text-sm text-muted-foreground">Shown to customers as: <strong>{formatPackPrice(Number(p.sale_price && Number(p.sale_price) < Number(p.price) ? p.sale_price : p.price), { sell_unit: "pack", pack_size: Number(p.pack_size), unit_label: p.unit_label })}</strong></p>
        )}
        <div className="grid grid-cols-3 gap-3">
          <F label={p.sell_unit === "pack" ? "Stock (packs)" : "Stock qty"}><Input type="number" value={p.stock_quantity} onChange={(e) => set("stock_quantity", e.target.value)} /></F>
          <F label="Low stock threshold"><Input type="number" value={p.low_stock_threshold} onChange={(e) => set("low_stock_threshold", e.target.value)} /></F>
          <F label="Weight (g)"><Input type="number" value={p.weight_grams ?? ""} onChange={(e) => set("weight_grams", e.target.value)} /></F>
        </div>
      </TabsContent>

      <TabsContent value="variants" className="pt-4">
        {p.id ? <VariantMatrix productId={p.id} axes={axes} basePrice={Number(p.price) || 0} /> : <p className="text-sm text-muted-foreground">Save the product first, then add variants.</p>}
      </TabsContent>

      <TabsContent value="media" className="space-y-3 pt-4">
        <Label>Images</Label>
        <div className="grid grid-cols-4 gap-3">
          {(p.images ?? []).map((url: string, i: number) => (
            <div key={i} className="relative group">
              <img src={url} className="aspect-square object-cover rounded border w-full" alt="" />
              <button type="button" onClick={() => set("images", (p.images ?? []).filter((_: any, j: number) => j !== i))}
                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100"><X className="h-3 w-3" /></button>
            </div>
          ))}
          <label className="aspect-square flex flex-col items-center justify-center border-2 border-dashed rounded text-xs text-muted-foreground hover:bg-slate-50 cursor-pointer">
            <Upload className="h-5 w-5 mb-1" /> Upload
            <input type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadImage(e.target.files[0])} />
          </label>
        </div>
        <F label="Tags (comma separated)"><Input value={(p.tags ?? []).join(", ")} onChange={(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} /></F>
      </TabsContent>

      <div className="flex justify-end gap-2 pt-6 mt-6 border-t sticky bottom-0 bg-white pb-2">
        <Button variant="outline" onClick={onClose}>Close</Button>
        <Button onClick={save} disabled={busy || !p.name} className="bg-[#14B8A6] hover:bg-[#0F9488]">{busy ? "Saving…" : "Save product"}</Button>
      </div>
    </Tabs>
  );
}

/** One dynamic field, rendered from the attribute definition. */
function AttributeField({ def, value, error, onChange }: { def: EffectiveAttribute; value: any; error?: string; onChange: (v: any) => void }) {
  const label = `${def.label}${def.unit ? ` (${def.unit})` : ""}${def.is_required ? " *" : ""}`;
  const options = def.options.filter((o) => o.is_active !== false || o.value === value);
  const listId = `attr-${def.key}-options`;
  let input: React.ReactNode;
  if (def.type === "number") input = <Input type="number" min={0} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} />;
  else if (def.type === "text") input = <Input value={value ?? ""} onChange={(e) => onChange(e.target.value)} />;
  else if (def.type === "multiselect") {
    const cur: string[] = Array.isArray(value) ? value : [];
    input = (
      <div className="flex flex-wrap gap-2 border rounded-md p-2">
        {options.map((o) => (
          <label key={o.value} className="flex items-center gap-1 text-xs">
            <Checkbox checked={cur.includes(o.value)} onCheckedChange={(v) => onChange(v ? [...cur, o.value] : cur.filter((x) => x !== o.value))} /> {o.label}
          </label>
        ))}
      </div>
    );
  } else if (def.allow_new_options) {
    // Searchable list that also accepts a new value (e.g. a new author)
    input = (
      <>
        <Input list={listId} value={value ?? ""} onChange={(e) => onChange(e.target.value)} placeholder="Type to search or add" />
        <datalist id={listId}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</datalist>
      </>
    );
  } else {
    input = (
      <Select value={value ?? "__none"} onValueChange={(v) => onChange(v === "__none" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__none">—</SelectItem>
          {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
    );
  }
  return <F label={label} error={error} help={def.help_text ?? undefined}>{input}</F>;
}

type MatrixRow = { id?: string; option_values: Record<string, string>; name: string; sku: string; price: string; stock: string; image_url: string; is_active: boolean; selected?: boolean };

/** Variant matrix: pick sizes / colours, generate every combination, edit per row, bulk-set. */
function VariantMatrix({ productId, axes, basePrice }: { productId: string; axes: EffectiveAttribute[]; basePrice: number }) {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListVariants);
  const saveFn = useServerFn(adminSaveVariants);
  const delFn = useServerFn(adminDeleteVariant);
  const variants = useQuery({ queryKey: ["admin-variants", productId], queryFn: () => listFn({ data: { productId } }) });
  const [rows, setRows] = useState<MatrixRow[]>([]);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [bulk, setBulk] = useState({ price: "", stock: "" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!variants.data) return;
    setRows((variants.data as any[]).map((v) => ({
      id: v.id, option_values: (v.option_values ?? {}) as Record<string, string>, name: v.name, sku: v.sku ?? "",
      price: v.price == null ? "" : String(v.price), stock: String(v.stock ?? 0), image_url: v.image_url ?? "", is_active: v.is_active !== false,
    })));
  }, [variants.data]);

  if (!axes.length) {
    return <p className="text-sm text-muted-foreground">This product's categories have no variant options. Add “Size”/“Colour” as variant options on the category (e.g. Character Costumes) to use the matrix.</p>;
  }

  function generate() {
    const combos = variantCombinations(axes.map((a) => ({ key: a.key, values: picked[a.key] ?? [] })));
    if (!combos.length || axes.some((a) => !(picked[a.key] ?? []).length)) return toast.error(`Pick at least one ${axes.map((a) => a.label).join(" and one ")}`);
    const have = new Set(rows.map((r) => comboKey(r.option_values)));
    const add = combos.filter((c) => !have.has(comboKey(c))).map((c) => ({ option_values: c, name: Object.values(c).join(" / "), sku: "", price: "", stock: "0", image_url: "", is_active: true }));
    setRows((r) => [...r, ...add]);
    toast.success(add.length ? `Added ${add.length} combinations — set stock and save` : "All combinations already exist");
  }
  const upd = (i: number, patch: Partial<MatrixRow>) => setRows((r) => r.map((x, k) => (k === i ? { ...x, ...patch } : x)));
  function applyBulk() {
    const targets = rows.some((r) => r.selected) ? rows.map((r) => !!r.selected) : rows.map(() => true);
    setRows((r) => r.map((x, i) => (targets[i] ? { ...x, ...(bulk.price !== "" ? { price: bulk.price } : {}), ...(bulk.stock !== "" ? { stock: bulk.stock } : {}) } : x)));
  }
  async function saveAll() {
    if (!rows.length) return;
    setBusy(true);
    try {
      await saveFn({
        data: {
          product_id: productId,
          rows: rows.map((r) => ({ id: r.id, name: r.name, sku: r.sku || null, price: r.price === "" ? null : Number(r.price), stock: Number(r.stock) || 0, image_url: r.image_url || null, is_active: r.is_active, option_values: r.option_values })),
        },
      });
      toast.success("Variants saved");
      qc.invalidateQueries({ queryKey: ["admin-variants", productId] });
    } catch (e: any) { toast.error(e?.message ?? "Failed to save variants"); }
    finally { setBusy(false); }
  }
  async function remove(i: number) {
    const r = rows[i];
    if (r.id) {
      if (!confirm(`Delete variant ${r.name}? Past orders keep their details.`)) return;
      try { await delFn({ data: { id: r.id } }); } catch (e: any) { return toast.error(e?.message ?? "Failed"); }
    }
    setRows((x) => x.filter((_, k) => k !== i));
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-3 space-y-3">
        <div className="text-sm font-semibold flex items-center gap-2"><Wand2 className="h-4 w-4" /> Generate combinations</div>
        {axes.map((a) => (
          <div key={a.key}>
            <div className="text-xs text-muted-foreground mb-1">{a.label}</div>
            <div className="flex flex-wrap gap-2">
              {a.options.filter((o) => o.is_active !== false).map((o) => {
                const on = (picked[a.key] ?? []).includes(o.value);
                return (
                  <button key={o.value} type="button" onClick={() => setPicked((pk) => ({ ...pk, [a.key]: on ? (pk[a.key] ?? []).filter((x) => x !== o.value) : [...(pk[a.key] ?? []), o.value] }))}
                    className={`text-xs rounded-full border px-2.5 py-1 ${on ? "bg-teal-600 text-white border-teal-600" : "hover:bg-slate-50"}`}>{o.label}</button>
                );
              })}
            </div>
          </div>
        ))}
        <Button size="sm" variant="outline" onClick={generate}>Add all combinations</Button>
      </div>

      {rows.length > 0 && (
        <>
          <div className="flex flex-wrap items-end gap-2 text-xs">
            <span className="text-muted-foreground">Bulk set {rows.some((r) => r.selected) ? "selected" : "all"} rows:</span>
            <Input className="h-8 w-28" placeholder="Price" type="number" value={bulk.price} onChange={(e) => setBulk({ ...bulk, price: e.target.value })} />
            <Input className="h-8 w-24" placeholder="Stock" type="number" value={bulk.stock} onChange={(e) => setBulk({ ...bulk, stock: e.target.value })} />
            <Button size="sm" variant="outline" onClick={applyBulk}>Apply</Button>
          </div>
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 text-muted-foreground">
                <tr>
                  <th className="p-1.5"><Checkbox checked={rows.every((r) => r.selected)} onCheckedChange={(v) => setRows((r) => r.map((x) => ({ ...x, selected: !!v })))} /></th>
                  {axes.map((a) => <th key={a.key} className="p-1.5 text-left">{a.label}</th>)}
                  <th className="p-1.5 text-left">SKU</th><th className="p-1.5 text-left">Price (blank = {basePrice})</th><th className="p-1.5 text-left">Stock</th><th className="p-1.5 text-left">Image URL</th><th className="p-1.5">Active</th><th />
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.id ?? comboKey(r.option_values)} className="border-t">
                    <td className="p-1.5"><Checkbox checked={!!r.selected} onCheckedChange={(v) => upd(i, { selected: !!v })} /></td>
                    {axes.map((a) => <td key={a.key} className="p-1.5 whitespace-nowrap">{r.option_values[a.key] ?? "—"}</td>)}
                    <td className="p-1"><Input className="h-7 w-28" value={r.sku} onChange={(e) => upd(i, { sku: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-7 w-24" type="number" value={r.price} onChange={(e) => upd(i, { price: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-7 w-20" type="number" value={r.stock} onChange={(e) => upd(i, { stock: e.target.value })} /></td>
                    <td className="p-1"><Input className="h-7 w-40" value={r.image_url} onChange={(e) => upd(i, { image_url: e.target.value })} placeholder="https://…" /></td>
                    <td className="p-1.5 text-center"><Switch checked={r.is_active} onCheckedChange={(v) => upd(i, { is_active: v })} /></td>
                    <td className="p-1"><button aria-label="Delete" onClick={() => remove(i)} className="p-1 text-red-600 hover:bg-red-50 rounded"><Trash2 className="h-3.5 w-3.5" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end"><Button size="sm" onClick={saveAll} disabled={busy} className="bg-[#14B8A6] hover:bg-[#0F9488]">{busy ? "Saving…" : `Save ${rows.length} variants`}</Button></div>
        </>
      )}
    </div>
  );
}

function F({ label, children, error, help }: { label: string; children: React.ReactNode; error?: string; help?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
      {help && !error && <p className="text-[11px] text-muted-foreground">{help}</p>}
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}
