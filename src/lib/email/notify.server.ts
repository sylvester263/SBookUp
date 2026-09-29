// High-level store notifications (server only). All functions are best-effort:
// they log problems and never throw, so an email failure can't break an order.
import process from "node:process";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendEmail, sendEmailBatch, type EmailMessage } from "./send.server";
import {
  layout, orderTable, addressBlock, paymentLabel, button, esc, textToHtml, siteUrl, pkr,
  type OrderForEmail, type StoreBrand,
} from "./templates.server";

type Brand = StoreBrand & {
  /** New-order alerts */
  store_email: string | null;
  /** Contact-form messages */
  contact_form_email: string | null;
  /** Reply-to on customer emails */
  reply_to: string | undefined;
  bank: Record<string, string | null>;
};

async function brand(): Promise<Brand> {
  const [{ data }, { data: priv }] = await Promise.all([
    supabaseAdmin.from("store_settings").select("*").eq("id", true).maybeSingle(),
    // Admin-only recipients (admin → Settings → Notifications). Missing before
    // the rebrand migration is applied; then the fallbacks below are used.
    supabaseAdmin
      .from("store_private_settings")
      .select("order_notification_email, contact_form_email, reply_to_email")
      .eq("id", true)
      .maybeSingle(),
  ]);
  const s = (data ?? {}) as Record<string, any>;
  const p = (priv ?? {}) as Record<string, string | null>;
  return {
    store_name: s.store_name || "SchoolBooksExperts",
    logo_url: s.logo_url,
    contact_email: s.contact_email,
    contact_phone: s.contact_phone,
    address: s.address,
    // Setting first, then the STORE_ALERT_EMAIL env var, then the contact email.
    store_email: p.order_notification_email || process.env.STORE_ALERT_EMAIL || s.contact_email || null,
    contact_form_email: p.contact_form_email || s.contact_email || null,
    reply_to: p.reply_to_email || s.contact_email || undefined,
    bank: {
      bank_name: s.bank_name, bank_account_title: s.bank_account_title,
      bank_account_number: s.bank_account_number, bank_iban: s.bank_iban, bank_instructions: s.bank_instructions,
    },
  };
}

async function loadOrder(orderId: string) {
  const { data: o } = await supabaseAdmin
    .from("orders")
    .select("id, order_number, user_id, guest_email, status, payment_method, payment_status, subtotal, discount_amount, shipping_cost, tax_amount, total, tracking_number, coupon_code, shipping_address, order_items(name_snapshot, quantity, subtotal)")
    .eq("id", orderId)
    .maybeSingle();
  if (!o) return null;
  let email: string | null = o.guest_email;
  let prefs: Record<string, boolean> | null = null;
  if (o.user_id) {
    const { data: p } = await supabaseAdmin.from("profiles").select("email, notification_prefs").eq("id", o.user_id).maybeSingle();
    email = p?.email ?? email;
    prefs = (p?.notification_prefs as Record<string, boolean> | null) ?? null;
  }
  const order: OrderForEmail = {
    ...(o as any),
    items: (o as any).order_items ?? [],
  };
  return { order, email, prefs };
}

function bankDetailsHtml(bank: Record<string, string | null>, orderNumber: string) {
  if (!bank.bank_account_number && !bank.bank_iban) return "";
  const row = (k: string, v: string | null) => (v ? `${k}: <strong>${esc(v)}</strong><br>` : "");
  return `<div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:12px 14px;margin:12px 0;font-size:14px">
<strong>Bank transfer details</strong><br>
${row("Bank", bank.bank_name)}${row("Account title", bank.bank_account_title)}${row("Account number", bank.bank_account_number)}${row("IBAN", bank.bank_iban)}
Reference: <strong>${esc(orderNumber)}</strong>
${bank.bank_instructions ? `<div style="margin-top:6px">${textToHtml(bank.bank_instructions)}</div>` : ""}
</div>`;
}

/** Order confirmation to the customer + new-order alert to the store. */
export async function notifyOrderPlaced(orderId: string) {
  try {
    const [b, loaded] = await Promise.all([brand(), loadOrder(orderId)]);
    if (!loaded) return;
    const { order, email } = loaded;
    const url = siteUrl();
    const jobs: Promise<unknown>[] = [];
    if (email) {
      const isBank = order.payment_method === "bank_transfer";
      const body = `<p>Thank you for your order! We've received it and will confirm it shortly.</p>
<p style="font-size:14px">Order <strong>${esc(order.order_number)}</strong> · Payment: ${esc(paymentLabel(order.payment_method))}</p>
${orderTable(order)}${addressBlock(order)}
${isBank ? bankDetailsHtml(b.bank, order.order_number) + (url ? `<p style="font-size:14px">After paying, upload your payment screenshot here:</p>${button(`${url}/checkout/success/${encodeURIComponent(order.order_number)}`, "Upload payment proof")}` : "") : ""}
${url ? button(`${url}/account/orders`, "View my orders") : ""}`;
      jobs.push(sendEmail({ to: email, subject: `Order ${order.order_number} received — ${b.store_name}`, html: layout(b, "Order received", body), replyTo: b.reply_to }));
    }
    if (b.store_email) {
      const body = `<p>A new order was placed.</p>
<p style="font-size:14px">Order <strong>${esc(order.order_number)}</strong> · ${esc(paymentLabel(order.payment_method))} · ${pkr(order.total)}<br>Customer email: ${esc(email ?? "—")}</p>
${orderTable(order)}${addressBlock(order)}${url ? button(`${url}/admin/orders`, "Open in admin") : ""}`;
      jobs.push(sendEmail({ to: b.store_email, subject: `New order ${order.order_number} — ${pkr(order.total)}`, html: layout(b, "New order", body) }));
    }
    await Promise.all(jobs);
  } catch (e) {
    console.error("[notify] order placed failed", e);
  }
}

const STATUS_COPY: Record<string, { title: string; text: string }> = {
  confirmed: { title: "Your order is confirmed", text: "Good news — we've confirmed your order and are getting it ready." },
  shipped: { title: "Your order is on its way", text: "Your order has been handed to the courier." },
  delivered: { title: "Your order was delivered", text: "Your order has been delivered. We hope you enjoy it!" },
  cancelled: { title: "Your order was cancelled", text: "Your order has been cancelled. If you paid already, we'll contact you about the refund." },
};

/** Status update to the customer (respects the "order updates" preference). */
export async function notifyOrderStatus(orderId: string, status: string) {
  const copy = STATUS_COPY[status];
  if (!copy) return;
  try {
    const [b, loaded] = await Promise.all([brand(), loadOrder(orderId)]);
    if (!loaded?.email) return;
    if (loaded.prefs && loaded.prefs.order_updates === false && status !== "cancelled") return;
    const { order } = loaded;
    const url = siteUrl();
    const tracking = status === "shipped" && order.tracking_number
      ? `<p style="font-size:14px">Tracking number: <strong>${esc(order.tracking_number)}</strong></p>` : "";
    const body = `<p>${copy.text}</p><p style="font-size:14px">Order <strong>${esc(order.order_number)}</strong></p>${tracking}
${orderTable(order)}${url ? button(`${url}/track`, "Track your order") : ""}`;
    await sendEmail({ to: loaded.email, subject: `${copy.title} — ${order.order_number}`, html: layout(b, copy.title, body), replyTo: b.reply_to });
  } catch (e) {
    console.error("[notify] status failed", e);
  }
}

/** Contact-form message forwarded to the store (reply-to = the customer). */
export async function notifyContactReceived(msg: { name: string; email: string; phone: string | null; subject: string | null; message: string }) {
  try {
    const b = await brand();
    if (!b.contact_form_email) return;
    const url = siteUrl();
    const body = `<p>New message from the contact form.</p>
<p style="font-size:14px">From: <strong>${esc(msg.name)}</strong> &lt;${esc(msg.email)}&gt;${msg.phone ? `<br>Phone: ${esc(msg.phone)}` : ""}${msg.subject ? `<br>Subject: ${esc(msg.subject)}` : ""}</p>
${textToHtml(msg.message)}${url ? button(`${url}/admin/messages`, "Open in admin") : ""}`;
    await sendEmail({
      to: b.contact_form_email,
      subject: `Contact form: ${msg.subject || msg.name}`,
      html: layout(b, "New contact message", body),
      text: msg.message,
      replyTo: msg.email,
    });
  } catch (e) {
    console.error("[notify] contact message alert failed", e);
  }
}

export async function notifyContactAutoReply(to: string, name: string, subject: string | null) {
  try {
    const b = await brand();
    const body = `<p>Hi ${esc(name)},</p><p>Thanks for contacting ${esc(b.store_name)}. We've received your message${subject ? ` about “${esc(subject)}”` : ""} and will reply as soon as possible, usually within one working day.</p>`;
    await sendEmail({ to, subject: `We received your message — ${b.store_name}`, html: layout(b, "Thanks for your message", body), replyTo: b.reply_to });
  } catch (e) {
    console.error("[notify] contact auto-reply failed", e);
  }
}

/** Staff reply to a contact-form message. Returns the send result so the UI can show errors. */
export async function sendContactReply(to: string, name: string, originalSubject: string | null, replyText: string) {
  const b = await brand();
  const body = `<p>Hi ${esc(name)},</p>${textToHtml(replyText)}`;
  return sendEmail({
    to,
    subject: originalSubject ? `Re: ${originalSubject}` : `Reply from ${b.store_name}`,
    html: layout(b, `Reply from ${b.store_name}`, body),
    text: replyText,
    replyTo: b.reply_to,
  });
}

export async function sendReminderEmail(to: string, message: string, type: string) {
  const b = await brand();
  const url = siteUrl();
  const title = type ? type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "Reminder";
  const body = `${textToHtml(message || "A friendly reminder from us.")}${url ? button(url, `Shop at ${b.store_name}`) : ""}`;
  return sendEmail({ to, subject: `${title} — ${b.store_name}`, html: layout(b, title, body), replyTo: b.reply_to });
}

/** Newsletter campaign to active subscribers, each with their own unsubscribe link. */
export async function sendNewsletterCampaign(subject: string, text: string, recipients: { email: string; name: string | null; unsubscribe_token: string }[]) {
  const b = await brand();
  const url = siteUrl();
  const msgs: EmailMessage[] = recipients.map((r) => {
    const unsub = url ? `${url}/newsletter/unsubscribe?token=${encodeURIComponent(r.unsubscribe_token)}` : "";
    const footer = unsub ? `You're receiving this because you subscribed to ${esc(b.store_name)}. <a href="${esc(unsub)}">Unsubscribe</a>` : "";
    return {
      to: r.email,
      subject,
      html: layout(b, subject, textToHtml(text), footer),
      text: unsub ? `${text}\n\nUnsubscribe: ${unsub}` : text,
      replyTo: b.reply_to,
      headers: unsub ? { "List-Unsubscribe": `<${unsub}>` } : undefined,
    };
  });
  return sendEmailBatch(msgs);
}
