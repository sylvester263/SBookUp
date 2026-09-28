// The shopper's chosen delivery city (or store pickup): picked in the header,
// kept in the browser for everyone and on the profile when signed in, used to
// pre-fill checkout and show the delivery estimate.
import { useSyncExternalStore } from "react";
import { queryOptions } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DeliveryChoice =
  | { method: "delivery"; city: string; zoneId: string | null }
  | { method: "pickup" };

export type DeliveryZone = {
  id: string;
  name: string;
  cities: string[];
  estimated_days: number;
  base_rate: number;
  free_shipping_threshold: number | null;
};

const KEY = "sbu_delivery_v1";
const EVENT = "delivery-location-changed";

/** Active shipping zones and their cities (public, small table). */
export const deliveryZonesQuery = queryOptions({
  queryKey: ["delivery-zones"],
  queryFn: async () => {
    const { data, error } = await supabase
      .from("shipping_zones")
      .select("id,name,cities,estimated_days,base_rate,free_shipping_threshold")
      .eq("is_active", true)
      .order("name");
    if (error) throw error;
    return (data ?? []) as DeliveryZone[];
  },
  staleTime: 10 * 60_000,
});

/** Every city across the zones, A–Z, each with its zone. */
export function citiesFromZones(zones: DeliveryZone[]): { city: string; zone: DeliveryZone }[] {
  const seen = new Map<string, { city: string; zone: DeliveryZone }>();
  for (const z of zones)
    for (const c of z.cities ?? []) {
      const city = c.trim();
      if (city && !seen.has(city.toLowerCase())) seen.set(city.toLowerCase(), { city, zone: z });
    }
  return [...seen.values()].sort((a, b) => a.city.localeCompare(b.city));
}

/** The zone serving a city (case-insensitive), like the server's zone matching. */
export function zoneForCity(zones: DeliveryZone[], city: string): DeliveryZone | null {
  const c = city.trim().toLowerCase();
  return zones.find((z) => (z.cities ?? []).some((x) => x.trim().toLowerCase() === c)) ?? null;
}

/** "Delivery in 2 days" / "Delivery in 3–4 days" style estimate. */
export function deliveryEstimate(zone: DeliveryZone | null): string | null {
  if (!zone || !zone.estimated_days) return null;
  return `Delivery in ${zone.estimated_days} ${zone.estimated_days === 1 ? "day" : "days"}`;
}

export function parseDeliveryChoice(raw: unknown): DeliveryChoice | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.method === "pickup") return { method: "pickup" };
  if (r.method === "delivery" && typeof r.city === "string" && r.city.trim()) {
    return {
      method: "delivery",
      city: r.city.trim().slice(0, 80),
      zoneId: typeof r.zoneId === "string" ? r.zoneId : null,
    };
  }
  return null;
}

let cached: { raw: string | null; value: DeliveryChoice | null } = { raw: null, value: null };
function read(): DeliveryChoice | null {
  if (typeof window === "undefined") return null;
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {
    return null;
  }
  if (raw !== cached.raw) {
    let parsed: unknown = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch {
      /* ignore */
    }
    cached = { raw, value: parseDeliveryChoice(parsed) };
  }
  return cached.value;
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

/** The saved choice (null on the server and until one is chosen). */
export function useDeliveryChoice(): DeliveryChoice | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

/** Saves the choice in the browser and, when signed in, on the profile. */
export async function saveDeliveryChoice(choice: DeliveryChoice, userId?: string | null) {
  try {
    localStorage.setItem(KEY, JSON.stringify(choice));
  } catch {
    /* private mode: keep in memory only */
  }
  window.dispatchEvent(new Event(EVENT));
  if (userId) {
    const patch =
      choice.method === "pickup"
        ? { delivery_method: "pickup", delivery_city: null, delivery_zone_id: null }
        : {
            delivery_method: "delivery",
            delivery_city: choice.city,
            delivery_zone_id: choice.zoneId,
          };
    // Best effort: the browser copy is what the site uses
    await supabase.from("profiles").update(patch).eq("id", userId);
  }
}

/** Restores a signed-in shopper's saved choice on a new device (only when the browser has none). */
export async function restoreDeliveryChoice(userId: string) {
  if (read()) return;
  const { data } = await supabase
    .from("profiles")
    .select("delivery_method,delivery_city,delivery_zone_id")
    .eq("id", userId)
    .maybeSingle();
  const choice = parseDeliveryChoice(
    data
      ? { method: data.delivery_method, city: data.delivery_city, zoneId: data.delivery_zone_id }
      : null,
  );
  if (choice) {
    try {
      localStorage.setItem(KEY, JSON.stringify(choice));
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  }
}
