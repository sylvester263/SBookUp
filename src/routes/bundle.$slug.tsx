import { useState, useMemo } from "react";
import { requireSchoolFeatures } from "@/lib/feature-flags";
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Share2, BookOpen, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { SiteShell, BundleCard, HScroller, FALLBACK_IMG, pkr } from "@/components/layout/site-chrome";
import { bundleBySlugQuery, relatedBundlesQuery } from "@/lib/product-queries";
import { cartStore } from "@/lib/cart-store";

export const Route = createFileRoute("/bundle/$slug")({
  // Hidden (404) while school features are switched off in admin Settings.
  beforeLoad: ({ context }) => requireSchoolFeatures(context.queryClient),
  head: ({ params }) => ({ meta: [{ title: `${params.slug} Bundle — SchoolBooksExperts` }] }),
  errorComponent: ({ error }) => <SiteShell><div className="container mx-auto p-12 text-center text-destructive">{error.message}</div></SiteShell>,
  notFoundComponent: () => <SiteShell><div className="container mx-auto p-12 text-center">Bundle not found.</div></SiteShell>,
  component: BundlePage,
});

function BundlePage() {
  const { slug } = Route.useParams();
  const { data, isLoading } = useQuery(bundleBySlugQuery(slug));
  const { data: related } = useQuery({ ...relatedBundlesQuery(data?.bundle?.id ?? ""), enabled: !!data?.bundle });
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [adding, setAdding] = useState(false);

  const handleAddBundle = () => {
    if (adding || !data?.bundle) return;
    setAdding(true);
    try {
      const b = data.bundle as any;
      const firstImg = (data.items as any[]).find((it) => it.products?.images?.[0])?.products?.images?.[0];
      cartStore.add({
        key: `bundle-${b.id}`,
        bundle_id: b.id,
        name: b.name,
        image: b.image_url || firstImg,
        price: Number(b.discounted_price) || Number(b.total_price) || 0,
        slug: b.slug,
      });
      toast.success("🎒 Bundle added to cart", { description: `${b.name} — ${pkr(Number(b.discounted_price) || Number(b.total_price) || 0)}` });
    } catch (err) {
      console.error("addBundleToCart failed:", err);
      toast.error("Failed to add bundle. Please try again.");
    } finally {
      setAdding(false);
    }
  };

  const totals = useMemo(() => {
    if (!data) return { individual: 0, bundle: 0, save: 0 };
    const items = data.items as any[];
    const chosen = items.filter((it) => selected[it.id] !== false);
    const individual = chosen.reduce((sum, it) => sum + ((it.products?.sale_price ?? it.products?.price ?? 0) * it.quantity), 0);
    const ratio = chosen.length / Math.max(1, items.length);
    const bundle = Number(data.bundle.discounted_price) * ratio;
    return { individual, bundle, save: Math.max(0, individual - bundle) };
  }, [data, selected]);

  if (isLoading) return <SiteShell><Skeleton className="container mx-auto mt-8 h-80" /></SiteShell>;
  if (!data?.bundle) throw notFound();
  const b = data.bundle as any;

  return (
    <SiteShell>
      {/* Hero */}
      <div className="bg-gradient-to-br from-brand-teal to-brand-teal-dark text-white">
        <div className="container mx-auto px-4 py-10">
          <div className="flex flex-wrap gap-2 mb-3">
            {b.class_level && <span className="bg-brand-gold text-white text-xs font-semibold px-3 py-1 rounded-full">{b.class_level}</span>}
            {b.exam_board && <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">{b.exam_board}</span>}
            {b.school_name && <span className="bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">{b.school_name}</span>}
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-2">{b.name}</h1>
          {b.description && <p className="text-white/90 max-w-2xl">{b.description}</p>}
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 grid grid-cols-1 md:grid-cols-5 gap-6 md:gap-8">
        {/* Book list */}
        <div className="md:col-span-3 space-y-3">
          <h2 className="font-display text-2xl font-bold text-brand-navy mb-2">Included Books ({data.items.length})</h2>
          {data.items.map((it: any) => {
            const prod = it.products;
            if (!prod) return null;
            const checked = selected[it.id] !== false;
            const price = prod.sale_price ?? prod.price;
            return (
              <div key={it.id} className="bg-white border border-border rounded-xl p-4 flex items-center gap-4">
                <Checkbox checked={checked} onCheckedChange={(v) => setSelected({ ...selected, [it.id]: !!v })} />
                <div className="w-16 h-20 rounded-lg overflow-hidden bg-brand-cream shrink-0">
                  <img src={prod.images?.[0] ?? FALLBACK_IMG} alt={prod.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <Link to="/product/$slug" params={{ slug: prod.slug }} className="font-display font-semibold text-brand-navy hover:text-brand-teal line-clamp-1">{prod.name}</Link>
                  <div className="text-xs text-muted-foreground">{prod.author ?? ""}</div>
                  <div className="text-xs text-muted-foreground">Qty: {it.quantity}</div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-brand-teal">{pkr(price * it.quantity)}</div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary card */}
        <div className="md:col-span-2">
          <div className="bg-white border border-border rounded-xl p-6 sticky top-24 space-y-4">
            <div className="flex items-center gap-2 text-brand-teal">
              <BookOpen className="h-5 w-5" />
              <span className="font-semibold">Bundle Summary</span>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between text-sm"><span className="text-muted-foreground">Individual total</span><span className="line-through text-muted-foreground">{pkr(totals.individual)}</span></div>
              <div className="flex justify-between"><span className="font-medium text-brand-navy">Bundle price</span><span className="text-2xl font-bold text-brand-teal">{pkr(totals.bundle)}</span></div>
              {totals.save > 0 && (
                <div className="bg-green-100 text-green-800 text-sm font-semibold px-3 py-2 rounded text-center">You save {pkr(totals.save)}</div>
              )}
            </div>
            <Button onClick={handleAddBundle} disabled={adding} className="w-full h-12 bg-brand-teal hover:bg-brand-teal-dark text-base disabled:opacity-60">
              {adding ? (<><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Adding…</>) : "Add Full Bundle to Cart"}
            </Button>
            <button onClick={() => { navigator.clipboard.writeText(window.location.href); toast.success("Bundle link copied"); }} className="w-full text-sm text-brand-teal flex items-center justify-center gap-2 hover:underline">
              <Share2 className="h-4 w-4" /> Share Bundle
            </button>
          </div>
        </div>
      </div>

      {related && related.length > 0 && (
        <HScroller title="Related Bundles">
          {related.map((rb: any) => <div key={rb.id} className="shrink-0"><BundleCard b={rb} /></div>)}
        </HScroller>
      )}
    </SiteShell>
  );
}
