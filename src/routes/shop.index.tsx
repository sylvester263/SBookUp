import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { SiteShell } from "@/components/layout/site-chrome";
import { ShopListing } from "@/components/shop/ShopListing";
import { parseShopSearch, type ShopSearch } from "@/lib/shop";
import { listingHead } from "@/lib/seo";

// All products: Category (top-level), Price and Sort only.
export const Route = createFileRoute("/shop/")({
  validateSearch: (s: Record<string, unknown>): ShopSearch => parseShopSearch(s),
  head: ({ match }) => listingHead([], match.search as ShopSearch),
  component: ShopPage,
});

function ShopPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/shop/" });
  const update = useCallback(
    (patch: Partial<ShopSearch>, replace = false) => navigate({ search: (prev: ShopSearch) => ({ ...prev, ...patch }), replace }),
    [navigate],
  );
  return (
    <SiteShell>
      <ShopListing search={search} update={update} />
    </SiteShell>
  );
}
