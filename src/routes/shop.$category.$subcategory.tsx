import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { SiteShell } from "@/components/layout/site-chrome";
import { ShopListing } from "@/components/shop/ShopListing";
import { ancestry, navCategoriesQuery, parseShopSearch, type ShopSearch } from "@/lib/shop";
import { listingHead } from "@/lib/seo";

export const Route = createFileRoute("/shop/$category/$subcategory")({
  validateSearch: (s: Record<string, unknown>): ShopSearch => parseShopSearch(s),
  loader: async ({ params, context, location }) => {
    // If categories can't be loaded, still render (the listing reports not-found itself)
    const cats = await context.queryClient.ensureQueryData(navCategoriesQuery).catch(() => []);
    const chain = ancestry(cats, params.subcategory);
    const parent = chain[chain.length - 2];
    // Wrong / outdated parent in the URL → redirect to the real one
    if (chain.length > 1 && parent.slug !== params.category) {
      throw redirect({ to: "/shop/$category/$subcategory", params: { category: parent.slug, subcategory: params.subcategory }, search: location.search as ShopSearch, statusCode: 301 });
    }
    if (chain.length === 1) {
      throw redirect({ to: "/shop/$category", params: { category: params.subcategory }, search: location.search as ShopSearch, statusCode: 301 });
    }
    return { category: chain[chain.length - 1] ?? null, chain };
  },
  head: ({ loaderData, match }) => listingHead(loaderData?.chain ?? [], match.search as ShopSearch),
  component: SubcategoryPage,
});

function SubcategoryPage() {
  const { subcategory } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop/$category/$subcategory" });
  const update = useCallback(
    (patch: Partial<ShopSearch>, replace = false) => navigate({ search: (prev: ShopSearch) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  return (
    <SiteShell>
      <ShopListing categorySlug={subcategory} search={search} update={update} />
    </SiteShell>
  );
}
