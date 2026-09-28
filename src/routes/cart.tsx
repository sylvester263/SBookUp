import { useMemo } from "react";
import { useHiddenBundlePurge } from "@/lib/use-hidden-bundle-purge";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { Minus, Plus, X, ShoppingBag, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SiteShell, pkr } from "@/components/layout/site-chrome";
import { useCart, cartStore, cartTotals } from "@/lib/cart-store";
import { checkCart } from "@/lib/account.functions";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Your Cart — SchoolBooksExperts" }] }),
  component: CartPage,
});

function CartPage() {
  const lines = useCart();
  // Bundles are removed while school features are hidden (see use-hidden-bundle-purge).
  const removedBundles = useHiddenBundlePurge();
  const { itemCount } = cartTotals(lines);
  const checkFn = useServerFn(checkCart);
  // Current database price + stock for every line (the browser copy may be stale).
  const items = useMemo(
    () => lines.map((l) => ({ product_id: l.product_id, variant_id: l.variant_id, bundle_id: l.bundle_id, school_bundle_id: l.school_bundle_id, quantity: l.quantity })),
    [lines],
  );
  const checkQ = useQuery({
    queryKey: ["cart-check", items],
    queryFn: () => checkFn({ data: { items } }),
    enabled: items.length > 0,
    placeholderData: (prev) => prev,
  });
  const check = checkQ.data;
  const unitPrice = (i: number) => check?.[i]?.unit_price ?? lines[i]?.price ?? 0;
  const subtotal = lines.reduce((sum, l, i) => sum + unitPrice(i) * l.quantity, 0);
  const problems = lines
    .map((l, i) => {
      const c = check?.[i];
      if (!c) return null;
      if (!c.available_for_sale) return `${l.name} is no longer available`;
      if (c.available <= 0) return `${c.name ?? l.name} is out of stock`;
      if (l.quantity > c.available) return `Only ${c.available} × ${c.name ?? l.name} available`;
      return null;
    })
    .filter(Boolean) as string[];

  return (
    <SiteShell>
      <div className="container mx-auto px-4 py-6 md:py-8">
        <h1 className="font-display text-2xl md:text-3xl font-bold text-brand-navy mb-4 md:mb-6">Your Cart</h1>
        {removedBundles.length > 0 && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            Sorry — {removedBundles.join(", ")} {removedBundles.length === 1 ? "is" : "are"} no longer available and {removedBundles.length === 1 ? "was" : "were"} removed from your cart.
          </div>
        )}
        {lines.length === 0 ? (
          <div className="bg-white rounded-xl border p-12 text-center">
            <ShoppingBag className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="font-display text-xl font-semibold text-brand-navy mb-2">Your cart is empty</h2>
            <p className="text-muted-foreground mb-6">Add some books or supplies to get started.</p>
            <Link to="/shop"><Button className="bg-brand-teal hover:bg-brand-teal-dark">Continue shopping</Button></Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-[1fr_320px] lg:grid-cols-[1fr_360px] gap-6 md:gap-6 lg:gap-8">
            <div className="bg-white rounded-xl border divide-y">
              {lines.map((l, i) => {
                const c = check?.[i];
                const max = c ? c.available : Infinity;
                return (
                <div key={l.key} className="p-3 md:p-4 flex items-start gap-3">
                  <img src={l.image || "https://images.unsplash.com/photo-1543002588-bfa74002ed7e?w=300"} alt={l.name} className="w-16 h-20 md:w-24 md:h-24 rounded-lg object-cover bg-muted shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {(l.bundle_id || l.school_bundle_id) && <span className="text-[10px] font-semibold bg-brand-gold/15 text-brand-gold px-2 py-0.5 rounded uppercase tracking-wide">Bundle</span>}
                      <div className="text-sm font-medium text-brand-navy line-clamp-2">{l.name}</div>
                    </div>
                    {(l as any).variant_label && <div className="text-xs text-gray-400 mt-0.5">{(l as any).variant_label}</div>}
                    {l.children?.length ? (
                      <ul className="text-xs text-muted-foreground mt-1 space-y-0.5">
                        {l.children.map((c) => <li key={c}>• {c}</li>)}
                      </ul>
                    ) : null}
                    <div className="text-sm font-bold text-brand-teal mt-1">
                      {pkr(unitPrice(i))}
                      {c?.sell_unit === "pack" && c.pack_size ? <span className="ml-1 text-xs font-medium text-muted-foreground">/ pack of {c.pack_size}</span> : null}
                    </div>
                    {c && !c.available_for_sale && <div className="text-xs text-red-600 mt-1">No longer available — please remove</div>}
                    {c && c.available_for_sale && c.available <= 0 && <div className="text-xs text-red-600 mt-1">Out of stock</div>}
                    {c && c.available_for_sale && c.available > 0 && l.quantity > c.available && <div className="text-xs text-red-600 mt-1">Only {c.available} available</div>}
                    {c && c.available_for_sale && c.available > 0 && l.quantity <= c.available && c.available <= 5 && <div className="text-xs text-orange-600 mt-1">Only {c.available} left</div>}
                    <div className="flex items-center justify-between mt-2">
                      <div className="flex items-center border rounded-md">
                        <button onClick={() => cartStore.setQty(l.key, l.quantity - 1)} className="h-7 w-7 flex items-center justify-center hover:bg-muted"><Minus className="h-3 w-3" /></button>
                        <span className="w-9 text-center text-sm font-medium">{l.quantity}</span>
                        <button onClick={() => cartStore.setQty(l.key, Math.min(l.quantity + 1, max))} disabled={l.quantity >= max} className="h-7 w-7 flex items-center justify-center hover:bg-muted disabled:opacity-40"><Plus className="h-3 w-3" /></button>
                      </div>
                      <button onClick={() => cartStore.remove(l.key)} aria-label="Remove" className="h-9 w-9 flex items-center justify-center text-gray-400 hover:text-red-500">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
            <aside className="space-y-4 md:sticky md:top-24 h-fit">
              {problems.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
                  <div className="flex items-center gap-2 font-medium mb-1"><AlertTriangle className="h-4 w-4" /> Please update your cart</div>
                  <ul className="list-disc pl-5 space-y-0.5">{problems.map((m) => <li key={m}>{m}</li>)}</ul>
                </div>
              )}
              {/* Summary */}
              <div className="bg-white rounded-xl border p-5 md:p-6">
                <h3 className="font-display text-lg font-semibold text-brand-navy mb-4">Order Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Items ({itemCount})</span><span>{pkr(subtotal)}</span></div>
                  <div className="text-xs text-muted-foreground">Delivery, COD fee, coupons and tax are calculated at checkout.</div>
                  <div className="border-t pt-3 mt-3 flex justify-between font-semibold text-base"><span>Subtotal</span><span className="text-brand-teal text-lg">{pkr(subtotal)}</span></div>
                </div>
                {problems.length > 0 ? (
                  <Button disabled className="w-full mt-5 h-14 rounded-full text-base">Fix cart to continue</Button>
                ) : (
                  <Link to="/checkout"><Button className="w-full mt-5 h-14 bg-brand-teal hover:bg-brand-teal-dark rounded-full text-base">Proceed to checkout</Button></Link>
                )}
                <Link to="/shop" className="block text-center text-sm text-brand-teal mt-3 hover:underline">Continue shopping</Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </SiteShell>
  );
}
