// Category column: slugs or names (any case) separated by "|", the first one is
// the primary category. Unknown values get "did you mean" suggestions.
import { distance, slugify } from "./coerce";
import type { ImportCategory } from "./types";

export type CategoryResolution = {
  ids: string[];
  unknown: { token: string; suggestions: string[] }[];
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "a|b" (a comma list also works when no "|" is used and the comma parts are all known). */
export function splitCategoryTokens(raw: string, categories: ImportCategory[]): string[] {
  const parts = raw
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
  if (parts.length === 1 && raw.includes(",")) {
    const commaParts = raw
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean);
    if (commaParts.every((t) => findCategory(t, categories))) return commaParts;
  }
  return parts;
}

/** By slug, then name, then "Parent > Child" path, then slugified name. */
export function findCategory(
  token: string,
  categories: ImportCategory[],
): ImportCategory | undefined {
  const t = norm(token);
  const path = t.split(/\s*[>/]\s*/).filter(Boolean);
  return (
    categories.find((c) => c.slug === t) ??
    categories.find((c) => norm(c.name) === t) ??
    (path.length > 1
      ? categories.find((c) => {
          if (norm(c.name) !== path[path.length - 1] && c.slug !== path[path.length - 1])
            return false;
          const parent = categories.find((p) => p.id === c.parent_id);
          return (
            parent &&
            (norm(parent.name) === path[path.length - 2] || parent.slug === path[path.length - 2])
          );
        })
      : undefined) ??
    categories.find((c) => c.slug === slugify(token))
  );
}

export function suggestCategories(token: string, categories: ImportCategory[], max = 3): string[] {
  const t = slugify(token);
  return categories
    .map((c) => ({
      slug: c.slug,
      d:
        Math.min(distance(t, c.slug), distance(norm(token), norm(c.name))) +
        (c.slug.includes(t) || t.includes(c.slug) ? -2 : 0),
    }))
    .filter((x) => x.d <= Math.max(3, Math.floor(t.length / 3)))
    .sort((a, b) => a.d - b.d)
    .slice(0, max)
    .map((x) => x.slug);
}

export function resolveCategories(raw: string, categories: ImportCategory[]): CategoryResolution {
  const out: CategoryResolution = { ids: [], unknown: [] };
  for (const token of splitCategoryTokens(raw, categories)) {
    const c = findCategory(token, categories);
    if (c) {
      if (!out.ids.includes(c.id)) out.ids.push(c.id);
    } else out.unknown.push({ token, suggestions: suggestCategories(token, categories) });
  }
  return out;
}

/** Full path for display: "Gifts > Gift Bags". */
export function categoryPath(id: string, categories: ImportCategory[]): string {
  const names: string[] = [];
  const seen = new Set<string>();
  let cur = categories.find((c) => c.id === id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    names.unshift(cur.name);
    cur = cur.parent_id ? categories.find((c) => c.id === cur!.parent_id) : undefined;
  }
  return names.join(" > ");
}
