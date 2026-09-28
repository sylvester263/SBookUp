// Simple branded HTML email templates (server only).
// Store name / logo / contact details come from store_settings.
import process from "node:process";

export type StoreBrand = {
  store_name: string;
  logo_url?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  address?: string | null;
};

export function siteUrl() {
  return (process.env.SITE_URL || "").replace(/\/+$/, "");
}

export function esc(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text (e.g. typed by staff) -> safe HTML paragraphs. */
export function textToHtml(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export const pkr = (n: number | string) => `PKR ${Math.round(Number(n) || 0).toLocaleString("en-PK")}`;

export function layout(brand: StoreBrand, title: string, bodyHtml: string, footerExtra = "") {
  const logo = brand.logo_url
    ? `<img src="${esc(brand.logo_url)}" alt="${esc(brand.store_name)}" style="max-height:48px;max-width:200px">`
    : `<span style="font-size:20px;font-weight:700;color:#1A6B6B">${esc(brand.store_name)}</span>`;
  const contact = [brand.contact_phone, brand.contact_email, brand.address].filter(Boolean).map(esc).join(" · ");
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#1a1a2e">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:10px;overflow:hidden">
<tr><td style="padding:20px 24px;border-bottom:3px solid #1A6B6B">${logo}</td></tr>
<tr><td style="padding:24px;font-size:15px;line-height:1.55">
<h1 style="font-size:20px;margin:0 0 16px;color:#1A1A2E">${esc(title)}</h1>
${bodyHtml}
</td></tr>
<tr><td style="padding:16px 24px;background:#fafafa;font-size:12px;color:#6b7280">${contact}${footerExtra ? `<div style="margin-top:8px">${footerExtra}</div>` : ""}</td></tr>
</table></td></tr></table></body></html>`;
}

export type OrderForEmail = {
  order_number: string;
  status: string;
  payment_method: string;
  payment_status: string;
  subtotal: number;
  discount_amount: number;
  shipping_cost: number;
  tax_amount: number;
  total: number;
  tracking_number?: string | null;
  coupon_code?: string | null;
  shipping_address: { name?: string; phone?: string; street?: string; city?: string; province?: string } | null;
  items: { name_snapshot: string; quantity: number; subtotal: number }[];
};

export function orderTable(o: OrderForEmail) {
  const rows = o.items
    .map((i) => `<tr><td style="padding:6px 0">${esc(i.name_snapshot)} × ${i.quantity}</td><td style="padding:6px 0;text-align:right">${pkr(i.subtotal)}</td></tr>`)
    .join("");
  const line = (label: string, value: string, bold = false) =>
    `<tr><td style="padding:4px 0;${bold ? "font-weight:700" : "color:#6b7280"}">${label}</td><td style="padding:4px 0;text-align:right;${bold ? "font-weight:700" : ""}">${value}</td></tr>`;
  return `<table role="presentation" width="100%" style="border-collapse:collapse;font-size:14px;margin:12px 0">
${rows}
<tr><td colspan="2" style="border-top:1px solid #e5e7eb;padding-top:6px"></td></tr>
${line("Subtotal", pkr(o.subtotal))}
${Number(o.discount_amount) > 0 ? line(`Discount${o.coupon_code ? ` (${esc(o.coupon_code)})` : ""}`, "-" + pkr(o.discount_amount)) : ""}
${line("Delivery & handling", pkr(o.shipping_cost))}
${Number(o.tax_amount) > 0 ? line("Tax", pkr(o.tax_amount)) : ""}
${line("Total", pkr(o.total), true)}
</table>`;
}

export function addressBlock(o: OrderForEmail) {
  const a = o.shipping_address ?? {};
  return `<p style="margin:0 0 14px;font-size:14px"><strong>Deliver to:</strong><br>${esc(a.name)} · ${esc(a.phone)}<br>${esc(a.street)}, ${esc(a.city)}${a.province ? ", " + esc(a.province) : ""}</p>`;
}

const PAYMENT_LABEL: Record<string, string> = {
  cod: "Cash on Delivery",
  bank_transfer: "Bank Transfer",
  jazzcash: "JazzCash",
  easypaisa: "EasyPaisa",
};
export const paymentLabel = (m: string) => PAYMENT_LABEL[m] ?? m;

export function button(href: string, label: string) {
  return `<p style="margin:18px 0"><a href="${esc(href)}" style="background:#1A6B6B;color:#fff;text-decoration:none;padding:10px 18px;border-radius:6px;display:inline-block">${esc(label)}</a></p>`;
}
