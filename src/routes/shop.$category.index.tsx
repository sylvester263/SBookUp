import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { SiteShell } from "@/components/layout/site-chrome";
import { ShopListing } from "@/components/shop/ShopListing";
import { ancestry, navCategoriesQuery, parseShopSearch, type ShopSearch } from "@/lib/shop";
import { listingHead } from "@/lib/seo";

export const Route = createFileRoute("/shop/$category/")({
  validateSearch: (s: Record<string, unknown>): ShopSearch => parseShopSearch(s),
  loader: async ({ params, context, location }) => {
    // If categories can't be loaded, still render (the listing reports not-found itself)
    const cats = await context.queryClient.ensureQueryData(navCategoriesQuery).catch(() => []);
    const chain = ancestry(cats, params.category);
    // A sub-category is served from /shop/<parent>/<child> (canonical URL)
    if (chain.length > 1) {
      throw redirect({
        to: "/shop/$category/$subcategory",
        params: { category: chain[chain.length - 2].slug, subcategory: params.category },
        search: location.search as ShopSearch,
        statusCode: 301,
      });
    }
    return { category: chain[0] ?? null, chain };
  },
  head: ({ loaderData, match }) => listingHead(loaderData?.chain ?? [], match.search as ShopSearch),
  component: CategoryPage,
});

function CategoryPage() {
  const { category } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop/$category/" });
  const update = useCallback(
    (patch: Partial<ShopSearch>, replace = false) => navigate({ search: (prev: ShopSearch) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  return (
    <SiteShell>
      <ShopListing categorySlug={category} search={search} update={update} />
    </SiteShell>
  );
}
