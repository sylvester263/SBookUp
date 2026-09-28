import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

// Return / callback URL for online payment gateways:
//   /api/payments/jazzcash/callback   /api/payments/easypaisa/callback
// The order is marked paid ONLY when: the gateway signature verifies, the
// gateway reports success, the order exists, it was placed with this gateway,
// and the paid amount equals the order total saved by place_order().
export const Route = createFileRoute("/api/payments/$provider/callback")({
  server: {
    handlers: {
      POST: async ({ request, params }) => handle(request, params.provider),
      GET: async ({ request, params }) => handle(request, params.provider),
    },
  },
});

async function readParams(request: Request): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  new URL(request.url).searchParams.forEach((v, k) => (out[k] = v));
  if (request.method === "POST") {
    const ct = request.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
      Object.entries(body).forEach(([k, v]) => (out[k] = String(v ?? "")));
    } else {
      const form = await request.formData().catch(() => null);
      form?.forEach((v, k) => (out[k] = String(v)));
    }
  }
  return out;
}

const handle = createServerOnlyFn(async (request: Request, providerId: string) => {
  const { getPaymentProvider } = await import("@/lib/payments/index.server");
  const provider = getPaymentProvider(providerId);
  if (!provider) return new Response("Unknown payment provider", { status: 404 });
  if (!provider.isConfigured()) return new Response("Payment provider not configured", { status: 503 });

  const params = await readParams(request);
  const result = await provider.verifyCallback(params);
  const back = (orderNumber: string | null, status: "ok" | "failed") =>
    orderNumber
      ? Response.redirect(new URL(`/checkout/success/${encodeURIComponent(orderNumber)}?payment=${status}`, request.url), 303)
      : new Response(status === "ok" ? "OK" : "Payment not confirmed", { status: status === "ok" ? 200 : 400 });

  if (!result.valid || !result.orderNumber) {
    console.warn(`[payments:${providerId}] rejected callback: ${result.message ?? "invalid"}`);
    return back(result.orderNumber, "failed");
  }

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: order } = await supabaseAdmin
    .from("orders")
    .select("id, total, payment_method, payment_status")
    .eq("order_number", result.orderNumber)
    .maybeSingle();
  if (!order || order.payment_method !== providerId) return back(result.orderNumber, "failed");
  if (!result.paid) {
    await supabaseAdmin.from("orders").update({ payment_status: "failed" }).eq("id", order.id).neq("payment_status", "paid");
    return back(result.orderNumber, "failed");
  }
  if (result.amount == null || Math.abs(Number(order.total) - result.amount) > 0.009) {
    console.error(`[payments:${providerId}] amount mismatch for ${result.orderNumber}: paid ${result.amount}, order ${order.total}`);
    return back(result.orderNumber, "failed");
  }
  if (order.payment_status !== "paid") {
    await supabaseAdmin
      .from("orders")
      .update({ payment_status: "paid", payment_reference: result.reference })
      .eq("id", order.id);
    await supabaseAdmin.from("activity_logs").insert({
      action: "payment_confirmed", entity_type: "order", entity_id: order.id,
      new_value: { provider: providerId, reference: result.reference, amount: result.amount },
    });
  }
  return back(result.orderNumber, "ok");
});
