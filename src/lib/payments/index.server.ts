import type { PaymentProvider, ProviderId } from "./types";
import { jazzcash } from "./jazzcash.server";
import { easypaisa } from "./easypaisa.server";

const PROVIDERS: Record<ProviderId, PaymentProvider> = { jazzcash, easypaisa };

export function getPaymentProvider(id: string): PaymentProvider | null {
  return (PROVIDERS as Record<string, PaymentProvider>)[id] ?? null;
}
