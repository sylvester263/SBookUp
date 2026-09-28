import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

// Recomputes products.sales_count (units sold in the last 90 days, revenue orders
// only). Order status changes already update the affected products; this daily
// run moves the 90-day window. Call with: Authorization: Bearer <CRON_SECRET>
export const Route = createFileRoute("/api/cron/sales-counts")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

const handle = createServerOnlyFn(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("refresh_product_sales_counts", {});
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({ updated: data });
});
