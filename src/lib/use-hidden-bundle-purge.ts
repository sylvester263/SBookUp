import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { cartStore, useCart, type CartLine } from "@/lib/cart-store";
import { schoolFeaturesEnabled, storeSettingsQueryOptions } from "@/lib/feature-flags";

export function isBundleLine(l: Pick<CartLine, "bundle_id" | "school_bundle_id">) {
  return !!(l.bundle_id || l.school_bundle_id);
}

/**
 * While school features are hidden, bundle / school-bundle lines can't be bought
 * (quote_order and place_order reject them). Remove them from the cart once the
 * store settings are known, and return their names so the page can explain why.
 */
export function useHiddenBundlePurge(): string[] {
  const lines = useCart();
  const settings = useQuery(storeSettingsQueryOptions);
  const [removed, setRemoved] = useState<string[]>([]);
  useEffect(() => {
    if (!settings.isSuccess || schoolFeaturesEnabled(settings.data)) return;
    const hidden = lines.filter(isBundleLine);
    if (!hidden.length) return;
    hidden.forEach((l) => cartStore.remove(l.key));
    setRemoved((prev) => Array.from(new Set([...prev, ...hidden.map((l) => l.name)])));
  }, [lines, settings.isSuccess, settings.data]);
  return removed;
}
