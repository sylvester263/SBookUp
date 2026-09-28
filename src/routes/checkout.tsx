import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useHiddenBundlePurge } from "@/lib/use-hidden-bundle-purge";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { SiteShell, pkr } from "@/components/layout/site-chrome";
import { useCart, cartStore } from "@/lib/cart-store";
import { useAuth } from "@/lib/auth-context";
import { placeOrder, quoteOrder } from "@/lib/account.functions";
import { getStoreSettings } from "@/lib/site.functions";
import { useDeliveryChoice } from "@/lib/delivery-location";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — SchoolBooksExperts" }] }),
  component: CheckoutPage,
});

const addressSchema = z.object({
  name: z.string().trim().min(1, "Name required").max(100),
  phone: z.string().trim().regex(/^\+92\d{10}$/, "Phone must be +92XXXXXXXXXX"),
  street: z.string().trim().min(3, "Address required").max(200),
  city: z.string().trim().min(2).max(80),
  province: z.string().trim().max(80).optional(),
  postal_code: z.string().trim().max(20).optional(),
});

type PaymentMethod = "cod" | "jazzcash" | "easypaisa" | "bank_transfer";

function CheckoutPage() {
  const navigate = useNavigate();
  const lines = useCart();
  // Bundles are removed while school features are hidden (see use-hidden-bundle-purge).
  const removedBundles = useHiddenBundlePurge();
  const { user, loading: authLoading } = useAuth();
  const placeOrderFn = useServerFn(placeOrder);
  const quoteOrderFn = useServerFn(quoteOrder);
  const settingsFn = useServerFn(getStoreSettings);
  const settingsQ = useQuery({ queryKey: ["store-settings"], queryFn: () => settingsFn() });
  // Only payment methods switched on in store settings are offered. JazzCash and
  // EasyPaisa stay off until their gateways are connected (src/lib/payments).
  const st = (settingsQ.data ?? {}) as Record<string, unknown>;
  const enabled: Record<PaymentMethod, boolean> = {
    cod: st.enable_cod !== false,
    bank_transfer: st.enable_bank_transfer !== false,
    jazzcash: st.enable_jazzcash === true,
    easypaisa: st.enable_easypaisa === true,
  };

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [address, setAddress] = useState({ name: "", phone: "+92", street: "", city: "", province: "", postal_code: "" });
  const [payment, setPayment] = useState<PaymentMethod>("cod");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [couponInput, setCouponInput] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [quoteCity, setQuoteCity] = useState("");

  useEffect(() => {
    if (!authLoading && !user) {
      navigate({ to: "/auth/login", search: { redirect: "/checkout" } });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (removedBundles.length) toast.info(`${removedBundles.join(", ")} ${removedBundles.length === 1 ? "is" : "are"} no longer available and ${removedBundles.length === 1 ? "was" : "were"} removed from your cart.`);
  }, [removedBundles]);

  // Pre-fill the city chosen in the header ("Deliver to …"), unless one is typed already.
  const deliveryChoice = useDeliveryChoice();
  const savedCity = deliveryChoice?.method === "delivery" ? deliveryChoice.city : "";
  useEffect(() => {
    if (savedCity) setAddress((a) => (a.city ? a : { ...a, city: savedCity }));
  }, [savedCity]);

  // Debounce the city so we don't re-quote on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => setQuoteCity(address.city.trim()), 400);
    return () => clearTimeout(t);
  }, [address.city]);

  // Every figure shown here comes from the server's quote_order(), which runs the
  // same pricing as place_order(), so the displayed total is the total that is saved.
  const items = useMemo(
    () =>
      lines.map((l) => ({
        product_id: l.product_id,
        variant_id: l.variant_id,
        bundle_id: l.bundle_id,
        school_bundle_id: l.school_bundle_id,
        quantity: l.quantity,
      })),
    [lines],
  );
  const quoteQ = useQuery({
    queryKey: ["checkout-quote", items, quoteCity, payment, appliedCoupon],
    queryFn: () =>
      quoteOrderFn({
        data: { items, city: quoteCity || undefined, payment_method: payment, coupon_code: appliedCoupon ?? undefined },
      }),
    enabled: items.length > 0,
    retry: false,
    placeholderData: (prev) => prev,
  });
  const quote = quoteQ.data;
  const quoteError = quoteQ.error instanceof Error ? quoteQ.error.message : null;
  const total = quote?.total ?? 0;

  // A coupon that stops being valid (e.g. the cart drops below its minimum) is removed.
  useEffect(() => {
    if (appliedCoupon && quote?.coupon_error) {
      toast.error(quote.coupon_error);
      setAppliedCoupon(null);
    }
  }, [appliedCoupon, quote?.coupon_error]);

  // If the selected method gets switched off, fall back to the first available one.
  useEffect(() => {
    if (!settingsQ.data || enabled[payment]) return;
    const first = (["cod", "bank_transfer", "jazzcash", "easypaisa"] as PaymentMethod[]).find((m) => enabled[m]);
    if (first) setPayment(first);
  }, [settingsQ.data, payment]); // eslint-disable-line react-hooks/exhaustive-deps

  function next() {
    if (step === 1) {
      const v = addressSchema.safeParse(address);
      if (!v.success) return toast.error(v.error.issues[0].message);
      setStep(2);
    } else if (step === 2) setStep(3);
  }

  async function applyCoupon() {
    const code = couponInput.trim();
    if (!code) return;
    try {
      const q = await quoteOrderFn({
        data: { items, city: quoteCity || undefined, payment_method: payment, coupon_code: code },
      });
      if (q.coupon_error) return toast.error(q.coupon_error);
      setAppliedCoupon(q.coupon_code);
      toast.success(q.free_shipping ? "Coupon applied: free delivery" : `Coupon applied: -${pkr(q.discount)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not apply coupon");
    }
  }

  async function onPlace() {
    if (!terms) return toast.error("Please accept the terms");
    if (quoteError) return toast.error(quoteError);
    if (lines.length === 0) return toast.error("Cart is empty");
    setSubmitting(true);
    try {
      const res = await placeOrderFn({
        data: {
          // Only ids + quantities: the server prices everything.
          items,
          shipping_address: address,
          payment_method: payment,
          coupon_code: appliedCoupon ?? undefined,
          notes: notes || undefined,
        },
      });
      cartStore.clear();
      navigate({ to: "/checkout/success/$orderNumber", params: { orderNumber: res.order_number }, search: { payment: undefined } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Order failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (authLoading || !user) return <SiteShell><div className="container py-20 text-center"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div></SiteShell>;
  if (lines.length === 0) {
    return (
      <SiteShell><div className="container mx-auto px-4 py-20 text-center">
        <h2 className="font-display text-2xl text-brand-navy mb-3">Your cart is empty</h2>
        <Link to="/shop"><Button className="bg-brand-teal hover:bg-brand-teal-dark">Browse products</Button></Link>
      </div></SiteShell>
    );
  }

  return (
    <SiteShell>
      <div className="container mx-auto px-4 py-6 md:py-8">
        <Stepper step={step} />
        <div className="grid md:grid-cols-[1fr_340px] lg:grid-cols-[1fr_380px] gap-6 md:gap-6 lg:gap-8 mt-6 md:mt-8">
          <div className="bg-white rounded-xl border p-4 md:p-6">
            {step === 1 && (
              <>
                <h2 className="font-display text-lg md:text-xl font-semibold text-brand-navy mb-4">Shipping address</h2>
                <div className="grid md:grid-cols-2 gap-4">
                  <Field label="Full name"><Input className="h-12" value={address.name} onChange={(e) => setAddress({ ...address, name: e.target.value })} /></Field>
                  <Field label="Phone (+92XXXXXXXXXX)"><Input className="h-12" value={address.phone} onChange={(e) => setAddress({ ...address, phone: e.target.value })} /></Field>
                  <Field label="Street address" className="md:col-span-2"><Input className="h-12" value={address.street} onChange={(e) => setAddress({ ...address, street: e.target.value })} /></Field>
                  <Field label="City"><Input className="h-12" value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} placeholder="Lahore" /></Field>
                  <Field label="Province"><Input className="h-12" value={address.province} onChange={(e) => setAddress({ ...address, province: e.target.value })} placeholder="Punjab" /></Field>
                  <Field label="Postal code"><Input className="h-12" value={address.postal_code} onChange={(e) => setAddress({ ...address, postal_code: e.target.value })} /></Field>
                </div>
                <Button onClick={next} className="w-full md:w-auto mt-6 h-14 md:h-11 rounded-full md:rounded-md bg-brand-teal hover:bg-brand-teal-dark text-base">Continue <ChevronRight className="h-4 w-4 ml-1" /></Button>
              </>
            )}

            {step === 2 && (
              <>
                <h2 className="font-display text-lg md:text-xl font-semibold text-brand-navy mb-4">Payment method</h2>
                <RadioGroup value={payment} onValueChange={(v) => setPayment(v as PaymentMethod)} className="space-y-3">
                  {([
                    { v: "cod", label: "Cash on Delivery", desc: "Pay when you receive (+ PKR 150 COD fee)", icon: "💵" },
                    { v: "jazzcash", label: "JazzCash", desc: "Mobile wallet", icon: "📱" },
                    { v: "easypaisa", label: "EasyPaisa", desc: "Mobile wallet", icon: "📲" },
                    { v: "bank_transfer", label: "Bank Transfer", desc: "Direct bank deposit", icon: "🏦" },
                  ] as const).filter((o) => enabled[o.v]).map((o) => (
                    <label key={o.v} className={`flex items-center gap-3 border-2 rounded-lg p-3 cursor-pointer transition min-h-16 ${payment === o.v ? "border-brand-teal bg-brand-teal/5" : "border-border hover:bg-muted/50"}`}>
                      <div className="text-2xl shrink-0">{o.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-brand-navy text-sm md:text-base">{o.label}</div>
                        <div className="text-xs md:text-sm text-muted-foreground">{o.desc}</div>
                      </div>
                      <RadioGroupItem value={o.v} />
                    </label>
                  ))}
                </RadioGroup>
                {(payment === "jazzcash" || payment === "easypaisa") && (
                  <Field label="Wallet phone" className="mt-4"><Input className="h-12" placeholder="+92XXXXXXXXXX" /></Field>
                )}
                <Field label="Order notes (optional)" className="mt-5"><Textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} rows={3} /></Field>
                <div className="flex flex-col-reverse md:flex-row gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep(1)} className="h-12 md:h-11">Back</Button>
                  <Button onClick={next} className="flex-1 h-14 md:h-11 rounded-full md:rounded-md bg-brand-teal hover:bg-brand-teal-dark text-base">Continue · {quote ? pkr(total) : "…"} <ChevronRight className="h-4 w-4 ml-1" /></Button>
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <h2 className="font-display text-lg md:text-xl font-semibold text-brand-navy mb-4">Review & place order</h2>
                <ReviewSection title="Shipping to" onEdit={() => setStep(1)}>
                  <div>{address.name} · {address.phone}</div>
                  <div className="text-muted-foreground">{address.street}, {address.city}{address.province ? `, ${address.province}` : ""}</div>
                </ReviewSection>
                <ReviewSection title="Payment" onEdit={() => setStep(2)}>
                  <div className="capitalize">{payment.replace("_", " ")}</div>
                </ReviewSection>
                <ReviewSection title="Items">
                  <ul className="space-y-2">
                    {lines.map((l, i) => (
                      <li key={l.key} className="flex items-center gap-3">
                        <img src={l.image} alt="" className="h-12 w-12 rounded object-cover bg-muted shrink-0" />
                        <div className="flex-1 min-w-0 text-sm">
                          <div className="truncate text-brand-navy">{l.name}</div>
                          <div className="text-xs text-muted-foreground">× {l.quantity}</div>
                        </div>
                        <div className="text-sm font-medium">{quote?.lines[i] ? pkr(quote.lines[i].subtotal) : "…"}</div>
                      </li>
                    ))}
                  </ul>
                </ReviewSection>
                <label className="flex items-start gap-2 text-sm mt-4">
                  <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-1" />
                  <span className="text-muted-foreground">I agree to the Terms of Service and confirm my order details.</span>
                </label>
                <div className="flex flex-col-reverse md:flex-row gap-3 mt-6">
                  <Button variant="outline" onClick={() => setStep(2)} className="h-12 md:h-11">Back</Button>
                  <Button onClick={onPlace} disabled={submitting || !terms || !quote || !!quoteError || quoteQ.isFetching} className="flex-1 h-14 md:h-12 rounded-full md:rounded-md bg-brand-teal hover:bg-brand-teal-dark text-base font-semibold">
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : `Place order · ${quote ? pkr(total) : "…"}`}
                  </Button>
                </div>
              </>
            )}
          </div>

          <aside className="bg-white rounded-xl border p-5 md:p-6 h-fit md:sticky md:top-24">
            <h3 className="font-display text-lg font-semibold text-brand-navy mb-4">Order Summary</h3>
            <ul className="space-y-2 text-sm mb-4 max-h-48 overflow-y-auto">
              {lines.map((l, i) => (
                <li key={l.key} className="flex gap-3">
                  <div className="text-muted-foreground">{l.quantity}×</div>
                  <div className="flex-1 truncate text-brand-navy">{quote?.lines[i]?.name ?? l.name}</div>
                  <div className="font-medium">{quote?.lines[i] ? pkr(quote.lines[i].subtotal) : "…"}</div>
                </li>
              ))}
            </ul>
            <div className="flex gap-2 mb-4">
              <Input placeholder="Coupon code" value={couponInput} onChange={(e) => setCouponInput(e.target.value)} className="h-11" />
              <Button onClick={applyCoupon} variant="outline" className="h-11">Apply</Button>
            </div>
            {appliedCoupon && (
              <div className="flex items-center justify-between text-xs mb-3 -mt-2">
                <span className="text-green-700">Coupon {appliedCoupon} applied</span>
                <button onClick={() => { setAppliedCoupon(null); setCouponInput(""); }} className="text-muted-foreground hover:underline">Remove</button>
              </div>
            )}
            {quoteError ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
                {quoteError}
                <Link to="/cart" className="block mt-1 underline">Update your cart</Link>
              </div>
            ) : !quote ? (
              <div className="py-4 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto text-muted-foreground" /></div>
            ) : (
              <div className={`space-y-2 text-sm border-t pt-3 ${quoteQ.isFetching ? "opacity-60" : ""}`}>
                <Row label="Subtotal" value={pkr(quote.subtotal)} />
                {quote.discount > 0 && <Row label={`Coupon (${quote.coupon_code})`} value={`-${pkr(quote.discount)}`} className="text-green-700" />}
                <Row
                  label={`Delivery · ${quote.zone_name} (${quote.eta_days}d)${quoteCity ? "" : " · estimate"}`}
                  value={quote.free_shipping ? "FREE" : pkr(quote.delivery_fee)}
                />
                {quote.cod_fee > 0 && <Row label="COD fee" value={pkr(quote.cod_fee)} />}
                <Row label={`Tax${quote.tax_rate > 0 ? ` (${quote.tax_rate}%)` : ""}`} value={pkr(quote.tax)} />
                <div className="border-t pt-3 mt-2 flex justify-between font-semibold text-base"><span>Total</span><span className="text-brand-teal">{pkr(quote.total)}</span></div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </SiteShell>
  );
}


function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const labels = ["Shipping", "Payment", "Review"];
  return (
    <>
      {/* Mobile: dots */}
      <div className="md:hidden flex items-center justify-center gap-2">
        {labels.map((_, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = step > n;
          const active = step === n;
          return (
            <div
              key={i}
              className={`h-2.5 rounded-full transition-all ${active ? "w-8 bg-brand-teal" : done ? "w-2.5 bg-brand-teal" : "w-2.5 bg-gray-300"}`}
            />
          );
        })}
      </div>
      {/* Desktop: full stepper */}
      <div className="hidden md:flex items-center gap-2 max-w-2xl">
        {labels.map((l, i) => {
          const n = (i + 1) as 1 | 2 | 3;
          const done = step > n;
          const active = step === n;
          return (
            <div key={l} className="flex items-center flex-1">
              <div className={`h-9 w-9 shrink-0 rounded-full flex items-center justify-center text-sm font-semibold ${done ? "bg-brand-teal text-white" : active ? "bg-brand-navy text-white" : "bg-muted text-muted-foreground"}`}>
                {done ? <Check className="h-4 w-4" /> : n}
              </div>
              <div className={`ml-2 text-sm font-medium ${active || done ? "text-brand-navy" : "text-muted-foreground"}`}>{l}</div>
              {i < labels.length - 1 && <div className={`flex-1 h-0.5 mx-3 ${done ? "bg-brand-teal" : "bg-muted"}`} />}
            </div>
          );
        })}
      </div>
    </>
  );
}


function Field({ label, children, className = "" }: { label: string; children: React.ReactNode; className?: string }) {
  return <div className={`space-y-1.5 ${className}`}><Label>{label}</Label>{children}</div>;
}
function Row({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return <div className={`flex justify-between ${className}`}><span className="text-muted-foreground">{label}</span><span>{value}</span></div>;
}
function ReviewSection({ title, children, onEdit }: { title: string; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="border-b py-3 first:pt-0">
      <div className="flex justify-between items-center mb-1.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-medium">{title}</div>
        {onEdit && <button onClick={onEdit} className="text-xs text-brand-teal hover:underline">Edit</button>}
      </div>
      <div className="text-sm text-brand-navy">{children}</div>
    </div>
  );
}
