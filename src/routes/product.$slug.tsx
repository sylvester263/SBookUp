import { useEffect, useRef, useState } from "react";
import { useSchoolFeatures } from "@/lib/feature-flags";
import DOMPurify from "dompurify";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Minus, Plus, Truck, Share2, Star, Facebook, MessageCircle, Copy, ChevronLeft, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { SiteShell, FALLBACK_IMG, pkr } from "@/components/layout/site-chrome";
import { ProductCard } from "@/components/store/ProductCard";
import { ProductCarousel } from "@/components/store/ProductCarousel";
import { SectionHeading } from "@/components/store/SectionHeading";
import { productBySlugQuery, relatedProductsQuery } from "@/lib/product-queries";
import { attributeDefsQuery, navCategoriesQuery, ancestry, categoryHref } from "@/lib/shop";
import { axesFromVariants, findVariant, isOptionAvailable, initialSelection } from "@/lib/variant-picker";
import { formatPackPrice, isPack, packLabel, wasPriceOf } from "@/lib/pricing";
import { SITE_NAME, breadcrumbJsonLd, jsonLd, plainText, productJsonLd, siteUrl, type SeoProduct } from "@/lib/seo";
import { WishlistButton } from "@/components/site/WishlistButton";
import { ProductReviews } from "@/components/site/ProductReviews";
import { cartStore } from "@/lib/cart-store";

export const Route = createFileRoute("/product/$slug")({
  // Loaded on the server too, so search engines get the real title, canonical and JSON-LD
  loader: async ({ params, context }) => {
    const [product, cats] = await Promise.all([
      context.queryClient.ensureQueryData(productBySlugQuery(params.slug)).catch(() => null),
      context.queryClient.ensureQueryData(navCategoriesQuery).catch(() => []),
    ]);
    const seo = product as unknown as (SeoProduct & { categories: { slug: string } | null }) | null;
    const chain = seo?.categories?.slug ? ancestry(cats, seo.categories.slug) : [];
    return { product: seo, chain };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    if (!p) {
      return { meta: [{ title: `Product not found — ${SITE_NAME}` }, { name: "robots", content: "noindex" }] };
    }
    const url = siteUrl(`/product/${p.slug}`);
    const title = `${p.name} — ${SITE_NAME}`;
    const description = plainText(p.description, 160) || `Buy ${p.name} online at ${SITE_NAME}. Delivery across Pakistan.`;
    const image = p.images?.[0];
    const crumbs = [
      { name: "Home", path: "/" }, { name: "Shop", path: "/shop" },
      ...(loaderData?.chain ?? []).map((c) => ({ name: c.name, path: categoryHref(loaderData!.chain, c.slug) })),
      { name: p.name, path: `/product/${p.slug}` },
    ];
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "product" },
        { property: "og:url", content: url },
        ...(image ? [{ property: "og:image", content: image }] : []),
      ],
      // Always the product's own slug (also when opened by id)
      links: [{ rel: "canonical", href: url }],
      scripts: [
        { type: "application/ld+json", children: jsonLd(productJsonLd(p)) },
        { type: "application/ld+json", children: jsonLd(breadcrumbJsonLd(crumbs)) },
      ],
    };
  },
  errorComponent: ({ error }) => <SiteShell><div className="container mx-auto p-12 text-center text-destructive">{error.message}</div></SiteShell>,
  notFoundComponent: () => <SiteShell><div className="container mx-auto p-12 text-center">Product not found.</div></SiteShell>,
  component: ProductDetailPage,
});

function ProductDetailPage() {
  const { slug } = Route.useParams();
  const navigate = useNavigate();
  const [qty, setQty] = useState(1);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [selection, setSelection] = useState<Record<string, string>>({});
  const defsQ = useQuery(attributeDefsQuery);
  const catsQ = useQuery(navCategoriesQuery);
  const schoolFeatures = useSchoolFeatures();
  const { data: product, isPending, error } = useQuery(productBySlugQuery(slug));
  const categoryId = (product as any)?.category_id ?? null;
  const { data: related } = useQuery({ ...relatedProductsQuery(categoryId, (product as any)?.id ?? ""), enabled: !!product });

  // Sticky bar visibility via IntersectionObserver
  const inlineBtnRef = useRef<HTMLDivElement>(null);
  const [showStickyBar, setShowStickyBar] = useState(false);
  useEffect(() => {
    if (!inlineBtnRef.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => setShowStickyBar(!entry.isIntersecting),
      { threshold: 0 }
    );
    obs.observe(inlineBtnRef.current);
    return () => obs.disconnect();
  }, [product]);

  if (isPending) return <SiteShell><ProductSkeletonView /></SiteShell>;
  if (error) {
    console.error("Product fetch error:", error);
    return <SiteShell><ProductMissingView title="Something went wrong" message="We couldn't load this product. Please try again." onBack={() => navigate({ to: "/shop" })} /></SiteShell>;
  }
  if (!product) {
    return <SiteShell><ProductMissingView title="Product not found" message="This product may have been removed or the link is incorrect." onBack={() => navigate({ to: "/shop" })} /></SiteShell>;
  }

  const p = product as any;
  const baseImages: string[] = (p.images && p.images.length ? p.images : [FALLBACK_IMG]);
  const baseSale = p.sale_price && p.sale_price < p.price ? p.sale_price : null;
  // Variants (edition / binding …): each has its own price and stock. Same rule as
  // the server: variant price if set, otherwise product price + modifier.
  const variants: any[] = (p.variants ?? []).filter((v: any) => v.is_active !== false);
  const defs = defsQ.data ?? [];
  const axes = axesFromVariants(variants, defs);
  const sel = { ...initialSelection(axes), ...selection };
  const variant = axes.length ? findVariant(variants, axes, sel) : variants.find((v) => v.id === variantId) ?? null;
  const needsVariant = variants.length > 0 && !variant;
  const baseUnit = Number(baseSale ?? p.price);
  const variantUnit = (v: any) => (v.price != null ? Number(v.price) : baseUnit + Number(v.price_modifier ?? 0));
  const sale = variant ? null : baseSale;
  const displayPrice = variant ? variantUnit(variant) : baseUnit;
  // Struck-through "was" price: the product's regular price when on sale, or the
  // selected variant's compare-at price (display only).
  const wasPrice = variant ? wasPriceOf(displayPrice, variant.compare_at_price) : sale ? Number(p.price) : null;
  const saving = wasPrice ? wasPrice - displayPrice : 0;
  const stock = variant ? Number(variant.stock ?? 0) : needsVariant ? Math.max(0, ...variants.map((v) => Number(v.stock ?? 0))) : p.stock_quantity ?? 0;
  const stockState = stock <= 0 ? "out" : stock < (p.low_stock_threshold ?? 5) ? "low" : "ok";
  // A variant's own image comes first when that variant is selected
  const images: string[] = variant?.image_url ? [variant.image_url, ...baseImages.filter((u) => u !== variant.image_url)] : baseImages;
  const pack = isPack(p);
  // Breadcrumbs / "Also in" from the product's categories
  const cats = catsQ.data ?? [];
  const crumbs = p.categories?.slug ? ancestry(cats, p.categories.slug) : [];
  const alsoIn = ((p.all_categories ?? []) as { slug: string; name: string; is_primary: boolean }[]).filter((c) => !c.is_primary);
  // Attributes table (labels from the definitions; size/colour live on variants)
  const attrRows: [string, string][] = Object.entries((p.attributes ?? {}) as Record<string, unknown>)
    .filter(([k]) => !axes.some((a) => a.key === k))
    .map(([k, v]) => {
      const d = defs.find((x) => x.key === k);
      const label = (val: string) => d?.options?.find((o) => o.value === val)?.label ?? val;
      const text = Array.isArray(v) ? (v as string[]).map(label).join(", ") : label(String(v));
      return [d?.label ?? k.replace(/_/g, " "), `${text}${d?.unit && d.type === "number" ? ` ${d.unit}` : ""}`] as [string, string];
    })
    .sort((a, b) => (defs.findIndex((d) => d.label === a[0]) - defs.findIndex((d) => d.label === b[0])));

  const addToCart = () => {
    try {
      if (needsVariant) return toast.error(axes.length ? `Please choose ${axes.filter((a) => !sel[a.key]).map((a) => a.label.toLowerCase()).join(" and ") || "an option"}` : "Please choose an option first");
      if (stock <= 0) return toast.error(`${p.name} is out of stock`);
      const added = cartStore.add(
        {
          key: variant ? `${p.id}|${variant.id}` : p.id,
          product_id: p.id,
          variant_id: variant?.id,
          name: variant ? `${p.name} — ${variant.name}` : p.name,
          image: images[0],
          price: displayPrice, // display only; the server re-prices at checkout
          slug: p.slug,
          quantity: qty,
        },
        { max: stock },
      );
      if (added === 0) return toast.error(`You already have all ${stock} available in your cart`);
      if (added < qty) return toast.warning(`Only ${stock} in stock — added ${added} (cart now has the maximum)`);
      toast.success(`Added ${added} × ${p.name} to cart`);
    } catch (err) {
      console.error("Add to cart error:", err);
      toast.error("Couldn't add to cart. Please try again.");
    }
  };

  return (
    <SiteShell>
      <div className="md:container md:mx-auto md:px-4 md:py-6 pb-24 md:pb-6">
        {/* Breadcrumb (desktop only) */}
        <nav className="hidden md:flex text-sm text-muted-foreground mb-4 items-center gap-1.5 flex-wrap">
          <Link to="/" className="hover:text-brand-teal">Home</Link><span>/</span>
          {crumbs.length > 0
            ? crumbs.map((c) => <span key={c.id} className="flex items-center gap-1.5"><a href={categoryHref(cats, c.slug)} className="hover:text-brand-teal">{c.name}</a><span>/</span></span>)
            : p.categories && <><a href={`/shop/${p.categories.slug}`} className="hover:text-brand-teal">{p.categories.name}</a><span>/</span></>}
          <span className="text-brand-navy">{p.name}</span>
        </nav>

        <div className="grid grid-cols-1 md:grid-cols-12 md:gap-8">
          {/* Gallery */}
          <Gallery images={images} alt={p.name} sale={!!sale} />

          {/* Info */}
          <div className="md:col-span-5 space-y-3 md:space-y-4 px-4 md:px-0 mt-3 md:mt-0">
            {p.isbn && <span className="inline-block text-xs border border-brand-teal text-brand-teal px-2 py-0.5 rounded-full">ISBN: {p.isbn}</span>}
            <h1 className="font-display text-xl md:text-4xl font-bold text-brand-navy leading-snug">{p.name}</h1>
            {(p.author ?? p.brand) && <div className="text-sm text-gray-500">{p.author ?? p.brand}</div>}
            {alsoIn.length > 0 && (
              <div className="text-xs text-muted-foreground">Also in:{" "}
                {alsoIn.map((c, i) => <span key={c.slug}>{i > 0 && ", "}<a href={categoryHref(cats, c.slug)} className="text-brand-teal hover:underline">{c.name}</a></span>)}
              </div>
            )}

            <div className="flex items-center gap-2">
              <a href="#reviews" className="text-xs md:text-sm text-brand-teal hover:underline">Read reviews</a>
            </div>

            <div>
              <div className="flex items-baseline gap-2">
                <div className="text-2xl md:text-3xl font-bold text-brand-teal">{pkr(displayPrice)}{pack && <span className="text-base font-medium text-muted-foreground"> / pack</span>}</div>
                {wasPrice != null && <div className="text-sm md:text-lg text-gray-400 line-through">{pkr(wasPrice)}</div>}
              </div>
              {saving > 0 && <span className="inline-block mt-1 bg-green-100 text-green-800 text-xs font-semibold px-2 py-1 rounded-full">Save {pkr(saving)}</span>}
              {pack && <div className="text-sm text-muted-foreground mt-1"><span className="font-semibold text-brand-gold">{packLabel(p)}</span> · {formatPackPrice(displayPrice, p)}</div>}
            </div>

            {axes.length > 0 && axes.map((axis) => (
              <div key={axis.key}>
                <div className="text-sm font-medium text-brand-navy mb-2">{axis.label}{sel[axis.key] ? `: ${sel[axis.key]}` : ""}</div>
                <div className="flex flex-wrap gap-2">
                  {axis.values.map((o) => {
                    const on = sel[axis.key] === o.value;
                    const available = isOptionAvailable(variants, axes, sel, axis.key, o.value);
                    return (
                      <button key={o.value} type="button" aria-pressed={on} disabled={!available && !on}
                        title={available ? undefined : "Out of stock with the current selection"}
                        onClick={() => { setSelection({ ...sel, [axis.key]: o.value }); setQty(1); }}
                        className={`min-w-11 px-3 py-2 rounded-md border text-sm ${on ? "border-brand-teal bg-brand-teal/10 text-brand-teal font-semibold" : "border-border hover:bg-muted"} ${available ? "" : "opacity-40 line-through cursor-not-allowed"}`}>
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {axes.length === 0 && variants.length > 0 && (
              <div>
                <div className="text-sm font-medium text-brand-navy mb-2">Choose an option</div>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const out = Number(v.stock ?? 0) <= 0;
                    const active = v.id === variantId;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => { setVariantId(v.id); setQty(1); }}
                        className={`px-3 py-2 rounded-md border text-sm ${active ? "border-brand-teal bg-brand-teal/10 text-brand-teal" : "border-border hover:bg-muted"} ${out ? "opacity-50" : ""}`}
                      >
                        {v.name} · {pkr(variantUnit(v))}{out ? " · sold out" : ""}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className={`text-sm flex items-center gap-2 ${stockState === "ok" ? "text-green-700" : stockState === "low" ? "text-orange-600" : "text-red-600"}`}>
              <span className={`inline-block h-2 w-2 rounded-full ${stockState === "ok" ? "bg-green-600" : stockState === "low" ? "bg-orange-600" : "bg-red-600"}`} />
              {stockState === "ok" ? `In Stock (${stock} left)` : stockState === "low" ? `Low Stock — only ${stock} left!` : "Out of Stock"}
            </div>

            {/* Qty stepper */}
            <div className="flex items-center justify-center md:justify-start gap-0 pt-2">
              <div className="flex items-center border border-border rounded-md">
                <button type="button" aria-label="Decrease quantity" onClick={() => setQty(Math.max(1, qty - 1))} className="h-11 w-11 flex items-center justify-center hover:bg-muted"><Minus className="h-4 w-4" /></button>
                <span className="w-12 h-11 flex items-center justify-center text-center font-medium">{qty}</span>
                <button type="button" aria-label="Increase quantity" onClick={() => setQty(Math.min(Math.max(1, stock), qty + 1))} disabled={qty >= stock} className="h-11 w-11 flex items-center justify-center hover:bg-muted disabled:opacity-40"><Plus className="h-4 w-4" /></button>
              </div>
            </div>

            {schoolFeatures && (
              <div className="bg-brand-teal/10 border border-brand-teal/30 rounded-xl p-4">
                <div className="text-sm text-brand-navy font-medium mb-1">📦 This book may be part of a bundle</div>
                <div className="text-xs text-muted-foreground mb-3">Save more when you buy as part of a class bundle.</div>
                <Link to="/shop" className="text-sm font-semibold text-brand-teal hover:underline">View Bundle →</Link>
              </div>
            )}

            <div ref={inlineBtnRef} className="grid grid-cols-1 gap-2 pt-2">
              <Button
                disabled={stockState === "out"}
                onClick={addToCart}
                className="w-full h-12 bg-brand-teal hover:bg-brand-teal-dark text-base"
              >
                {stockState === "out" ? "Out of Stock" : "Add to Cart"}
              </Button>
              <WishlistButton productId={p.id} size="lg" />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
              <Truck className="h-4 w-4 text-brand-teal" /> Estimated delivery: 2–4 days
            </div>

            <ShareRow name={p.name} />
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-8 md:mt-12 px-4 md:px-0">
          <Tabs defaultValue="desc">
            <TabsList className="w-full md:w-auto overflow-x-auto hide-scrollbar flex md:inline-flex whitespace-nowrap">
              <TabsTrigger value="desc" className="text-sm px-4 py-3">Description</TabsTrigger>
              <TabsTrigger value="details" className="text-sm px-4 py-3">Details</TabsTrigger>
              <TabsTrigger value="reviews" className="text-sm px-4 py-3">Reviews</TabsTrigger>
              <TabsTrigger value="shipping" className="text-sm px-4 py-3">Shipping</TabsTrigger>
            </TabsList>
            <TabsContent value="desc" className="bg-white border border-border rounded-xl p-4 md:p-6 mt-4 prose max-w-none text-sm md:text-base">
              {p.description ? <div dangerouslySetInnerHTML={{ __html: DOMPurify.isSupported ? DOMPurify.sanitize(p.description) : p.description }} /> : <p className="text-muted-foreground">No description available.</p>}
            </TabsContent>
            <TabsContent value="details" className="bg-white border border-border rounded-xl p-4 md:p-6 mt-4">
              <table className="w-full text-sm">
                <tbody>
                  {[
                    ...attrRows,
                    ["ISBN", p.isbn], ["Edition", p.edition], ["Brand", p.brand],
                    ["Sold as", pack ? `${packLabel(p)} ${p.unit_label ? `(${p.unit_label}s)` : ""}` : null],
                    ["SKU", variant?.sku ?? p.sku],
                  ].filter(([, v]) => v).map(([k, v]) => (
                    <tr key={k} className="border-b border-border last:border-0">
                      <td className="py-2 font-medium text-brand-navy w-1/3">{k}</td>
                      <td className="py-2 text-muted-foreground">{v as string}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TabsContent>
            <TabsContent value="reviews" id="reviews" className="mt-4">
              <ProductReviews productId={p.id} />
            </TabsContent>
            <TabsContent value="shipping" className="bg-white border border-border rounded-xl p-4 md:p-6 mt-4 text-sm">
              <table className="w-full">
                <thead><tr className="text-left border-b border-border"><th className="py-2">Zone</th><th>Estimated</th><th>Base Rate</th></tr></thead>
                <tbody>
                  <tr className="border-b"><td className="py-2">Lahore</td><td>1–2 days</td><td>PKR 150</td></tr>
                  <tr className="border-b"><td className="py-2">Punjab</td><td>2–3 days</td><td>PKR 200</td></tr>
                  <tr className="border-b"><td className="py-2">Pakistan</td><td>3–5 days</td><td>PKR 300</td></tr>
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-3">Free delivery on orders above PKR 2,000.</p>
            </TabsContent>
          </Tabs>
        </div>

        {related && related.length > 0 && (
          <section className="px-4 md:px-0 py-6 md:py-10">
            <SectionHeading title="You May Also Like" />
            <ProductCarousel label="You May Also Like">
              {related.map((rp) => <ProductCard key={rp.id} p={rp} />)}
            </ProductCarousel>
          </section>
        )}
      </div>

      {/* Sticky add-to-cart bar (mobile only) */}
      {showStickyBar && stockState !== "out" && (
        <div
          className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t shadow-lg flex items-center justify-between px-4"
          style={{ height: 64, paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="text-brand-teal font-bold text-lg">{pkr(displayPrice)}</div>
          <Button onClick={addToCart} className="bg-brand-teal hover:bg-brand-teal-dark rounded-full px-6 py-2.5 h-11">
            Add to Cart
          </Button>
        </div>
      )}
    </SiteShell>
  );
}

function Gallery({ images, alt, sale }: { images: string[]; alt: string; sale?: boolean }) {
  const [idx, setIdx] = useState(0);
  const [zoom, setZoom] = useState<{ x: number; y: number } | null>(null);
  const touchStart = useRef<number | null>(null);
  return (
    <div className="md:col-span-7 space-y-3">
      <div
        className="relative aspect-square bg-white md:border md:border-border md:rounded-xl overflow-hidden group"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setZoom({ x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 });
        }}
        onMouseLeave={() => setZoom(null)}
        onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
        onTouchEnd={(e) => {
          if (touchStart.current == null) return;
          const dx = e.changedTouches[0].clientX - touchStart.current;
          if (Math.abs(dx) > 40) {
            if (dx < 0) setIdx((i) => (i + 1) % images.length);
            else setIdx((i) => (i - 1 + images.length) % images.length);
          }
          touchStart.current = null;
        }}
      >
        {sale && <span className="absolute top-3 left-3 z-10 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded-full">SALE</span>}
        <img src={images[idx]} alt={alt} className="w-full h-full object-contain transition-transform" style={zoom ? { transform: `scale(2)`, transformOrigin: `${zoom.x}% ${zoom.y}%` } : undefined} />
        {images.length > 1 && (
          <>
            <button onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)} className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow items-center justify-center hover:bg-white"><ChevronLeft className="h-5 w-5" /></button>
            <button onClick={() => setIdx((i) => (i + 1) % images.length)} className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-full bg-white/90 shadow items-center justify-center hover:bg-white"><ChevronRight className="h-5 w-5" /></button>
          </>
        )}
      </div>
      {images.length > 1 && (
        <>
          {/* Mobile thumbnails (horizontal scroll) */}
          <div className="md:hidden flex gap-2 overflow-x-auto hide-scrollbar px-4">
            {images.map((src, i) => (
              <button key={i} onClick={() => setIdx(i)} className={`h-12 w-12 shrink-0 rounded-lg overflow-hidden border-2 transition ${i === idx ? "border-brand-teal" : "border-transparent"}`}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
          {/* Desktop thumbnails (grid) */}
          <div className="hidden md:grid grid-cols-4 gap-2">
            {images.slice(0, 4).map((src, i) => (
              <button key={i} onClick={() => setIdx(i)} className={`aspect-square rounded-lg overflow-hidden border-2 transition ${i === idx ? "border-brand-teal" : "border-transparent"}`}>
                <img src={src} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ShareRow({ name }: { name: string }) {
  const url = typeof window !== "undefined" ? window.location.href : "";
  return (
    <div className="flex items-center gap-2 pt-2">
      <Share2 className="h-4 w-4 text-muted-foreground" />
      <a href={`https://wa.me/?text=${encodeURIComponent(name + " " + url)}`} target="_blank" rel="noreferrer" aria-label="Share on WhatsApp" className="h-11 w-11 rounded-full bg-green-500 hover:bg-green-600 text-white flex items-center justify-center"><MessageCircle className="h-4 w-4" /></a>
      <a href={`https://facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noreferrer" aria-label="Share on Facebook" className="h-11 w-11 rounded-full bg-[#1877F2] text-white flex items-center justify-center"><Facebook className="h-4 w-4" /></a>
      <button type="button" aria-label="Copy link" onClick={() => { navigator.clipboard.writeText(url); toast.success("Link copied"); }} className="h-11 w-11 rounded-full bg-muted hover:bg-brand-teal hover:text-white flex items-center justify-center"><Copy className="h-4 w-4" /></button>
    </div>
  );
}

function ProductMissingView({ title, message, onBack }: { title: string; message: string; onBack: () => void }) {
  return (
    <div className="container mx-auto px-4 py-20 text-center">
      <div className="text-6xl mb-4">📦</div>
      <h1 className="font-display text-2xl font-bold text-brand-navy mb-2">{title}</h1>
      <p className="text-muted-foreground mb-8 max-w-md mx-auto">{message}</p>
      <div className="flex justify-center gap-3">
        <Button variant="outline" onClick={onBack}>← Go back</Button>
        <Link to="/shop"><Button className="bg-brand-teal hover:bg-brand-teal-dark">Browse all products</Button></Link>
      </div>
    </div>
  );
}

function ProductSkeletonView() {
  return (
    <div className="md:container md:mx-auto md:px-4 md:py-6 grid md:grid-cols-12 md:gap-8">
      <Skeleton className="md:col-span-7 aspect-square md:rounded-xl" />
      <div className="md:col-span-5 space-y-3 px-4 md:px-0 mt-3 md:mt-0">
        <Skeleton className="h-8 w-3/4" /><Skeleton className="h-4 w-1/2" /><Skeleton className="h-10 w-1/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}
