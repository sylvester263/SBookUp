import { createFileRoute, redirect } from "@tanstack/react-router";
import { ancestry, navCategoriesQuery } from "@/lib/shop";

// Old category URL → canonical /shop/<category> or /shop/<parent>/<child>.
export const Route = createFileRoute("/category/$slug")({
  beforeLoad: async ({ params, context }) => {
    // If categories can't be loaded, still render (the listing reports not-found itself)
    const cats = await context.queryClient.ensureQueryData(navCategoriesQuery).catch(() => []);
    const chain = ancestry(cats, params.slug);
    if (chain.length > 1) {
      throw redirect({ to: "/shop/$category/$subcategory", params: { category: chain[chain.length - 2].slug, subcategory: params.slug }, statusCode: 301 });
    }
    throw redirect({ to: "/shop/$category", params: { category: params.slug }, statusCode: 301 });
  },
});
