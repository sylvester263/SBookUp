import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Search, Eye, Printer } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminShell } from "@/components/admin/AdminShell";
import { Pager, useDebounced } from "@/components/admin/Pager";
import { adminListOrders, adminGetOrder, adminUpdateOrder, adminGetPaymentProofUrl } from "@/lib/admin.functions";

export const Route = createFileRoute("/_admin/admin/orders")({
  component: OrdersPage,
});

const pkr = (n: number) => `PKR ${Math.round(n).toLocaleString("en-PK")}`;

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-700",
  confirmed: "bg-blue-100 text-blue-700",
  processing: "bg-indigo-100 text-indigo-700",
  shipped: "bg-purple-100 text-purple-700",
  delivered: "bg-emerald-100 text-emerald-700",
  cancelled: "bg-red-100 text-red-700",
  refunded: "bg-slate-200 text-slate-700",
};

function OrdersPage() {
  const qc = useQueryClient();
  const listFn = useServerFn(adminListOrders);

  const [q, setQ] = useState("");
  const [status, setStatus] = useState("all");
  const [payStatus, setPayStatus] = useState("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const [page, setPage] = useState(1);
  const debouncedQ = useDebounced(q);
  // Server-side search / filters (dates are Pakistan calendar days) and pagination
  const filters = { q: debouncedQ || undefined, status, payStatus, from, to };
  const filterKey = JSON.stringify(filters);
  useEffect(() => setPage(1), [filterKey]);
  const orders = useQuery({
    queryKey: ["admin-orders", filters, page],
    queryFn: () => listFn({ data: { ...filters, page, pageSize: 50 } }),
    placeholderData: (prev) => prev,
  });
  const filtered: any[] = orders.data?.rows ?? [];

  return (
    <AdminShell title="Orders">
      <div className="bg-white rounded-xl border">
        <div className="p-4 flex flex-wrap gap-3 items-center border-b">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Order # or customer…" className="pl-9" />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All status</SelectItem>
              {["pending","confirmed","processing","shipped","delivered","cancelled","refunded"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={payStatus} onValueChange={setPayStatus}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All payments</SelectItem>
              {["pending","pending_verification","paid","failed","refunded"].map((s) => <SelectItem key={s} value={s}>{s === "pending" ? "unpaid (pending)" : s.replace("_", " ")}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-[150px]" />
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-[150px]" />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground">
              <tr>
                <th className="text-left p-2">Order #</th>
                <th className="text-left p-2">Customer</th>
                <th className="text-left p-2">Date</th>
                <th className="text-left p-2">Items</th>
                <th className="text-left p-2">Total</th>
                <th className="text-left p-2">Payment</th>
                <th className="text-left p-2">Status</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {orders.isLoading && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">Loading…</td></tr>}
              {filtered.map((o) => (
                <tr key={o.id} className="border-t hover:bg-slate-50">
                  <td className="p-2 font-mono text-xs">{o.order_number}</td>
                  <td className="p-2 max-w-[180px] truncate">{o.shipping_address?.name ?? o.guest_email ?? "—"}</td>
                  <td className="p-2 text-xs text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                  <td className="p-2">{o.order_items?.length ?? 0}</td>
                  <td className="p-2">{pkr(Number(o.total))}</td>
                  <td className="p-2 text-xs"><span className="capitalize">{o.payment_method}</span> · <span className={o.payment_status === "paid" ? "text-emerald-600" : "text-amber-600"}>{o.payment_status}</span></td>
                  <td className="p-2"><span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[o.status] ?? "bg-slate-100"}`}>{o.status}</span></td>
                  <td className="p-2"><button onClick={() => setOpenId(o.id)} className="p-1.5 hover:bg-slate-100 rounded"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
              {!orders.isLoading && !filtered.length && <tr><td colSpan={8} className="p-8 text-center text-muted-foreground">No orders</td></tr>}
            </tbody>
          </table>
        </div>
        <Pager page={page} pageSize={50} total={orders.data?.total ?? 0} onPage={setPage} loading={orders.isFetching} />
      </div>

      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="sm:max-w-xl overflow-y-auto">
          {openId && <OrderDetail id={openId} onClose={() => { setOpenId(null); qc.invalidateQueries({ queryKey: ["admin-orders"] }); }} />}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

function OrderDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const qc = useQueryClient();
  const getFn = useServerFn(adminGetOrder);
  const updFn = useServerFn(adminUpdateOrder);
  const { data: o, isLoading } = useQuery({ queryKey: ["admin-order", id], queryFn: () => getFn({ data: { id } }) });

  const [status, setStatus] = useState("");
  const [payStatus, setPayStatus] = useState("");
  const [tracking, setTracking] = useState("");
  const [busy, setBusy] = useState(false);

  if (isLoading || !o) return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;

  async function update(patch: any) {
    setBusy(true);
    try {
      await updFn({ data: { id, ...patch } });
      qc.invalidateQueries({ queryKey: ["admin-order", id] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      toast.success("Updated");
    } catch (e: any) {
      toast.error(e?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <SheetHeader>
        <SheetTitle>Order {o.order_number}</SheetTitle>
      </SheetHeader>
      <div className="space-y-5 mt-4">
        <div className="flex items-center justify-between">
          <span className={`text-xs px-2 py-0.5 rounded-full capitalize ${STATUS_COLOR[o.status] ?? "bg-slate-100"}`}>{o.status}</span>
          <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-3.5 w-3.5 mr-1" /> Print invoice</Button>
        </div>

        {(() => {
          const addr = (o.shipping_address ?? {}) as Record<string, any>;
          return (
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <div className="text-xs text-muted-foreground">Customer</div>
                <div className="font-medium">{addr.name}</div>
                <div className="text-xs">{addr.phone}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Shipping</div>
                <div className="text-xs">{addr.street}, {addr.city}</div>
                <div className="text-xs">{addr.province} {addr.postal_code}</div>
              </div>
            </div>
          );
        })()}

        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-muted-foreground">
              <tr><th className="text-left p-2">Item</th><th className="p-2">Qty</th><th className="text-right p-2">Price</th><th className="text-right p-2">Subtotal</th></tr>
            </thead>
            <tbody>
              {o.order_items?.map((i: any) => (
                <tr key={i.id} className="border-t">
                  <td className="p-2">{i.name_snapshot}</td>
                  <td className="p-2 text-center">{i.quantity}</td>
                  <td className="p-2 text-right">{pkr(Number(i.price_snapshot))}</td>
                  <td className="p-2 text-right">{pkr(Number(i.subtotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="text-sm space-y-1 border-t pt-3">
          <Row label="Subtotal" value={pkr(Number(o.subtotal))} />
          <Row label="Shipping" value={pkr(Number(o.shipping_cost))} />
          {Number(o.discount_amount) > 0 && <Row label="Discount" value={"-" + pkr(Number(o.discount_amount))} />}
          {Number(o.tax_amount) > 0 && <Row label="Tax" value={pkr(Number(o.tax_amount))} />}
          <Row label="Total" value={pkr(Number(o.total))} bold />
        </div>

        {o.payment_method === "bank_transfer" && (
          <PaymentProof orderId={o.id} hasProof={!!o.payment_proof_path} uploadedAt={o.payment_proof_uploaded_at} paid={o.payment_status === "paid"} busy={busy} onMarkPaid={() => { setPayStatus("paid"); update({ payment_status: "paid" }); }} />
        )}

        <div className="space-y-3 border-t pt-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <Select value={status || o.status} onValueChange={(v) => { setStatus(v); update({ status: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending","confirmed","processing","shipped","delivered","cancelled","refunded"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Payment status</Label>
              <Select value={payStatus || o.payment_status} onValueChange={(v) => { setPayStatus(v); update({ payment_status: v }); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["pending","pending_verification","paid","failed","refunded"].map((s) => <SelectItem key={s} value={s}>{s === "pending" ? "unpaid (pending)" : s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Tracking number</Label>
            <div className="flex gap-2">
              <Input value={tracking || o.tracking_number || ""} onChange={(e) => setTracking(e.target.value)} placeholder="TCS, Leopards, etc." />
              <Button disabled={busy} onClick={() => update({ tracking_number: tracking })} className="bg-[#14B8A6] hover:bg-[#0F9488]">Save</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, bold }: any) {
  return (
    <div className={`flex justify-between ${bold ? "font-semibold text-base pt-1" : "text-muted-foreground"}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

function PaymentProof({ orderId, hasProof, uploadedAt, paid, busy, onMarkPaid }: { orderId: string; hasProof: boolean; uploadedAt: string | null; paid: boolean; busy: boolean; onMarkPaid: () => void }) {
  const urlFn = useServerFn(adminGetPaymentProofUrl);
  const [loading, setLoading] = useState(false);
  async function open() {
    setLoading(true);
    try {
      const r = await urlFn({ data: { orderId } });
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else toast.error("No proof uploaded");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not open proof");
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="border rounded-lg p-3 text-sm space-y-2">
      <div className="font-medium">Bank transfer proof</div>
      {hasProof ? (
        <div className="text-xs text-muted-foreground">Uploaded {uploadedAt ? new Date(uploadedAt).toLocaleString() : ""}</div>
      ) : (
        <div className="text-xs text-muted-foreground">The customer hasn't uploaded a proof yet.</div>
      )}
      <div className="flex gap-2">
        {hasProof && <Button variant="outline" size="sm" disabled={loading} onClick={open}>View proof</Button>}
        {!paid && <Button size="sm" disabled={busy} onClick={onMarkPaid} className="bg-emerald-600 hover:bg-emerald-700">Mark as paid</Button>}
      </div>
    </div>
  );
}
