import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SiteShell, pkr } from "@/components/layout/site-chrome";
import { supabase } from "@/integrations/supabase/client";

// Rates come from the live shipping zones (admin → Settings → Shipping Zones), so
// this page always matches what checkout charges.
const zonesQuery = {
  queryKey: ["public-shipping-zones"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("shipping_zones")
      .select("id,name,cities,base_rate,per_kg_rate,estimated_days,free_shipping_threshold")
      .eq("is_active", true)
      .order("created_at");
    if (error) throw error;
    return data ?? [];
  },
};

export const Route = createFileRoute("/shipping")({
  head: () => ({
    meta: [{ title: "Delivery Policy — SchoolBooksExperts" }, { name: "description", content: "Delivery zones, estimated delivery times and rates for SchoolBooksExperts orders across Pakistan." }],
    links: [{ rel: "canonical", href: "/shipping" }],
  }),
  component: ShippingPage,
});

function ShippingPage() {
  const zones = useQuery(zonesQuery);
  const rows = zones.data ?? [];
  return (
    <SiteShell>
      <section className="bg-brand-navy text-white py-12">
        <div className="container mx-auto px-4">
          <h1 className="font-display text-4xl font-bold">Delivery Policy</h1>
          <p className="text-white/70 mt-2">Delivery across Pakistan. The exact charge for your order is shown at checkout.</p>
        </div>
      </section>
      <section className="container mx-auto px-4 py-10 max-w-4xl space-y-8">
        <div className="bg-white border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-brand-cream text-left">
              <tr><th className="p-3">Zone</th><th className="p-3">Estimated</th><th className="p-3">Base rate</th><th className="p-3">Per kg</th><th className="p-3">Free delivery</th></tr>
            </thead>
            <tbody>
              {zones.isLoading && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Loading…</td></tr>}
              {rows.map((z) => (
                <tr key={z.id} className="border-t border-border align-top">
                  <td className="p-3 font-medium text-brand-navy">
                    {z.name}
                    {z.cities?.length ? <div className="text-xs font-normal text-muted-foreground">{z.cities.slice(0, 8).join(", ")}{z.cities.length > 8 ? "…" : ""}</div> : null}
                  </td>
                  <td className="p-3 text-muted-foreground">{z.estimated_days} {z.estimated_days === 1 ? "day" : "days"}</td>
                  <td className="p-3">{pkr(Number(z.base_rate))}</td>
                  <td className="p-3">{Number(z.per_kg_rate) > 0 ? pkr(Number(z.per_kg_rate)) : "—"}</td>
                  <td className="p-3">{z.free_shipping_threshold != null ? `Orders over ${pkr(Number(z.free_shipping_threshold))}` : "—"}</td>
                </tr>
              ))}
              {!zones.isLoading && !rows.length && <tr><td colSpan={5} className="p-4 text-center text-muted-foreground">Delivery charges are calculated at checkout.</td></tr>}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">Cash on Delivery orders include a PKR 150 handling fee. Delivery = base rate + total weight × per-kg rate.</p>
        {/* PLACEHOLDER COPY — to be confirmed by the client (courier partners, same-day, international). */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white border border-border rounded-xl p-6">
            <h3 className="font-display text-xl text-brand-navy mb-2">Courier partners</h3>
            <p className="text-sm text-muted-foreground">We ship via TCS, Leopards and M&P depending on the destination, and provide a tracking number on dispatch.</p>
          </div>
          <div className="bg-white border border-border rounded-xl p-6">
            <h3 className="font-display text-xl text-brand-navy mb-2">Tracking your order</h3>
            <p className="text-sm text-muted-foreground">Use <a href="/track" className="text-brand-teal underline">Track Your Order</a> with your order number and email, or check My Orders when signed in.</p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
