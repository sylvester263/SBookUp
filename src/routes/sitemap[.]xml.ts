import { createFileRoute } from "@tanstack/react-router";
import { getSitemapEntries } from "@/lib/site.functions";
import { buildSitemapXml, resolveBaseUrl } from "@/lib/sitemap";

// Absolute URLs from SITE_URL (falls back to the request origin).
export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const data = await getSitemapEntries();
        const xml = buildSitemapXml(resolveBaseUrl(process.env.SITE_URL, request.url), data);
        return new Response(xml, { headers: { "Content-Type": "application/xml", "Cache-Control": "public, max-age=3600" } });
      },
    },
  },
});
