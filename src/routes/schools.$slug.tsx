import { createFileRoute, notFound } from "@tanstack/react-router";
import { requireSchoolFeatures } from "@/lib/feature-flags";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { BookOpen, NotebookPen, Pencil, Check, ShoppingBag, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { SiteShell, pkr } from "@/components/layout/site-chrome";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import {
  schoolBySlugQuery,
  schoolClassesQuery,
  schoolBundleQuery,
  WHATSAPP_LINK,
  type SchoolBundleItem,
} from "@/lib/schools-data";
import { cartStore } from "@/lib/cart-store";

export const Route = createFileRoute("/schools/$slug")({
  // Hidden (404) while school features are switched off in admin Settings.
  beforeLoad: ({ context }) => requireSchoolFeatures(context.queryClient),
  loader: async ({ params, context }) => {
    const school = await context.queryClient.ensureQueryData(schoolBySlugQuery(params.slug));
    if (!school) throw notFound();
    return { school };
  },
  head: ({ loaderData }) => {
    const name = (loaderData as any)?.school?.name ?? "School";
    const title = `${name} Book List | SchoolBooksExperts`;
    const description = `Get complete book and notebook bundles for ${name}. Fast delivery in Lahore.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
      ],
    };
  },
  errorComponent: ({ error }) => (
    <div className="p-8 text-center text-sm text-muted-foreground">{error.message}</div>
  ),
  notFoundComponent: () => (
    <SiteShell>
      <div className="container mx-auto px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-bold text-brand-navy">School not found</h1>
        <p className="text-sm text-muted-foreground mt-2">
          We couldn't find that school. Browse all schools instead.
        </p>
      </div>
    </SiteShell>
  ),
  component: SchoolDetail,
});

function SchoolDetail() {
  const { school } = Route.useLoaderData();
  const { data: classes } = useQuery(schoolClassesQuery(school.id));
  const [activeClassId, setActiveClassId] = useState<string | null>(null);

  useEffect(() => {
    if (classes && classes.length > 0 && !activeClassId) {
      setActiveClassId(classes[0].id);
    }
  }, [classes, activeClassId]);

  const activeClass = classes?.find((c) => c.id === activeClassId) ?? null;

  return (
    <SiteShell>
      <section className="bg-brand-cream py-6 md:py-10">
        <div className="container mx-auto px-4 flex items-center gap-4">
          <div className="h-16 w-16 md:h-20 md:w-20 rounded-full bg-white flex items-center justify-center shadow overflow-hidden shrink-0">
            {school.logo_url ? (
              <img src={school.logo_url} alt={school.name} className="h-full w-full object-cover" />
            ) : (
              <BookOpen className="h-8 w-8 text-brand-teal" />
            )}
          </div>
          <div>
            <h1 className="font-display text-2xl md:text-4xl font-bold text-brand-navy">{school.name}</h1>
            <div className="text-sm text-muted-foreground">{school.city}</div>
          </div>
        </div>
      </section>

      <section className="container mx-auto px-4 py-6 md:py-10">
        {/* Class tabs */}
        <div className="flex gap-2 overflow-x-auto hide-scrollbar pb-2 mb-6 border-b border-border">
          {(classes ?? []).map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveClassId(c.id)}
              className={`shrink-0 px-4 py-2 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition ${
                activeClassId === c.id
                  ? "border-brand-teal text-brand-teal"
                  : "border-transparent text-muted-foreground hover:text-brand-navy"
              }`}
            >
              {c.class_name}
            </button>
          ))}
        </div>

        {activeClass && (
          <div className="max-w-3xl mx-auto">
            <BundleBlock
              schoolId={school.id}
              classId={activeClass.id}
              schoolName={school.name}
              className={activeClass.class_name}
            />
          </div>
        )}
      </section>
    </SiteShell>
  );
}

function BundleBlock({
  schoolId,
  classId,
  schoolName,
  className,
}: {
  schoolId: string;
  classId: string;
  schoolName: string;
  className: string;
}) {
  const { data: bundle, isLoading } = useQuery(schoolBundleQuery(schoolId, classId));

  if (isLoading) return <Skeleton className="w-full h-[280px] rounded-xl" />;

  if (!bundle) {
    return (
      <div className="bg-white rounded-xl border-2 border-dashed border-border p-8 text-center">
        <div className="text-4xl mb-3">📚</div>
        <h4 className="font-display text-lg font-bold text-brand-navy mb-2">
          Bundle coming soon for {schoolName} {className}!
        </h4>
        <p className="text-sm text-muted-foreground mb-4">
          WhatsApp us to get a custom book list for your child.
        </p>
        <a
          href={WHATSAPP_LINK}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-green-500 hover:bg-green-600 text-white px-5 py-2.5 rounded-full text-sm font-semibold"
        >
          <MessageCircle className="h-4 w-4" /> Chat on WhatsApp
        </a>
      </div>
    );
  }

  const books = bundle.items.filter((i) => i.item_type === "book");
  const notebooks = bundle.items.filter((i) => i.item_type === "notebook");
  const stationery = bundle.items.filter((i) => i.item_type === "stationery");

  // The whole school list is ONE cart line priced at the bundle price (set by the
  // school in admin). The server re-prices it from the database and reduces stock
  // for every item inside it.
  const addBundleToCart = () => {
    const perBundle = bundle.items
      .filter((it) => it.product)
      .map((it) => Math.floor((it.product!.stock_quantity ?? 0) / Math.max(1, it.quantity)));
    const available = perBundle.length ? Math.min(...perBundle) : 0;
    const added = cartStore.add(
      {
        key: `sb:${bundle.id}`,
        school_bundle_id: bundle.id,
        name: `${schoolName} — ${className} (${bundle.bundle_name})`,
        image: bundle.items.find((it) => it.product?.images?.[0])?.product?.images?.[0],
        price: Number(bundle.total_price), // display only; the server re-prices at checkout
        children: bundle.items.filter((it) => it.product).map((it) => `${it.quantity} × ${it.product!.name}`),
      },
      { max: available },
    );
    if (added === 0) {
      const short = bundle.items.filter((it) => it.product && (it.product.stock_quantity ?? 0) < it.quantity).map((it) => it.product!.name);
      return toast.error(short.length ? `Not enough stock for: ${short.join(", ")}` : "No more of this bundle available");
    }
    toast.success(`Added ${bundle.bundle_name} to cart`);
  };

  const addSingle = (it: SchoolBundleItem) => {
    if (!it.product) return;
    const unit = it.product.sale_price ?? it.product.price;
    const added = cartStore.add(
      {
        key: it.product.id,
        product_id: it.product.id,
        name: it.product.name,
        image: it.product.images?.[0],
        price: Number(unit), // display only; the server re-prices at checkout
        quantity: 1,
        slug: it.product.slug,
      },
      { max: it.product.stock_quantity },
    );
    if (added === 0) return toast.error(it.product.stock_quantity <= 0 ? `${it.product.name} is out of stock` : `No more ${it.product.name} in stock`);
    toast.success(`Added ${it.product.name}`);
  };

  const Section = ({ label, icon: Icon, items }: { label: string; icon: any; items: SchoolBundleItem[] }) => {
    if (items.length === 0) return null;
    return (
      <div className="py-3">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-teal mb-2">
          <Icon className="h-3.5 w-3.5" /> {label}
        </div>
        <ul className="space-y-1.5">
          {items.map((it) => (
            <li key={it.id} className="flex items-center gap-2 text-sm">
              <Check className="h-4 w-4 text-brand-teal shrink-0" />
              <span className="flex-1 text-brand-navy">
                {it.product?.name ?? "Unknown product"}
                {it.quantity > 1 && <span className="text-muted-foreground"> × {it.quantity}</span>}
              </span>
              {it.product && (
                <>
                  <span className="text-xs text-muted-foreground">
                    {pkr(Number(it.product.sale_price ?? it.product.price))}
                  </span>
                  <button
                    onClick={() => addSingle(it)}
                    className="text-xs px-2 py-1 rounded-full border border-brand-teal text-brand-teal hover:bg-brand-teal hover:text-white transition"
                  >
                    + Add
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="bg-gradient-to-r from-brand-teal to-brand-teal/80 text-white p-4">
        <div className="text-xs uppercase tracking-wider text-white/80 mb-1">Complete Bundle</div>
        <h4 className="font-display text-lg md:text-xl font-bold">📚 {bundle.bundle_name}</h4>
      </div>
      <div className="p-4 md:p-6 divide-y divide-border">
        <Section label="Books" icon={BookOpen} items={books} />
        <Section label="Notebooks" icon={NotebookPen} items={notebooks} />
        <Section label="Stationery" icon={Pencil} items={stationery} />
      </div>
      <div className="border-t border-border bg-brand-cream/40 p-4 md:p-5">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-brand-navy">Bundle Total</span>
          <span className="font-display text-2xl font-bold text-brand-gold">
            {pkr(Number(bundle.total_price))}
          </span>
        </div>
        <button
          onClick={addBundleToCart}
          className="w-full bg-brand-teal hover:bg-brand-teal-dark text-white py-3 rounded-full font-semibold flex items-center justify-center gap-2 transition"
        >
          <ShoppingBag className="h-4 w-4" /> Add Bundle to Cart
        </button>
      </div>
    </div>
  );
}

// keep supabase import used (loader uses query which uses supabase) — silence unused warning
void supabase;
