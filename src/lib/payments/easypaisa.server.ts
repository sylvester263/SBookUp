// EasyPaisa adapter — NOT LIVE, and nothing is guessed.
// Required env (server only):
//   EASYPAISA_STORE_ID, EASYPAISA_HASH_KEY
//   EASYPAISA_ENV = "sandbox" | "production"
// Both startPayment() and verifyCallback() need the merchant integration guide
// that EasyPaisa (Telenor Microfinance Bank) issues with the merchant account
// (hosted checkout vs. mobile-account API, and the exact hash/encryption rules).
// Until then every callback is rejected as invalid.
import process from "node:process";
import { PaymentNotImplementedError, type PaymentProvider } from "./types";

export const easypaisa: PaymentProvider = {
  id: "easypaisa",
  isConfigured() {
    return !!(process.env.EASYPAISA_STORE_ID && process.env.EASYPAISA_HASH_KEY);
  },
  async startPayment() {
    throw new PaymentNotImplementedError("easypaisa", "startPayment");
  },
  async verifyCallback() {
    return {
      valid: false,
      paid: false,
      orderNumber: null,
      amount: null,
      reference: null,
      message: "EasyPaisa callback verification is not implemented yet",
    };
  },
};
