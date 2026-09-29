import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, CheckCircle2, Circle, Truck, Package as PackageIcon, ClipboardList, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteShell } from "@/components/layout/site-chrome";
import { trackOrder } from "@/lib/site.functions";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [{ title: "Track Your Order — SchoolBooksExperts" }, { name: "description", content: "Check the status of your SchoolBooksExperts order with your order number and email." }],
    links: [{ rel: "canonical", href: "/track" }],
  }),
  component: TrackPage,
});

const STEPS = [
  { key: "pending", label: "Placed", icon: ClipboardList },
  { key: "confirmed", label: "Confirmed", icon: CheckCircle2 },
  { key: "processing", label: "Processing", icon: PackageIcon },
  { key: "shipped", label: "Shipped", icon: Truck },
  { key: "delivered", label: "Delivered", icon: CheckCircle2 },
];

function statusIndex(s: string) {
  const i = STEPS.findIndex((x) => x.key === s);
  return i === -1 ? 0 : i;
}

function TrackPage() {
  const fn = useServerFn(trackOrder);
  const [orderNumber, setOrderNumber] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setResult(null);
    try {
      const r = await fn({ data: { orderNumber: orderNumber.trim(), email: email.trim() } });
      if (!r.found) toast.error("No matching order. Check your order number and email.");
      setResult(r);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SiteShell>
      <section className="bg-brand-teal text-white py-12">
        <div className="container mx-auto px-4 max-w-xl text-center">
          <h1 className="font-display text-4xl font-bold">Track Your Order</h1>
          <p className="text-white/85 mt-2">Enter your order number and the email you used at checkout.</p>
        </div>
      </section>

      <section className="container mx-auto px-4 py-10 max-w-2xl">
        <form onSubmit={lookup} className="bg-white border border-border rounded-xl p-6 space-y-3">
          <div>
            <label className="text-sm font-medium text-brand-navy">Order number</label>
            <Input value={orderNumber} onChange={(e) => setOrderNumber(e.target.value)} placeholder="SBE-20260601-0001" required />
          </div>
          <div>
            <label className="text-sm font-medium text-brand-navy">Email</label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <Button type="submit" disabled={busy} className="w-full bg-brand-teal hover:bg-brand-teal-dark">
            <Search className="h-4 w-4 mr-2" /> {busy ? "Looking up..." : "Track Order"}
          </Button>
        </form>

        {result?.found && (
          <div className="mt-8 bg-white border border-border rounded-xl p-6 space-y-6">
            <div className="flex justify-between items-start flex-wrap gap-3">
              <div>
                <div className="text-xs text-muted-foreground">Order</div>
                <div className="font-display text-xl text-brand-navy">{result.order.order_number}</div>
                <div className="text-xs text-muted-foreground mt-1">Placed {new Date(result.order.created_at).toLocaleDateString()}</div>
              </div>
              {result.order.tracking_number && (
                <a href={`https://www.tcsexpress.com/track/${result.order.tracking_number}`} target="_blank" rel="noreferrer"
                  className="text-sm text-brand-teal hover:underline inline-flex items-center gap-1">
                  Courier tracking: {result.order.tracking_number} <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div className="flex justify-between relative">
              <div className="absolute left-0 right-0 top-4 h-0.5 bg-muted -z-0" />
              {STEPS.map((s, i) => {
                const cur = statusIndex(result.order.status);
                const done = i <= cur;
                const Icon = s.icon;
                return (
                  <div key={s.key} className="relative z-10 flex flex-col items-center text-center w-1/5">
                    <span className={`h-9 w-9 rounded-full flex items-center justify-center ${done ? "bg-brand-teal text-white" : "bg-muted text-muted-foreground"}`}>
                      {done ? <Icon className="h-4 w-4" /> : <Circle className="h-4 w-4" />}
                    </span>
                    <span className={`text-xs mt-2 ${done ? "text-brand-navy font-medium" : "text-muted-foreground"}`}>{s.label}</span>
                  </div>
                );
              })}
            </div>

            <div className="border-t border-border pt-4">
              <h3 className="font-semibold text-brand-navy text-sm mb-2">Items</h3>
              <ul className="text-sm divide-y divide-border">
                {(result.order.order_items ?? []).map((it: any) => (
                  <li key={it.id} className="py-2 flex justify-between">
                    <span>{it.name_snapshot}</span>
                    <span className="text-muted-foreground">x{it.quantity}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
    </SiteShell>
  );
}
