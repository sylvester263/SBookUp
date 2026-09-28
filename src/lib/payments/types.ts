// Payment gateway adapter contract. One file per gateway implements it
// (jazzcash.server.ts, easypaisa.server.ts). Server-only code uses these; the
// browser never sees credentials.

export type ProviderId = "jazzcash" | "easypaisa";

export type StartPaymentInput = {
  orderNumber: string;
  amount: number; // PKR, as saved on the order by place_order()
  customerPhone?: string;
  customerEmail?: string;
  returnUrl: string; // our callback: /api/payments/<provider>/callback
};

export type StartPaymentResult = {
  /** The browser is sent to `url` with `fields` (auto-submitting form for POST). */
  method: "GET" | "POST";
  url: string;
  fields: Record<string, string>;
};

export type CallbackResult = {
  /** Signature/hash checked and correct. Never trust anything when false. */
  valid: boolean;
  /** Gateway says the payment succeeded. */
  paid: boolean;
  orderNumber: string | null;
  /** Amount in PKR as reported by the gateway (compared with the order total). */
  amount: number | null;
  reference: string | null;
  message?: string;
};

export interface PaymentProvider {
  id: ProviderId;
  /** True only when every required environment variable is set. */
  isConfigured(): boolean;
  startPayment(input: StartPaymentInput): Promise<StartPaymentResult>;
  verifyCallback(params: Record<string, string>): Promise<CallbackResult>;
}

export class PaymentNotImplementedError extends Error {
  constructor(provider: ProviderId, what: string) {
    super(`${provider}: ${what} is not implemented yet — needs the gateway's official integration docs and sandbox credentials.`);
  }
}
