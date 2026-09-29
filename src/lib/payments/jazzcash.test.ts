import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { jazzcash, jazzcashResponseHash } from "./jazzcash.server";

const SALT = "test_salt_123";
const base = {
  pp_Amount: "150000",
  pp_BillReference: "SBE-20260923-0001",
  pp_MerchantID: "MC12345",
  pp_ResponseCode: "000",
  pp_ResponseMessage: "Thank you",
  pp_TxnRefNo: "T20260923120000",
  pp_Empty: "",
  other_field: "ignored",
};
const sign = (p: Record<string, string>) => ({ ...p, pp_SecureHash: jazzcashResponseHash(p, SALT) });

describe("JazzCash callback verification", () => {
  beforeEach(() => {
    process.env.JAZZCASH_MERCHANT_ID = "MC12345";
    process.env.JAZZCASH_PASSWORD = "pw";
    process.env.JAZZCASH_INTEGRITY_SALT = SALT;
  });
  afterEach(() => {
    delete process.env.JAZZCASH_MERCHANT_ID;
    delete process.env.JAZZCASH_PASSWORD;
    delete process.env.JAZZCASH_INTEGRITY_SALT;
  });

  it("hash = HMAC-SHA256(salt, salt & sorted non-empty pp_ values), upper-case", () => {
    const msg = [SALT, "150000", "SBE-20260923-0001", "MC12345", "000", "Thank you", "T20260923120000"].join("&");
    expect(jazzcashResponseHash(base, SALT)).toBe(createHmac("sha256", SALT).update(msg).digest("hex").toUpperCase());
  });

  it("accepts a correctly signed success and converts paisa to PKR", async () => {
    const r = await jazzcash.verifyCallback(sign(base));
    expect(r).toMatchObject({ valid: true, paid: true, orderNumber: "SBE-20260923-0001", amount: 1500, reference: "T20260923120000" });
  });

  it("rejects a tampered amount", async () => {
    const signed = sign(base);
    const r = await jazzcash.verifyCallback({ ...signed, pp_Amount: "100" });
    expect(r.valid).toBe(false);
    expect(r.paid).toBe(false);
  });

  it("rejects another merchant's callback", async () => {
    const r = await jazzcash.verifyCallback(sign({ ...base, pp_MerchantID: "OTHER" }));
    expect(r.valid).toBe(false);
  });

  it("reports failed payments as not paid", async () => {
    const r = await jazzcash.verifyCallback(sign({ ...base, pp_ResponseCode: "124" }));
    expect(r).toMatchObject({ valid: true, paid: false });
  });

  it("is not configured without credentials", () => {
    delete process.env.JAZZCASH_INTEGRITY_SALT;
    expect(jazzcash.isConfigured()).toBe(false);
  });
});
