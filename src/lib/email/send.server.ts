// Email sending (server only).
// Provider: Resend (https://resend.com) when RESEND_API_KEY is set.
// Without a key, emails are logged to the server console instead of sent,
// so missing configuration never breaks checkout or admin actions.
// Sending never throws: callers get { ok: false, error } and carry on.
import process from "node:process";

export type EmailMessage = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  headers?: Record<string, string>;
};

export type SendResult = { ok: boolean; logged?: boolean; error?: string; id?: string };

function config() {
  return {
    apiKey: process.env.RESEND_API_KEY,
    from: process.env.EMAIL_FROM, // e.g. "SchoolBooksExperts <orders@yourdomain.com>"
  };
}

export function emailConfigured() {
  const c = config();
  return !!(c.apiKey && c.from);
}

function toList(to: string | string[]) {
  return (Array.isArray(to) ? to : [to]).map((t) => t.trim()).filter(Boolean);
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const to = toList(msg.to);
  if (!to.length) return { ok: false, error: "No recipient" };
  const { apiKey, from } = config();
  if (!apiKey || !from) {
    console.info(`[email:log-only] to=${to.join(",")} subject=${JSON.stringify(msg.subject)} (set RESEND_API_KEY and EMAIL_FROM to send)`);
    return { ok: true, logged: true };
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        subject: msg.subject,
        html: msg.html,
        text: msg.text,
        reply_to: msg.replyTo,
        headers: msg.headers,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      console.error(`[email] Resend error ${res.status}: ${body}`);
      return { ok: false, error: `Email provider error ${res.status}` };
    }
    const data = (await res.json().catch(() => ({}))) as { id?: string };
    return { ok: true, id: data.id };
  } catch (e) {
    console.error("[email] send failed", e);
    return { ok: false, error: e instanceof Error ? e.message : "Email send failed" };
  }
}

/** Sends many individual emails (e.g. a newsletter) in batches of 100. */
export async function sendEmailBatch(msgs: EmailMessage[]): Promise<{ sent: number; failed: number; logged: boolean }> {
  const { apiKey, from } = config();
  if (!apiKey || !from) {
    msgs.forEach((m) => console.info(`[email:log-only] to=${toList(m.to).join(",")} subject=${JSON.stringify(m.subject)}`));
    return { sent: msgs.length, failed: 0, logged: true };
  }
  let sent = 0;
  let failed = 0;
  for (let i = 0; i < msgs.length; i += 100) {
    const chunk = msgs.slice(i, i + 100);
    try {
      const res = await fetch("https://api.resend.com/emails/batch", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          chunk.map((m) => ({ from, to: toList(m.to), subject: m.subject, html: m.html, text: m.text, reply_to: m.replyTo, headers: m.headers })),
        ),
      });
      if (res.ok) sent += chunk.length;
      else {
        failed += chunk.length;
        console.error(`[email] batch error ${res.status}: ${await res.text()}`);
      }
    } catch (e) {
      failed += chunk.length;
      console.error("[email] batch failed", e);
    }
  }
  return { sent, failed, logged: false };
}
