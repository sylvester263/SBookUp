import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { adminListCoupons, adminUpsertCoupon, adminDeleteCoupon } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/coupons")({ component: CouponsPage });

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

function empty() {
  return { id: undefined as string | undefined, code: "", type: "percent" as "percent" | "fixed", value: 10, min_order_amount: 0, max_uses: null as number | null, valid_from: "", valid_until: "", is_active: true };
}

function CouponsPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListCoupons);
  const upsertFn = useServerFn(adminUpsertCoupon);
  const deleteFn = useServerFn(adminDeleteCoupon);
  const coupons = useQuery({ queryKey: ["admin-coupons"], queryFn: () => listFn() });
  const [drawer, setDrawer] = useState<any | null>(null);

  async function del(id: string) {
    if (!confirm("Delete coupon?")) return;
    try { await deleteFn({ data: { id } }); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); toast.success("Deleted"); }
    catch (e: any) { toast.error(e?.message ?? "Failed"); }
  }

  return (
    <AdminShell title="Coupons">
      <div className="bg-white rounded-xl border">
        <div className="p-4 border-b flex justify-between items-center">
          <p className="text-sm text-muted-foreground">Promo codes for discounts at checkout.</p>
          <Button onClick={() => setDrawer(empty())} className="bg-[#14B8A6] hover:bg-[#0F9488]"><Plus className="h-4 w-4 mr-1" /> New Coupon</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-xs text-muted-foreground">
            <tr><th className="text-left p-2">Code</th><th className="text-left p-2">Discount</th><th className="text-left p-2">Min order</th><th className="text-left p-2">Uses</th><th className="text-left p-2">Validity</th><th className="text-left p-2">Status</th><th className="p-2"></th></tr>
          </thead>
          <tbody>
            {coupons.isLoading && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
            {(coupons.data ?? []).map((c: any) => (
              <tr key={c.id} className="border-t hover:bg-slate-50">
                <td className="p-2 font-mono font-semibold">{c.code}</td>
                <td className="p-2">{c.type === "percent" ? `${c.value}%` : pkr(Number(c.value))}</td>
                <td className="p-2">{pkr(Number(c.min_order_amount))}</td>
                <td className="p-2 text-xs">{c.uses_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                <td className="p-2 text-xs">{c.valid_until ? new Date(c.valid_until).toLocaleDateString() : "No expiry"}</td>
                <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded-full ${c.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{c.is_active ? "Active" : "Disabled"}</span></td>
                <td className="p-2"><div className="flex gap-1">
                  <button onClick={() => setDrawer({ ...c, valid_from: c.valid_from?.slice(0, 10) ?? "", valid_until: c.valid_until?.slice(0, 10) ?? "" })} className="p-1.5 hover:bg-slate-100 rounded"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => del(c.id)} className="p-1.5 hover:bg-red-50 text-red-600 rounded"><Trash2 className="h-3.5 w-3.5" /></button>
                </div></td>
              </tr>
            ))}
            {!coupons.isLoading && !(coupons.data ?? []).length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">No coupons yet</td></tr>}
          </tbody>
        </table>
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>{drawer?.id ? "Edit coupon" : "New coupon"}</SheetTitle></SheetHeader>
          {drawer && <CouponForm coupon={drawer} onCancel={() => setDrawer(null)} onSave={async (v: any) => {
            try { await upsertFn({ data: v }); toast.success("Saved"); setDrawer(null); qc.invalidateQueries({ queryKey: ["admin-coupons"] }); }
            catch (e: any) { toast.error(e?.message ?? "Failed"); }
          }} />}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function CouponForm({ coupon, onSave, onCancel }: any) {
  const [c, setC] = useState(coupon);
  const set = (k: string, v: any) => setC((p: any) => ({ ...p, [k]: v }));
  return (
    <div className="space-y-3 mt-4">
      <div><label className="text-xs">Code</label><Input value={c.code} onChange={(e) => set("code", e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} placeholder="SAVE10" /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs">Type</label>
          <Select value={c.type} onValueChange={(v) => set("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="percent">Percent (%)</SelectItem><SelectItem value="fixed">Fixed (PKR)</SelectItem></SelectContent>
          </Select>
        </div>
        <div><label className="text-xs">Value</label><Input type="number" value={c.value} onChange={(e) => set("value", Number(e.target.value))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs">Min order (PKR)</label><Input type="number" value={c.min_order_amount} onChange={(e) => set("min_order_amount", Number(e.target.value))} /></div>
        <div><label className="text-xs">Max uses</label><Input type="number" value={c.max_uses ?? ""} onChange={(e) => set("max_uses", e.target.value === "" ? null : Number(e.target.value))} placeholder="Unlimited" /></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className="text-xs">Valid from</label><Input type="date" value={c.valid_from} onChange={(e) => set("valid_from", e.target.value)} /></div>
        <div><label className="text-xs">Valid until</label><Input type="date" value={c.valid_until} onChange={(e) => set("valid_until", e.target.value)} /></div>
      </div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={c.is_active} onCheckedChange={(v) => set("is_active", v)} /> Active</label>
      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={onCancel}>Cancel</Button>
        <Button onClick={() => onSave({
          ...c,
          valid_from: c.valid_from ? new Date(c.valid_from).toISOString() : null,
          valid_until: c.valid_until ? new Date(c.valid_until).toISOString() : null,
        })} className="bg-[#14B8A6] hover:bg-[#0F9488]">Save</Button>
      </div>
    </div>
  );
}
