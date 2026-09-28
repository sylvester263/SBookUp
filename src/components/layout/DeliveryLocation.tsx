// Header pill "Choose delivery or pickup / Set city" and its city picker. The
// cities come from the active shipping zones; the choice pre-fills checkout.
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, ChevronDown, Store, Truck, Search, Check } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { useSiteSettings } from "@/lib/site-settings";
import {
  citiesFromZones,
  deliveryEstimate,
  deliveryZonesQuery,
  restoreDeliveryChoice,
  saveDeliveryChoice,
  useDeliveryChoice,
  zoneForCity,
} from "@/lib/delivery-location";

export function DeliveryLocationButton({
  compact = false,
  iconOnly = false,
}: {
  compact?: boolean;
  /** Tablet header: just the pin (the label is kept for screen readers and as a tooltip). */
  iconOnly?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const choice = useDeliveryChoice();
  const { user } = useAuth();
  const settings = useSiteSettings();
  const zones = useQuery({ ...deliveryZonesQuery, enabled: open || choice?.method === "delivery" });

  // Signed in on a new device: bring back the saved city
  useEffect(() => {
    if (user?.id) void restoreDeliveryChoice(user.id);
  }, [user?.id]);

  const zone = choice?.method === "delivery" ? zoneForCity(zones.data ?? [], choice.city) : null;
  const top =
    choice?.method === "pickup"
      ? "Store pickup"
      : choice?.method === "delivery"
        ? `Deliver to ${choice.city}`
        : settings.pickup.enabled
          ? "Choose delivery or pickup"
          : "Choose delivery city";
  const bottom =
    choice?.method === "pickup"
      ? (settings.pickup.address ?? "Collect from our store")
      : choice
        ? (deliveryEstimate(zone) ?? "Change city")
        : "Set city";

  if (iconOnly) {
    return (
      <>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label={top}
          title={top}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white transition hover:border-store-primary"
        >
          <MapPin className="h-5 w-5 text-store-primary" aria-hidden="true" />
        </button>
        <DeliveryLocationDialog open={open} onOpenChange={setOpen} />
      </>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        className={`flex items-center gap-2 rounded-full border border-border bg-white text-left transition hover:border-store-primary ${compact ? "h-9 px-3" : "h-11 px-4"}`}
      >
        <MapPin className="h-4 w-4 shrink-0 text-store-primary" aria-hidden="true" />
        <span className="min-w-0 leading-tight">
          <span className="block max-w-[150px] truncate text-[11px] text-muted-foreground">
            {top}
          </span>
          {!compact && (
            <span className="block max-w-[150px] truncate text-xs font-semibold text-store-ink">
              {bottom}
            </span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
      <DeliveryLocationDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function DeliveryLocationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const choice = useDeliveryChoice();
  const { user } = useAuth();
  const settings = useSiteSettings();
  const zones = useQuery({ ...deliveryZonesQuery, enabled: open });
  const [mode, setMode] = useState<"delivery" | "pickup">(
    choice?.method === "pickup" && settings.pickup.enabled ? "pickup" : "delivery",
  );
  const [q, setQ] = useState("");
  const cities = useMemo(() => citiesFromZones(zones.data ?? []), [zones.data]);
  const shown = q.trim()
    ? cities.filter((c) => c.city.toLowerCase().includes(q.trim().toLowerCase()))
    : cities;

  async function pick(city: string, zoneId: string) {
    await saveDeliveryChoice({ method: "delivery", city, zoneId }, user?.id);
    toast.success(`Delivering to ${city}`);
    onOpenChange(false);
  }
  async function pickup() {
    await saveDeliveryChoice({ method: "pickup" }, user?.id);
    toast.success("Store pickup selected");
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md gap-0 p-0">
        <div className="border-b p-5">
          <DialogTitle className="font-sans text-lg font-bold text-store-ink">
            {settings.pickup.enabled ? "Delivery or pickup" : "Where should we deliver?"}
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-muted-foreground">
            We'll use this for delivery charges and times, and to fill in checkout.
          </DialogDescription>
          {settings.pickup.enabled && (
            <div
              className="mt-4 grid grid-cols-2 gap-2"
              role="radiogroup"
              aria-label="Delivery or pickup"
            >
              {(
                [
                  ["delivery", "Delivery", Truck],
                  ["pickup", "Pickup", Store],
                ] as const
              ).map(([m, label, Icon]) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={mode === m}
                  onClick={() => setMode(m)}
                  className={`flex h-11 items-center justify-center gap-2 rounded-md border text-sm font-semibold ${mode === m ? "border-store-primary bg-store-primary/10 text-store-primary" : "hover:bg-muted"}`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          )}
        </div>

        {mode === "pickup" && settings.pickup.enabled ? (
          <div className="space-y-4 p-5">
            <div className="rounded-md bg-store-soft p-4 text-sm text-store-soft-foreground">
              <div className="font-semibold">Collect from our store</div>
              <div className="mt-1">
                {settings.pickup.address ??
                  settings.address ??
                  "Our store address will be shared on confirmation."}
              </div>
            </div>
            <button
              type="button"
              onClick={pickup}
              className="h-11 w-full rounded-md bg-store-primary text-sm font-bold uppercase tracking-wide text-store-primary-foreground hover:bg-store-primary-hover"
            >
              Use store pickup
            </button>
          </div>
        ) : (
          <div className="p-5">
            <label className="relative block">
              <span className="sr-only">Search city</span>
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search your city"
                autoFocus
                className="h-11 w-full rounded-full border border-border pl-9 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-store-primary"
              />
            </label>
            <ul className="mt-3 max-h-72 overflow-y-auto" aria-label="Cities">
              {zones.isLoading && (
                <li className="py-6 text-center text-sm text-muted-foreground">Loading cities…</li>
              )}
              {!zones.isLoading && !shown.length && (
                <li className="py-6 text-center text-sm text-muted-foreground">
                  {cities.length
                    ? "No matching city. We may still deliver there — contact us."
                    : "Delivery cities haven't been set up yet."}
                </li>
              )}
              {shown.map(({ city, zone }) => {
                const on =
                  choice?.method === "delivery" && choice.city.toLowerCase() === city.toLowerCase();
                return (
                  <li key={city}>
                    <button
                      type="button"
                      onClick={() => pick(city, zone.id)}
                      className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2.5 text-left text-sm hover:bg-muted ${on ? "bg-store-primary/10" : ""}`}
                    >
                      <span className="font-medium text-store-ink">{city}</span>
                      <span className="flex items-center gap-2 text-xs text-muted-foreground">
                        {deliveryEstimate(zone)}
                        {on && (
                          <Check className="h-4 w-4 text-store-primary" aria-label="Selected" />
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
