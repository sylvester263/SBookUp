// JazzCash adapter — NOT LIVE.
// Required env (server only):
//   JAZZCASH_MERCHANT_ID, JAZZCASH_PASSWORD, JAZZCASH_INTEGRITY_SALT
//   JAZZCASH_ENV = "sandbox" | "production"
// Status:
//  * verifyCallback(): implements JazzCash's commonly documented response hash
//    (HMAC-SHA256 keyed with the integrity salt over
//    "<salt>&<values of all non-empty pp_* fields except pp_SecureHash, sorted by
//    field name>"). This MUST be confirmed against the official docs/sandbox for
//    your merchant account before enabling JazzCash in store settings.
//  * startPayment(): not built — the request format depends on which JazzCash
//    product you sign up for (Hosted Checkout / Page Redirection v1.1 / Mobile
//    Wallet API). Deliberately not guessed.
import process from "node:process";
import { createHmac, timingSafeEqual } from "node:crypto";
import { PaymentNotImplementedError, type CallbackResult, type PaymentProvider } from "./types";

function cfg() {
  return {
    merchantId: process.env.JAZZCASH_MERCHANT_ID,
    password: process.env.JAZZCASH_PASSWORD,
    salt: process.env.JAZZCASH_INTEGRITY_SALT,
    env: process.env.JAZZCASH_ENV === "production" ? "production" : "sandbox",
  };
}

export function jazzcashResponseHash(params: Record<string, string>, salt: string) {
  const values = Object.keys(params)
    .filter((k) => k.startsWith("pp_") && k !== "pp_SecureHash" && params[k] !== "" && params[k] != null)
    .sort()
    .map((k) => params[k]);
  const message = [salt, ...values].join("&");
  return createHmac("sha256", salt).update(message, "utf8").digest("hex").toUpperCase();
}

export const jazzcash: PaymentProvider = {
  id: "jazzcash",
  isConfigured() {
    const c = cfg();
    return !!(c.merchantId && c.password && c.salt);
  },
  async startPayment() {
    throw new PaymentNotImplementedError("jazzcash", "startPayment");
  },
  async verifyCallback(params): Promise<CallbackResult> {
    const c = cfg();
    if (!c.salt) return { valid: false, paid: false, orderNumber: null, amount: null, reference: null, message: "Not configured" };
    const expected = jazzcashResponseHash(params, c.salt);
    const got = String(params.pp_SecureHash ?? "").toUpperCase();
    const valid = got.length === expected.length && timingSafeEqual(Buffer.from(got), Buffer.from(expected));
    if (!valid) return { valid: false, paid: false, orderNumber: null, amount: null, reference: null, message: "Bad signature" };
    if (params.pp_MerchantID !== c.merchantId) {
      return { valid: false, paid: false, orderNumber: null, amount: null, reference: null, message: "Wrong merchant" };
    }
    return {
      valid: true,
      paid: params.pp_ResponseCode === "000",
      orderNumber: params.pp_BillReference || null,
      amount: params.pp_Amount ? Number(params.pp_Amount) / 100 : null, // JazzCash sends paisa
      reference: params.pp_TxnRefNo || params.pp_RetreivalReferenceNo || null,
      message: params.pp_ResponseMessage,
    };
  },
};
