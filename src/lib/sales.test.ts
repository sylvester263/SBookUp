import { describe, expect, it } from "vitest";
import { isRevenueOrder, pktDayKey, pktMonthKey, pktStartOfDay } from "./sales";

describe("revenue rule", () => {
  it("excludes cancelled, refunded and unconfirmed unpaid orders", () => {
    expect(isRevenueOrder({ status: "cancelled", payment_status: "paid" })).toBe(false);
    expect(isRevenueOrder({ status: "refunded", payment_status: "refunded" })).toBe(false);
    expect(isRevenueOrder({ status: "pending", payment_status: "pending" })).toBe(false);
    expect(isRevenueOrder({ status: "pending", payment_status: "pending_verification" })).toBe(false);
  });
  it("includes confirmed-onwards orders and anything paid", () => {
    for (const s of ["confirmed", "processing", "shipped", "delivered"]) expect(isRevenueOrder({ status: s, payment_status: "pending" })).toBe(true);
    expect(isRevenueOrder({ status: "pending", payment_status: "paid" })).toBe(true);
  });
});

describe("Pakistan time", () => {
  it("an order at 20:30 UTC belongs to the next day in Lahore", () => {
    expect(pktDayKey("2026-09-22T20:30:00Z")).toBe("2026-09-23");
    expect(pktDayKey("2026-09-22T18:59:59Z")).toBe("2026-09-22");
    expect(pktMonthKey("2026-09-30T19:00:00Z")).toBe("2026-10");
  });
  it("start of today is 19:00 UTC the previous day", () => {
    const now = new Date("2026-09-23T02:00:00Z"); // 07:00 in Lahore
    expect(pktStartOfDay(0, now).toISOString()).toBe("2026-09-22T19:00:00.000Z");
    expect(pktStartOfDay(1, now).toISOString()).toBe("2026-09-21T19:00:00.000Z");
    const lateEvening = new Date("2026-09-23T20:00:00Z"); // 01:00 on the 24th in Lahore
    expect(pktStartOfDay(0, lateEvening).toISOString()).toBe("2026-09-23T19:00:00.000Z");
  });
});
