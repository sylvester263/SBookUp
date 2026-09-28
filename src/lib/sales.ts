// Shared rules for dashboard / reports figures (unit-tested in sales.test.ts).

/**
 * Which orders count as revenue. DEFAULT — please confirm (see FIXES_PROGRESS.md 4.2):
 *  - never: cancelled, refunded
 *  - yes:   confirmed / processing / shipped / delivered (COD orders are paid on delivery)
 *  - yes:   any order marked paid (e.g. a verified bank transfer still "pending")
 *  - no:    orders still "pending" and unpaid (not yet confirmed by staff)
 */
export const REVENUE_ORDER_STATUSES = ["confirmed", "processing", "shipped", "delivered"] as const;
const NEVER = new Set(["cancelled", "refunded"]);

export function isRevenueOrder(o: { status: string; payment_status?: string | null }) {
  if (NEVER.has(o.status)) return false;
  return (REVENUE_ORDER_STATUSES as readonly string[]).includes(o.status) || o.payment_status === "paid";
}

// Pakistan Standard Time is UTC+5 all year (no daylight saving).
const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/** "YYYY-MM-DD" of the given instant, in Pakistan time. */
export function pktDayKey(d: Date | string) {
  const t = typeof d === "string" ? new Date(d) : d;
  return new Date(t.getTime() + PKT_OFFSET_MS).toISOString().slice(0, 10);
}

/** "YYYY-MM" of the given instant, in Pakistan time. */
export function pktMonthKey(d: Date | string) {
  return pktDayKey(d).slice(0, 7);
}

/** The UTC instant of midnight Pakistan time, `daysAgo` days before today (0 = today). */
export function pktStartOfDay(daysAgo = 0, now: Date = new Date()) {
  const key = pktDayKey(now);
  const midnightPkt = Date.parse(`${key}T00:00:00Z`) - PKT_OFFSET_MS;
  return new Date(midnightPkt - daysAgo * 24 * 60 * 60 * 1000);
}
