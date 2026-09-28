import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { Search, BookOpen, Layers, FolderTree, User, Clock, TrendingUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { searchSuggestions } from "@/lib/site.functions";
import { useQuery } from "@tanstack/react-query";
import { navCategoriesQuery, childrenOf } from "@/lib/shop";

type Suggestion =
  | { kind: "product"; label: string; slug: string; image?: string | null }
  | { kind: "bundle"; label: string; slug: string }
  | { kind: "category"; label: string; slug: string }
  | { kind: "author"; label: string }
  | { kind: "publisher"; label: string };

const RECENT_KEY = "js_recent_searches";

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]"); } catch { return []; }
}
function pushRecent(q: string) {
  const cur = readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase());
  const next = [q, ...cur].slice(0, 8);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

export function SearchAutocomplete({ compact = false }: { compact?: boolean }) {
  const navigate = useNavigate();
  const sugFn = useServerFn(searchSuggestions);
  // "Popular" = the store's main categories (data-driven, no hard-coded terms)
  const { data: navCats } = useQuery(navCategoriesQuery);
  const POPULAR = childrenOf(navCats ?? [], null).filter((c) => c.show_in_nav).map((c) => c.name).slice(0, 6);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [debounced, setDebounced] = useState("");
  const [data, setData] = useState<{
    isbn: boolean;
    products: any[]; bundles: any[]; categories: any[]; authors: string[]; publishers?: string[];
  } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced) { setData(null); return; }
    let cancelled = false;
    sugFn({ data: { q: debounced } }).then((r) => { if (!cancelled) setData(r); }).catch(() => {});
    return () => { cancelled = true; };
  }, [debounced, sugFn]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const suggestions: Suggestion[] = useMemo(() => {
    if (!data) return [];
    return [
      ...data.products.map((p) => ({ kind: "product" as const, label: p.name, slug: p.slug, image: p.images?.[0] })),
      ...data.bundles.map((b) => ({ kind: "bundle" as const, label: b.name, slug: b.slug })),
      ...data.categories.map((c) => ({ kind: "category" as const, label: c.name, slug: c.slug })),
      ...data.authors.map((a) => ({ kind: "author" as const, label: a })),
      ...(data.publishers ?? []).map((a) => ({ kind: "publisher" as const, label: a })),
    ].slice(0, 8);
  }, [data]);

  function go(s: Suggestion) {
    setOpen(false);
    pushRecent(s.label);
    if (s.kind === "product") navigate({ to: "/product/$slug", params: { slug: s.slug } });
    else if (s.kind === "bundle") navigate({ to: "/bundle/$slug", params: { slug: s.slug } });
    else if (s.kind === "category") navigate({ to: "/shop/$category", params: { category: s.slug } }) /* sub-categories redirect to /shop/<parent>/<child> */;
    else navigate({ to: "/shop", search: { q: s.label } });
  }

  function submit(text: string) {
    const t = text.trim();
    if (!t) return;
    pushRecent(t);
    setOpen(false);
    navigate({ to: "/shop", search: { q: t } });
  }

  function onKey(e: React.KeyboardEvent) {
    if (!open) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(suggestions.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(-1, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (active >= 0 && suggestions[active]) go(suggestions[active]);
      else submit(q);
    } else if (e.key === "Escape") setOpen(false);
  }

  const recent = readRecent();
  const showEmpty = open && !q.trim();

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="relative">
        <Input
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); setActive(-1); }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKey}
          placeholder={compact ? "Search by ISBN, title, author..." : "Search books by ISBN, title, author, class..."}
          className={`pr-12 ${compact ? "h-10" : "h-11"} rounded-full border-brand-teal/30 focus-visible:ring-brand-teal`}
          aria-label="Search"
          autoComplete="off"
        />
        <button
          type="button"
          onClick={() => submit(q)}
          aria-label="Search"
          className={`absolute right-1 ${compact ? "top-1 h-8 w-8" : "top-1 h-9 w-9"} rounded-full bg-brand-teal text-white flex items-center justify-center hover:bg-brand-teal-dark transition`}
        >
          <Search className="h-4 w-4" />
        </button>
      </div>

      {open && (suggestions.length > 0 || showEmpty) && (
        <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-border rounded-xl shadow-xl overflow-hidden z-50 max-h-[420px] overflow-y-auto">
          {data?.isbn && (
            <div className="px-3 py-2 text-xs bg-brand-teal/10 text-brand-teal font-medium">
              ISBN match
            </div>
          )}

          {suggestions.map((s, i) => {
            const Icon = s.kind === "product" ? BookOpen : s.kind === "bundle" ? Layers : s.kind === "category" ? FolderTree : User;
            return (
              <button
                key={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(s)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted ${active === i ? "bg-muted" : ""}`}
              >
                {s.kind === "product" && (s as any).image
                  ? <img src={(s as any).image} alt="" className="h-8 w-8 rounded object-cover" loading="lazy" />
                  : <span className="h-8 w-8 rounded-full bg-brand-cream flex items-center justify-center"><Icon className="h-4 w-4 text-brand-teal" /></span>}
                <span className="flex-1 truncate">{s.label}</span>
                <span className="text-[10px] uppercase text-muted-foreground tracking-wide">{s.kind}</span>
              </button>
            );
          })}

          {showEmpty && (
            <div className="p-3 space-y-3">
              {recent.length > 0 && (
                <div>
                  <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5"><Clock className="h-3 w-3" /> Recent</div>
                  <div className="flex flex-wrap gap-1.5">
                    {recent.map((r) => (
                      <button key={r} onClick={() => submit(r)} className="text-xs px-2 py-1 bg-muted hover:bg-brand-teal hover:text-white rounded-full inline-flex items-center gap-1">
                        {r}
                        <X
                          className="h-3 w-3 opacity-50 hover:opacity-100"
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = readRecent().filter((x) => x !== r);
                            localStorage.setItem(RECENT_KEY, JSON.stringify(next));
                            setOpen(false); setTimeout(() => setOpen(true), 0);
                          }}
                        />
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <div className="text-xs font-semibold text-muted-foreground flex items-center gap-1 mb-1.5"><TrendingUp className="h-3 w-3" /> Popular</div>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR.map((r) => (
                    <button key={r} onClick={() => submit(r)} className="text-xs px-2 py-1 bg-brand-cream hover:bg-brand-teal hover:text-white rounded-full">
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
