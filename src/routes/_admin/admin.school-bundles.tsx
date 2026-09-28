import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import {
  schoolsQuery,
  schoolClassesQuery,
  schoolBundleQuery,
  type SchoolBundleItem,
} from "@/lib/schools-data";
import { adminListProductsLite } from "@/lib/admin.functions";
import { pkr } from "@/components/layout/site-chrome";

export const Route = createFileRoute("/_admin/admin/school-bundles")({ component: SchoolBundlesAdminPage });

type ItemDraft = {
  id?: string;
  product_id: string;
  item_type: "book" | "notebook" | "stationery";
  quantity: number;
  sort_order: number;
  // for display
  product?: { id: string; name: string; price: number } | null;
};

function SchoolBundlesAdminPage() {
  const qc = useQueryClient();
  const { data: schools } = useQuery(schoolsQuery());
  const [schoolId, setSchoolId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const { data: classes } = useQuery(schoolClassesQuery(schoolId || null));
  const { data: bundle, isLoading: bundleLoading } = useQuery(schoolBundleQuery(schoolId || null, classId || null));

  const listProducts = useServerFn(adminListProductsLite);
  const { data: products } = useQuery({
    queryKey: ["admin-products-lite"],
    queryFn: () => listProducts(),
  });

  const [items, setItems] = useState<ItemDraft[]>([]);
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadedKey, setLoadedKey] = useState<string>("");

  // sync from fetched bundle when school/class change
  const currentKey = `${schoolId}|${classId}`;
  useEffect(() => {
    if (!schoolId || !classId) return;
    if (currentKey !== loadedKey && !bundleLoading) {
      setLoadedKey(currentKey);
      if (bundle) {
        setIsActive(bundle.is_active);
        setItems(
          (bundle.items ?? []).map((it: SchoolBundleItem) => ({
            id: it.id,
            product_id: it.product_id,
            item_type: it.item_type,
            quantity: it.quantity,
            sort_order: it.sort_order,
            product: it.product ? { id: it.product.id, name: it.product.name, price: it.product.price } : null,
          })),
        );
      } else {
        setIsActive(true);
        setItems([]);
      }
    }
  }, [currentKey, loadedKey, bundle, bundleLoading, schoolId, classId]);

  const productList = (products ?? []) as Array<{ id: string; name: string; price: number }>;
  const totalPrice = useMemo(
    () =>
      items.reduce((s, it) => {
        const p = it.product ?? productList.find((p) => p.id === it.product_id);
        return s + Number(p?.price ?? 0) * (it.quantity || 1);
      }, 0),
    [items, productList],
  );

  const addItem = () => {
    setItems([...items, { product_id: "", item_type: "book", quantity: 1, sort_order: items.length }]);
  };

  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItems(items.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
  };

  const removeItem = (idx: number) => {
    setItems(items.filter((_, i) => i !== idx));
  };

  const save = async () => {
    if (!schoolId || !classId) { toast.error("Select school and class"); return; }
    if (items.some((it) => !it.product_id)) { toast.error("All items must have a product"); return; }
    setSaving(true);
    try {
      const school = schools?.find((s) => s.id === schoolId);
      const cls = classes?.find((c) => c.id === classId);
      const bundle_name = `${school?.name ?? ""} – ${cls?.class_name ?? ""} Complete Set`;

      let bundleId = bundle?.id;
      if (bundleId) {
        const { error } = await supabase
          .from("school_bundles")
          .update({ bundle_name, total_price: totalPrice, is_active: isActive })
          .eq("id", bundleId);
        if (error) throw error;
        // wipe existing items
        await supabase.from("school_bundle_items").delete().eq("bundle_id", bundleId);
      } else {
        const { data: ins, error } = await supabase
          .from("school_bundles")
          .insert({ school_id: schoolId, class_id: classId, bundle_name, total_price: totalPrice, is_active: isActive })
          .select("id")
          .single();
        if (error) throw error;
        bundleId = ins.id;
      }
      if (!bundleId) throw new Error("Bundle could not be saved");
      const savedId: string = bundleId;

      if (items.length > 0) {
        const rows = items.map((it, i) => ({
          bundle_id: savedId,
          product_id: it.product_id,
          item_type: it.item_type,
          quantity: it.quantity || 1,
          sort_order: i,
        }));
        const { error } = await supabase.from("school_bundle_items").insert(rows);
        if (error) throw error;
      }

      toast.success("Bundle saved");
      setLoadedKey(""); // force reload
      qc.invalidateQueries({ queryKey: ["school-bundle"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to save bundle");
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminShell title="School Bundles">
      <div className="bg-white rounded-xl border p-4 md:p-6 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground">School</label>
            <Select value={schoolId} onValueChange={(v) => { setSchoolId(v); setClassId(""); setLoadedKey(""); }}>
              <SelectTrigger><SelectValue placeholder="Select school" /></SelectTrigger>
              <SelectContent>
                {(schools ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">Class</label>
            <Select value={classId} onValueChange={(v) => { setClassId(v); setLoadedKey(""); }} disabled={!schoolId}>
              <SelectTrigger><SelectValue placeholder="Select class" /></SelectTrigger>
              <SelectContent>
                {(classes ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.class_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {schoolId && classId && (
          <>
            <div className="flex items-center justify-between border-y py-3">
              <div>
                <div className="text-sm font-medium">
                  {bundle ? "Editing existing bundle" : "Creating new bundle"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Total auto-calculated from items × price
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">Active</span>
                <Switch checked={isActive} onCheckedChange={setIsActive} />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-semibold">Bundle Items</h3>
                <Button size="sm" onClick={addItem} variant="outline">
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>

              {items.length === 0 ? (
                <div className="text-center text-sm text-muted-foreground py-8 border border-dashed rounded">
                  No items yet. Click "Add Item" to start building the bundle.
                </div>
              ) : (
                <div className="space-y-2">
                  {items.map((it, idx) => {
                    const product = productList.find((p) => p.id === it.product_id) ?? it.product;
                    return (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-slate-50 rounded-md p-2">
                        <div className="col-span-12 md:col-span-5">
                          <Select value={it.product_id} onValueChange={(v) => updateItem(idx, { product_id: v })}>
                            <SelectTrigger><SelectValue placeholder="Choose product" /></SelectTrigger>
                            <SelectContent className="max-h-72">
                              {productList.map((p) => (
                                <SelectItem key={p.id} value={p.id}>
                                  {p.name} ({pkr(Number(p.price))})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-5 md:col-span-3">
                          <Select value={it.item_type} onValueChange={(v) => updateItem(idx, { item_type: v as any })}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="book">Book</SelectItem>
                              <SelectItem value="notebook">Notebook</SelectItem>
                              <SelectItem value="stationery">Stationery</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="col-span-4 md:col-span-2">
                          <Input
                            type="number"
                            min={1}
                            value={it.quantity}
                            onChange={(e) => updateItem(idx, { quantity: Number(e.target.value) || 1 })}
                            placeholder="Qty"
                          />
                        </div>
                        <div className="col-span-2 md:col-span-1 text-right text-xs text-muted-foreground">
                          {product ? pkr(Number(product.price) * (it.quantity || 1)) : "—"}
                        </div>
                        <div className="col-span-1 text-right">
                          <button onClick={() => removeItem(idx)} className="p-1.5 hover:bg-red-50 text-red-600 rounded">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t pt-4">
              <div>
                <div className="text-xs text-muted-foreground">Bundle Total</div>
                <div className="font-display text-2xl font-bold text-brand-gold">{pkr(totalPrice)}</div>
              </div>
              <Button onClick={save} disabled={saving} className="bg-[#14B8A6] hover:bg-[#0F9488]">
                <Save className="h-4 w-4 mr-1" /> {saving ? "Saving…" : "Save Bundle"}
              </Button>
            </div>
          </>
        )}

        {(!schoolId || !classId) && (
          <div className="text-center text-sm text-muted-foreground py-10">
            Select a school and class above to begin editing its bundle.
          </div>
        )}
      </div>
    </AdminShell>
  );
}
