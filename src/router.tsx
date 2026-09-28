import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { setupRouterSsrQueryIntegration } from "@tanstack/react-router-ssr-query";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  // Queries loaded on the server (route loaders: settings, categories, the
  // homepage sections and first product rows) are sent with the page, so the
  // browser doesn't fetch them again and the server HTML matches what React renders.
  // The root route already provides the QueryClient.
  setupRouterSsrQueryIntegration({ router, queryClient, wrapQueryClient: false });

  return router;
};
