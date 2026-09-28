import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, MessageCircle, Upload, Loader2, Clock, XCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SiteShell, pkr } from "@/components/layout/site-chrome";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { getMyOrderByNumber, attachPaymentProof } from "@/lib/account.functions";
import { getStoreSettings } from "@/lib/site.functions";
import { prepareUpload } from "@/lib/image-upload";
import { WHATSAPP_NUMBER } from "@/lib/schools-data";

export const Route = createFileRoute("/checkout/success/$orderNumber")({
  validateSearch: (s: Record<string, unknown>) => ({ payment: s.payment === "ok" || s.payment === "failed" ? (s.payment as "ok" | "failed") : undefined }),
  head: () => ({ meta: [{ title: "Order Confirmed — SchoolBooksExperts" }, { name: "robots", content: "noindex" }] }),
  component: SuccessPage,
});

function SuccessPage() {
  const { orderNumber } = Route.useParams();
  const { payment: paymentResult } = Route.useSearch();
  const { user } = useAuth();
  const orderFn = useServerFn(getMyOrderByNumber);
  const settingsFn = useServerFn(getStoreSettings);
  const orderQ = useQuery({
    queryKey: ["my-order", orderNumber],
    queryFn: () => orderFn({ data: { orderNumber } }),
    enabled: !!user,
  });
  const settingsQ = useQuery({ queryKey: ["store-settings"], queryFn: () => settingsFn() });
  const order = orderQ.data;
  const s = (settingsQ.data ?? {}) as Record<string, string | null>;
  const eta = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toLocaleDateString("en-PK", { weekday: "short", day: "numeric", month: "short" });
  const waMsg = encodeURIComponent(`Hi! I just placed order ${orderNumber} on SchoolBooksExperts. Please confirm.`);
  const isBank = order?.payment_method === "bank_transfer";

  return (
    <SiteShell>
      <div className="container mx-auto px-4 py-16 max-w-xl text-center">
        <div className="h-20 w-20 rounded-full bg-green-100 text-green-600 flex items-center justify-center mx-auto mb-6">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        <h1 className="font-display text-3xl font-bold text-brand-navy mb-3">Order placed successfully!</h1>
        <p className="text-muted-foreground mb-6">Thank you for shopping with {s.store_name || "SchoolBooksExperts"}.</p>
        {paymentResult === "failed" && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2 justify-center">
            <XCircle className="h-4 w-4" /> Your online payment was not confirmed. Please try again or contact us.
          </div>
        )}
        <div className="bg-white rounded-xl border p-6 mb-6 text-left">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Order number</div>
          <div className="font-display text-2xl font-bold text-brand-teal mt-1">{orderNumber}</div>
          {order && <div className="mt-2 text-sm"><span className="text-muted-foreground">Total: </span><span className="font-semibold text-brand-navy">{pkr(Number(order.total))}</span></div>}
          <div className="mt-2 text-sm"><span className="text-muted-foreground">Estimated delivery: </span><span className="font-medium text-brand-navy">{eta}</span></div>
        </div>

        {isBank && order && <BankTransferBox order={order} settings={s} />}

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/account/orders" className="block"><Button variant="outline" className="w-full h-12 sm:h-11">Track order</Button></Link>
          <Link to="/shop" className="block"><Button className="w-full h-12 sm:h-11 bg-brand-teal hover:bg-brand-teal-dark">Continue shopping</Button></Link>
        </div>

        <a href={`https://wa.me/${WHATSAPP_NUMBER}?text=${waMsg}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-6 text-green-600 hover:text-green-700 text-sm font-medium">
          <MessageCircle className="h-4 w-4" /> Get WhatsApp confirmation
        </a>
      </div>
    </SiteShell>
  );
}

type MyOrder = { id: string; order_number: string; status: string; payment_status: string; payment_proof_uploaded_at: string | null; total: number };

function BankTransferBox({ order, settings }: { order: MyOrder; settings: Record<string, string | null> }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const attachFn = useServerFn(attachPaymentProof);
  const [uploading, setUploading] = useState(false);
  const hasBank = !!(settings.bank_account_number || settings.bank_iban);
  const canUpload = ["pending", "failed", "pending_verification"].includes(order.payment_status) && !["cancelled", "refunded"].includes(order.status);

  async function onFile(file: File | undefined) {
    if (!file || !user) return;
    setUploading(true);
    try {
      const { blob, contentType } = await prepareUpload(file);
      // Private bucket, customer's own folder: <user id>/<order id>/<file>
      const path = `${user.id}/${order.id}/${Date.now()}.webp`;
      const { error } = await supabase.storage.from("payment-proofs").upload(path, blob, { contentType, upsert: false });
      if (error) throw error;
      await attachFn({ data: { orderId: order.id, path } });
      toast.success("Payment proof uploaded — we'll verify it shortly");
      qc.invalidateQueries({ queryKey: ["my-order", order.order_number] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="bg-white rounded-xl border p-6 mb-6 text-left">
      <h2 className="font-semibold text-brand-navy mb-3">Pay by bank transfer</h2>
      {hasBank ? (
        <dl className="text-sm grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {settings.bank_name && <><dt className="text-muted-foreground">Bank</dt><dd className="font-medium">{settings.bank_name}</dd></>}
          {settings.bank_account_title && <><dt className="text-muted-foreground">Account title</dt><dd className="font-medium">{settings.bank_account_title}</dd></>}
          {settings.bank_account_number && <><dt className="text-muted-foreground">Account no.</dt><dd className="font-medium">{settings.bank_account_number}</dd></>}
          {settings.bank_iban && <><dt className="text-muted-foreground">IBAN</dt><dd className="font-medium break-all">{settings.bank_iban}</dd></>}
          <dt className="text-muted-foreground">Amount</dt><dd className="font-medium">{pkr(Number(order.total))}</dd>
          <dt className="text-muted-foreground">Reference</dt><dd className="font-medium">{order.order_number}</dd>
        </dl>
      ) : (
        <p className="text-sm text-muted-foreground">Our bank details will be sent to you shortly. You can also contact us on WhatsApp.</p>
      )}
      {settings.bank_instructions && <p className="text-sm text-muted-foreground mt-3 whitespace-pre-line">{settings.bank_instructions}</p>}

      <div className="mt-4 border-t pt-4">
        {order.payment_status === "paid" ? (
          <div className="text-sm text-green-700 flex items-center gap-2"><CheckCircle2 className="h-4 w-4" /> Payment received — thank you!</div>
        ) : order.payment_status === "pending_verification" ? (
          <div className="text-sm text-amber-700 flex items-center gap-2"><Clock className="h-4 w-4" /> Proof received — we're verifying your payment.</div>
        ) : null}
        {canUpload && (
          <label className="mt-3 inline-flex items-center gap-2 cursor-pointer text-sm font-medium text-brand-teal">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {order.payment_status === "pending_verification" ? "Upload a different screenshot" : "Upload payment screenshot"}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading} onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
        )}
      </div>
    </div>
  );
}
