// /shop listing: breadcrumbs, category banner, category-specific filters (drawer on
// mobile), price range slider, sort, active-filter chips, grid, pagination, empty state.
// Everything the user picks lives in the URL; filtering happens in catalog_search.
import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { SlidersHorizontal, X, ChevronLeft, ChevronRight, PackageSearch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { pkr } from "@/components/layout/site-chrome";
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard";
import {
  SORTS, PER_PAGE, shopQuery, navCategoriesQuery, ancestry, categoryHref, activeChips, clearAllPatch, toggleValue, cleanFilters,
  type ShopSearch, type ShopResult, type Facet,
} from "@/lib/shop";

export function ShopListing({ categorySlug, search, update }: {
  categorySlug?: string;
  search: ShopSearch;
  /** Merge a patch into the URL search params (replace = don't add a history entry). */
  update: (patch: Partial<ShopSearch>, replace?: boolean) => void;
}) {
  const cats = useQuery(navCategoriesQuery);
  const q = useQuery({ ...shopQuery(categorySlug, search), placeholderData: (prev) => prev });
  const result = q.data;
  const [drawer, setDrawer] = useState(false);

  // Filters that don't exist in this category are dropped from the URL.
  useEffect(() => {
    if (!result || result.not_found || !search.f) return;
    const cleaned = cleanFilters(search.f, result.filter_keys);
    if (JSON.stringify(cleaned ?? {}) !== JSON.stringify(search.f)) update({ f: cleaned }, true);
  }, [result, search.f, update]);

  const chain = categorySlug ? ancestry(cats.data ?? [], categorySlug) : [];
  const category = chain[chain.length - 1];
  const typeLabel = categorySlug ? "Type" : "Category";
  const chips = activeChips(search, result, typeLabel);
  const pages = result ? Math.max(1, Math.ceil(result.total / PER_PAGE)) : 1;
  const page = search.page ?? 1;
  const title = search.q && !categorySlug ? `Results for “${search.q}”` : category?.name ?? (categorySlug ? "" : "Shop");

  const filters = result && !result.not_found ? (
    <FilterPanel result={result} search={search} update={update} typeLabel={typeLabel} />
  ) : null;

  return (
    <div className="container mx-auto px-4 py-4 md:py-6">
      {/* Breadcrumbs */}
      <nav aria-label="Breadcrumb" className="text-xs md:text-sm text-muted-foreground mb-3 flex flex-wrap items-center gap-1.5">
        <Link to="/" className="hover:text-brand-teal">Home</Link><span>/</span>
        {categorySlug ? <a href="/shop" className="hover:text-brand-teal">Shop</a> : <span className="text-brand-navy">Shop</span>}
        {chain.map((c, i) => (
          <span key={c.id} className="flex items-center gap-1.5">
            <span>/</span>
            {i < chain.length - 1 ? <a href={categoryHref(cats.data ?? [], c.slug)} className="hover:text-brand-teal">{c.name}</a> : <span className="text-brand-navy">{c.name}</span>}
          </span>
        ))}
      </nav>

      {/* Banner */}
      {category && (category.image_url || category.description) ? (
        <div className="relative rounded-xl overflow-hidden bg-brand-teal/10 mb-5 flex items-center min-h-[96px] md:min-h-[140px]">
          {category.image_url && <img src={category.image_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-30" />}
          <div className="relative p-4 md:p-6 max-w-2xl">
            <h1 className="font-display text-2xl md:text-3xl font-bold text-brand-navy">{category.name}</h1>
            {category.description && <p className="text-sm md:text-base text-brand-navy/80 mt-1 line-clamp-3">{category.description}</p>}
          </div>
        </div>
      ) : (
        <h1 className="font-display text-2xl md:text-3xl font-bold text-brand-navy mb-4">{title}</h1>
      )}

      <div className="md:grid md:grid-cols-[240px_1fr] lg:grid-cols-[260px_1fr] md:gap-6">
        <aside className="hidden md:block">{filters}</aside>

        <div>
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="text-sm text-muted-foreground">{result ? `${result.total.toLocaleString()} products` : " "}</div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="md:hidden" onClick={() => setDrawer(true)}>
                <SlidersHorizontal className="h-4 w-4 mr-1" /> Filters{chips.length ? ` (${chips.length})` : ""}
              </Button>
              <Select value={search.sort ?? "new_arrivals"} onValueChange={(v) => update({ sort: v === "new_arrivals" ? undefined : (v as ShopSearch["sort"]), page: undefined })}>
                <SelectTrigger className="w-[170px] h-9" aria-label="Sort products"><SelectValue /></SelectTrigger>
                <SelectContent>{SORTS.map((s) => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Active filter chips */}
          {chips.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {chips.map((c) => (
                <button key={c.key} onClick={() => update(c.patch)} className="inline-flex items-center gap-1 rounded-full border border-brand-teal/40 bg-brand-teal/5 px-3 py-1 text-xs text-brand-navy hover:bg-brand-teal/10">
                  {c.label} <X className="h-3 w-3" />
                </button>
              ))}
              <button onClick={() => update(clearAllPatch)} className="text-xs text-brand-teal hover:underline">Clear all</button>
            </div>
          )}

          {/* Grid */}
          {q.isLoading || !result ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
              {Array.from({ length: 8 }).map((_, i) => <ProductCardSkeleton key={i} />)}
            </div>
          ) : result.not_found ? (
            <Empty title="Category not found" text="This category doesn't exist or is no longer available." />
          ) : result.items.length === 0 ? (
            <Empty
              title="No products match"
              text={chips.length ? "Try removing a filter or widening the price range." : "There are no products here yet — check back soon."}
              action={chips.length ? <Button variant="outline" onClick={() => update(clearAllPatch)}>Clear all filters</Button> : null}
            />
          ) : (
            <>
              {/* Keeps headings in order (h1 page title → h2 → product names in h3) */}
              <h2 className="sr-only">Products</h2>
              <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4 ${q.isFetching ? "opacity-60 transition-opacity" : ""}`}>
                {result.items.map((p, i) => <ProductCard key={p.id} p={p} priority={i < 4} />)}
              </div>
            </>
          )}

          {/* Pagination */}
          {result && !result.not_found && pages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-8">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => update({ page: page - 1 === 1 ? undefined : page - 1 })} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
              <span className="text-sm text-muted-foreground">Page {page} of {pages}</span>
              <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => update({ page: page + 1 })} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
            </div>
          )}
        </div>
      </div>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="left" className="w-[300px] overflow-y-auto">
          <SheetHeader><SheetTitle>Filters</SheetTitle></SheetHeader>
          <div className="mt-4">{filters}</div>
          <Button className="w-full mt-4 bg-brand-teal hover:bg-brand-teal-dark" onClick={() => setDrawer(false)}>
            Show {result?.total.toLocaleString() ?? ""} products
          </Button>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function FilterPanel({ result, search, update, typeLabel }: { result: ShopResult; search: ShopSearch; update: (p: Partial<ShopSearch>) => void; typeLabel: string }) {
  return (
    <div className="space-y-5">
      {result.types.length > 0 && (
        <FilterGroup title={typeLabel}>
          {result.types.map((t) => (
            <CheckRow key={t.value} label={t.label} count={t.count} checked={(search.type ?? []).includes(t.value)}
              onChange={() => update({ type: toggleValue(search.type, t.value), page: undefined })} />
          ))}
        </FilterGroup>
      )}
      <PriceFilter result={result} search={search} update={update} />
      {result.facets.map((f) => <FacetGroup key={f.key} facet={f} search={search} update={update} />)}
    </div>
  );
}

function FacetGroup({ facet, search, update }: { facet: Facet; search: ShopSearch; update: (p: Partial<ShopSearch>) => void }) {
  const [all, setAll] = useState(false);
  const selected = search.f?.[facet.key] ?? [];
  const options = all ? facet.options : facet.options.slice(0, 8);
  const set = (v: string) => {
    const next = { ...(search.f ?? {}), [facet.key]: toggleValue(selected, v) ?? [] };
    if (!next[facet.key].length) delete next[facet.key];
    update({ f: Object.keys(next).length ? next : undefined, page: undefined });
  };
  return (
    <FilterGroup title={facet.label} help={facet.help_text ?? undefined}>
      {options.map((o) => (
        <CheckRow key={o.value} label={`${o.label}${facet.unit && facet.type === "number" ? ` ${facet.unit}` : ""}`} count={o.count} checked={selected.includes(o.value)} onChange={() => set(o.value)} />
      ))}
      {facet.options.length > 8 && (
        <button onClick={() => setAll((v) => !v)} className="text-xs text-brand-teal hover:underline mt-1">{all ? "Show less" : `Show all ${facet.options.length}`}</button>
      )}
    </FilterGroup>
  );
}

function PriceFilter({ result, search, update }: { result: ShopResult; search: ShopSearch; update: (p: Partial<ShopSearch>) => void }) {
  const lo = Math.floor(Number(result.price.min ?? 0));
  const hi = Math.ceil(Number(result.price.max ?? 0));
  const cur: [number, number] = useMemo(() => [Math.max(lo, search.min ?? lo), Math.min(hi, search.max ?? hi)], [lo, hi, search.min, search.max]);
  const [val, setVal] = useState<[number, number]>(cur);
  const [inputs, setInputs] = useState({ min: search.min?.toString() ?? "", max: search.max?.toString() ?? "" });
  useEffect(() => { setVal(cur); setInputs({ min: search.min?.toString() ?? "", max: search.max?.toString() ?? "" }); }, [cur, search.min, search.max]);
  if (result.price.min == null) return null;
  const apply = (min: number | undefined, max: number | undefined) =>
    update({ min: min != null && min > lo ? min : undefined, max: max != null && max < hi ? max : undefined, page: undefined });
  return (
    <FilterGroup title="Price">
      {hi > lo && (
        <div className="px-1 pt-2 pb-1">
          <Slider min={lo} max={hi} step={Math.max(1, Math.round((hi - lo) / 100))} value={val}
            onValueChange={(v) => setVal([v[0], v[1]])} onValueCommit={(v) => apply(v[0], v[1])} />
          <div className="flex justify-between text-xs text-muted-foreground mt-2"><span>{pkr(val[0])}</span><span>{pkr(val[1])}</span></div>
        </div>
      )}
      <form className="flex items-center gap-2 mt-2" onSubmit={(e) => { e.preventDefault(); apply(inputs.min === "" ? undefined : Number(inputs.min), inputs.max === "" ? undefined : Number(inputs.max)); }}>
        <Input type="number" min={0} inputMode="numeric" placeholder={`Min ${lo}`} value={inputs.min} onChange={(e) => setInputs({ ...inputs, min: e.target.value })} className="h-8 text-xs" aria-label="Minimum price" />
        <span className="text-muted-foreground">–</span>
        <Input type="number" min={0} inputMode="numeric" placeholder={`Max ${hi}`} value={inputs.max} onChange={(e) => setInputs({ ...inputs, max: e.target.value })} className="h-8 text-xs" aria-label="Maximum price" />
        <Button type="submit" size="sm" variant="outline" className="h-8 px-2 text-xs">Go</Button>
      </form>
    </FilterGroup>
  );
}

function FilterGroup({ title, help, children }: { title: string; help?: string; children: React.ReactNode }) {
  return (
    <div className="border-b pb-4">
      <div className="text-sm font-semibold text-brand-navy mb-2">{title}</div>
      {help && <div className="text-[11px] text-muted-foreground -mt-1 mb-2">{help}</div>}
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function CheckRow({ label, count, checked, onChange }: { label: string; count: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer text-brand-navy/90 hover:text-brand-navy">
      <Checkbox checked={checked} onCheckedChange={onChange} />
      <span className="flex-1 truncate">{label}</span>
      <span className="text-xs text-muted-foreground">{count}</span>
    </label>
  );
}

function Empty({ title, text, action }: { title: string; text: string; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border p-10 text-center">
      <PackageSearch className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
      <h2 className="font-display text-lg font-semibold text-brand-navy">{title}</h2>
      <p className="text-sm text-muted-foreground mt-1 mb-4">{text}</p>
      {action}
    </div>
  );
}
