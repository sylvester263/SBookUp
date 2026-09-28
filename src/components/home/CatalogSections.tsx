// Homepage catalog sections. Order and visibility come from store settings
// (admin → Settings → Homepage); products come from catalog_search.
import { useQuery } from "@tanstack/react-query";
import { BookOpen } from "lucide-react";
import { HScroller, ProductCard, ProductSkeleton } from "@/components/layout/site-chrome";
import { storeSettingsQueryOptions } from "@/lib/feature-flags";
import { shopQuery, navCategoriesQuery, childrenOf, categoryHref } from "@/lib/shop";
import { parseHomeSections, parsePriceBands, priceBandHref } from "@/lib/home-sections";
import type { Product } from "@/lib/home-data";

export function HomeCatalogSections() {
  const settings = useQuery(storeSettingsQueryOptions);
  const sections = parseHomeSections((settings.data as Record<string, unknown> | undefined)?.home_sections);
  const bands = parsePriceBands((settings.data as Record<string, unknown> | undefined)?.price_bands);
  return (
    <>
      {sections.filter((s) => s.enabled).map((s) => {
        switch (s.key) {
          case "categories": return <CategoryGrid key={s.key} />;
          case "new_arrivals": return <ProductRow key={s.key} title="New Arrivals" emoji="✨" sort="new_arrivals" only="new_arrivals" viewAll="/shop" />;
          case "recently_added": return <ProductRow key={s.key} title="Recently Added" emoji="🆕" sort="newest" viewAll="/shop" />;
          case "best_sellers": return <ProductRow key={s.key} title="Best Sellers" emoji="🔥" sort="best_sellers" only="best_sellers" viewAll="/shop?sort=%22best_sellers%22" />;
          case "price_bands": return bands.length ? <PriceBands key={s.key} bands={bands} /> : null;
          default: return null;
        }
      })}
    </>
  );
}

function CategoryGrid() {
  const { data: cats, isLoading } = useQuery(navCategoriesQuery);
  const all = cats ?? [];
  const shown = childrenOf(all, null).filter((c) => c.show_on_home);
  if (!isLoading && !shown.length) return null;
  return (
    <section className="container mx-auto px-4 py-6 md:py-10">
      <h2 className="font-display text-xl md:text-2xl font-bold text-brand-navy mb-4 md:mb-6">Shop by Category</h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 md:gap-4">
        {(isLoading ? Array.from({ length: 6 }, () => null) : shown).map((c, i) =>
          c ? (
            <a key={c.id} href={categoryHref(all, c.slug)} className="group bg-white rounded-xl border overflow-hidden hover:shadow-lg transition">
              <div className="aspect-[4/3] bg-brand-teal/10 flex items-center justify-center overflow-hidden">
                {c.image_url
                  ? <img src={c.image_url} alt={c.name} loading="lazy" className="h-full w-full object-cover group-hover:scale-105 transition" />
                  : <BookOpen className="h-10 w-10 text-brand-teal" />}
              </div>
              <div className="p-3 text-center text-sm md:text-base font-semibold text-brand-navy">{c.name}</div>
            </a>
          ) : (
            <div key={i} className="aspect-[4/3] rounded-xl bg-muted animate-pulse" />
          ),
        )}
      </div>
    </section>
  );
}

function ProductRow({ title, emoji, sort, only, viewAll }: { title: string; emoji: string; sort: string; only?: "new_arrivals" | "best_sellers"; viewAll: string }) {
  const { data, isLoading } = useQuery(shopQuery(undefined, { sort: sort as never }, { only, perPage: 12 }));
  const items = data?.items ?? [];
  if (!isLoading && !items.length) return null;
  return (
    <HScroller title={title} emoji={emoji} viewAllHref={viewAll}>
      {isLoading
        ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="shrink-0"><ProductSkeleton /></div>)
        : items.map((p) => <div key={p.id} className="shrink-0 w-[160px] md:w-[210px]"><ProductCard p={p as unknown as Product} /></div>)}
    </HScroller>
  );
}

function PriceBands({ bands }: { bands: ReturnType<typeof parsePriceBands> }) {
  return (
    <section className="container mx-auto px-4 py-6">
      <div className="bg-brand-cream rounded-2xl p-4 md:p-6">
        <h2 className="font-display text-lg md:text-xl font-bold text-brand-navy mb-3">Shop by price</h2>
        <div className="flex gap-2 md:gap-3 overflow-x-auto hide-scrollbar">
          {bands.map((b) => (
            <a key={b.label} href={priceBandHref(b)} className="shrink-0 rounded-full border-2 border-brand-teal bg-white px-4 md:px-5 py-2 text-sm font-semibold text-brand-teal hover:bg-brand-teal hover:text-white transition">
              {b.label}
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}
