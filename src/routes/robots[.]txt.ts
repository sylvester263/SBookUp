import { createFileRoute } from "@tanstack/react-router";
import { buildRobotsTxt, resolveBaseUrl } from "@/lib/sitemap";

// Served dynamically (replaces public/robots.txt) so the Sitemap line can use SITE_URL.
export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async ({ request }) =>
        new Response(buildRobotsTxt(resolveBaseUrl(process.env.SITE_URL, request.url)), {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" },
        }),
    },
  },
});
