// Pure category-tree path helpers, shared by the storefront (shop.ts), the sitemap
// and the SEO helpers. No Supabase imports, so server routes can use them.

export type TreeCategory = { id: string; slug: string; parent_id: string | null };

/** Chain from the top-level category down to this one. */
export function ancestry<C extends TreeCategory>(cats: C[], slug: string): C[] {
  const bySlug = new Map(cats.map((c) => [c.slug, c]));
  const byId = new Map(cats.map((c) => [c.id, c]));
  const out: C[] = [];
  let cur = bySlug.get(slug);
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return out;
}

/** Canonical listing URL: /shop/<top-level> or /shop/<parent>/<child>. */
export function categoryHref(cats: TreeCategory[], slug: string): string {
  const chain = ancestry(cats, slug);
  if (!chain.length) return `/shop/${slug}`;
  if (chain.length === 1) return `/shop/${chain[0].slug}`;
  return `/shop/${chain[chain.length - 2].slug}/${chain[chain.length - 1].slug}`;
}

/**
 * True when every category up to the top is in the list (e.g. the list of active
 * categories). A category under a hidden parent has no working page.
 */
export function isReachable(cats: TreeCategory[], slug: string): boolean {
  const chain = ancestry(cats, slug);
  return chain.length > 0 && chain[0].parent_id === null;
}
