import { createFileRoute } from "@tanstack/react-router";
import { createServerOnlyFn } from "@tanstack/react-start";

// Sends due reminders (trigger_date <= now, not yet sent) and marks them sent.
// Call it on a schedule (e.g. every 15 minutes) with:
//   Authorization: Bearer <CRON_SECRET>
// See FIXES_PROGRESS.md (Task 3.2) for the pg_cron / external-cron setup.
export const Route = createFileRoute("/api/cron/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => handle(request),
      GET: async ({ request }) => handle(request),
    },
  },
});

const handle = createServerOnlyFn(async (request: Request) => {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") ?? "";
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { sendReminderEmail } = await import("@/lib/email/notify.server");

  const { data: due, error } = await supabaseAdmin
    .from("reminders")
    .select("id, user_id, reminder_type, message")
    .is("sent_at", null)
    .lte("trigger_date", new Date().toISOString())
    .order("trigger_date")
    .limit(200);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  const userIds = Array.from(new Set((due ?? []).map((r) => r.user_id)));
  const emails = new Map<string, { email: string | null; prefs: Record<string, boolean> | null }>();
  if (userIds.length) {
    const { data: profs } = await supabaseAdmin.from("profiles").select("id, email, notification_prefs").in("id", userIds);
    (profs ?? []).forEach((p) => emails.set(p.id, { email: p.email, prefs: p.notification_prefs as Record<string, boolean> | null }));
  }

  let sent = 0, skipped = 0, failed = 0;
  for (const r of due ?? []) {
    const p = emails.get(r.user_id);
    // Respect the customer's "school reminders" preference.
    if (!p?.email || p.prefs?.school_reminders === false) {
      skipped++;
      await supabaseAdmin.from("reminders").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
      continue;
    }
    const res = await sendReminderEmail(p.email, r.message ?? "", r.reminder_type);
    if (res.ok) {
      sent++;
      await supabaseAdmin.from("reminders").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
    } else {
      failed++; // left unsent, retried on the next run
    }
  }
  return Response.json({ due: due?.length ?? 0, sent, skipped, failed });
});
