// Admin → Settings → Header & Footer: colour preset, announcement bar,
// contact details, social / app links, newsletter text, "powered by", pickup.
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { adminUpdateSiteChrome, type SiteChromeInput } from "@/lib/site-settings.functions";
import { SOCIAL_KEYS, SOCIAL_LABELS } from "@/lib/site-settings";

type Form = {
  theme_preset: "brand" | "teal";
  announcement_enabled: boolean;
  announcements: { text: string; href: string }[];
  announcement_interval_seconds: number;
  support_hours: string;
  whatsapp_number: string;
  whatsapp_hours: string;
  whatsapp_message: string;
  social_links: Record<(typeof SOCIAL_KEYS)[number], string>;
  app_store_url: string;
  play_store_url: string;
  newsletter_heading: string;
  newsletter_text: string;
  powered_by_text: string;
  powered_by_url: string;
  pickup_enabled: boolean;
  pickup_address: string;
};

const s = (v: unknown) => (typeof v === "string" ? v : "");

function fromSettings(d: Record<string, unknown>): Form {
  const social = (
    d.social_links && typeof d.social_links === "object" ? d.social_links : {}
  ) as Record<string, unknown>;
  return {
    theme_preset: d.theme_preset === "teal" ? "teal" : "brand",
    announcement_enabled: d.announcement_enabled !== false,
    announcements: (Array.isArray(d.announcements) ? d.announcements : []).map((a) => ({
      text: s((a as Record<string, unknown>)?.text),
      href: s((a as Record<string, unknown>)?.href),
    })),
    announcement_interval_seconds: Number(d.announcement_interval_seconds) || 5,
    support_hours: s(d.support_hours),
    whatsapp_number: s(d.whatsapp_number),
    whatsapp_hours: s(d.whatsapp_hours),
    whatsapp_message: s(d.whatsapp_message),
    social_links: Object.fromEntries(
      SOCIAL_KEYS.map((k) => [k, s(social[k])]),
    ) as Form["social_links"],
    app_store_url: s(d.app_store_url),
    play_store_url: s(d.play_store_url),
    newsletter_heading: s(d.newsletter_heading),
    newsletter_text: s(d.newsletter_text),
    powered_by_text: s(d.powered_by_text),
    powered_by_url: s(d.powered_by_url),
    pickup_enabled: d.pickup_enabled === true,
    pickup_address: s(d.pickup_address),
  };
}

export function SiteChromeSettings({
  settings,
}: {
  settings: Record<string, unknown> | undefined;
}) {
  const qc = useQueryClient();
  const saveFn = useServerFn(adminUpdateSiteChrome);
  const [f, setF] = useState<Form>(() => fromSettings(settings ?? {}));
  const [saving, setSaving] = useState(false);
  const migrated = !!settings && "theme_preset" in settings;

  useEffect(() => {
    if (settings) setF(fromSettings(settings));
  }, [settings]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));
  const setMsg = (i: number, patch: Partial<Form["announcements"][number]>) =>
    set(
      "announcements",
      f.announcements.map((m, k) => (k === i ? { ...m, ...patch } : m)),
    );
  const move = (i: number, d: -1 | 1) => {
    const next = [...f.announcements];
    const j = i + d;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    set("announcements", next);
  };

  async function save() {
    setSaving(true);
    try {
      await saveFn({
        data: {
          ...f,
          announcements: f.announcements.filter((m) => m.text.trim()),
        } satisfies SiteChromeInput,
      });
      await qc.invalidateQueries({ queryKey: ["store-settings"] });
      toast.success("Header & footer saved");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to save";
      // Zod errors arrive as JSON; show the first readable message
      try {
        toast.error(JSON.parse(msg)[0]?.message ?? msg);
      } catch {
        toast.error(msg);
      }
    } finally {
      setSaving(false);
    }
  }

  const section = "bg-white rounded-xl border p-6 space-y-4";
  const label = "text-sm font-medium";
  const help = "text-xs text-muted-foreground";

  return (
    <div className="max-w-3xl space-y-4">
      {!migrated && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
          These settings need the database update{" "}
          <code>20260928110100_site_chrome_settings.sql</code>. Until it's applied, the site uses
          the defaults shown here and saving will fail.
        </div>
      )}

      <div className={section}>
        <h2 className="font-semibold">Colours</h2>
        <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Colour preset">
          {(
            [
              ["brand", "Brand (current)", "#1A6B6B", "#E8F5F5"],
              ["teal", "Teal", "#00827C", "#DDF3F1"],
            ] as const
          ).map(([v, name, a, b]) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={f.theme_preset === v}
              onClick={() => set("theme_preset", v)}
              className={`flex items-center gap-3 rounded-lg border p-3 text-left ${f.theme_preset === v ? "border-teal-600 ring-2 ring-teal-600/30" : "hover:bg-slate-50"}`}
            >
              <span className="flex overflow-hidden rounded-md border">
                <span className="h-8 w-8" style={{ background: a }} />
                <span className="h-8 w-8" style={{ background: b }} />
                <span className="h-8 w-8" style={{ background: "#FFF3B8" }} />
              </span>
              <span className="text-sm font-medium">{name}</span>
            </button>
          ))}
        </div>
      </div>

      <div className={section}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Announcement bar</h2>
          <label className="flex items-center gap-2 text-sm">
            Show{" "}
            <Switch
              checked={f.announcement_enabled}
              onCheckedChange={(v) => set("announcement_enabled", v)}
            />
          </label>
        </div>
        <p className={help}>
          The thin strip above the header. With more than one message they rotate. Leave the link
          empty for plain text.
        </p>
        {f.announcements.map((m, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
            <Input
              value={m.text}
              maxLength={160}
              onChange={(e) => setMsg(i, { text: e.target.value })}
              placeholder="e.g. Free delivery in Lahore over Rs. 2,000"
              aria-label={`Message ${i + 1}`}
            />
            <Input
              value={m.href}
              onChange={(e) => setMsg(i, { href: e.target.value })}
              placeholder="Link (optional), e.g. /shop?on_sale=true"
              aria-label={`Message ${i + 1} link`}
            />
            <div className="flex">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => move(i, -1)}
                aria-label="Move up"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => move(i, 1)}
                aria-label="Move down"
              >
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() =>
                  set(
                    "announcements",
                    f.announcements.filter((_, k) => k !== i),
                  )
                }
                aria-label="Remove message"
              >
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-4">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={f.announcements.length >= 10}
            onClick={() => set("announcements", [...f.announcements, { text: "", href: "" }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add message
          </Button>
          <label className="flex items-center gap-2 text-sm">
            Rotate every
            <Input
              type="number"
              min={2}
              max={60}
              className="h-8 w-20"
              value={f.announcement_interval_seconds}
              onChange={(e) => set("announcement_interval_seconds", Number(e.target.value) || 5)}
            />{" "}
            seconds
          </label>
        </div>
      </div>

      <div className={section}>
        <h2 className="font-semibold">Contact (footer)</h2>
        <p className={help}>Phone, email and address are on the Store Info tab.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>Phone hours</label>
            <Input
              value={f.support_hours}
              onChange={(e) => set("support_hours", e.target.value)}
              placeholder="Mon–Sat, 10am – 7pm"
            />
          </div>
          <div>
            <label className={label}>WhatsApp number</label>
            <Input
              value={f.whatsapp_number}
              onChange={(e) => set("whatsapp_number", e.target.value)}
              placeholder="923001234567"
              inputMode="numeric"
            />
            <p className={help}>
              Country code + number, digits only. Used by the WhatsApp button on every page.
            </p>
          </div>
          <div>
            <label className={label}>WhatsApp hours</label>
            <Input
              value={f.whatsapp_hours}
              onChange={(e) => set("whatsapp_hours", e.target.value)}
              placeholder="Every day, 9am – 9pm"
            />
          </div>
          <div>
            <label className={label}>WhatsApp pre-filled message</label>
            <Input
              value={f.whatsapp_message}
              onChange={(e) => set("whatsapp_message", e.target.value)}
              placeholder="Hi, I have a question about…"
            />
          </div>
        </div>
      </div>

      <div className={section}>
        <h2 className="font-semibold">Social & app links</h2>
        <p className={help}>
          Only filled-in links are shown. App badges stay hidden until a link is set.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          {SOCIAL_KEYS.map((k) => (
            <div key={k}>
              <label className={label}>{SOCIAL_LABELS[k]}</label>
              <Input
                value={f.social_links[k]}
                onChange={(e) => set("social_links", { ...f.social_links, [k]: e.target.value })}
                placeholder="https://…"
              />
            </div>
          ))}
          <div>
            <label className={label}>App Store link</label>
            <Input
              value={f.app_store_url}
              onChange={(e) => set("app_store_url", e.target.value)}
              placeholder="https://apps.apple.com/…"
            />
          </div>
          <div>
            <label className={label}>Google Play link</label>
            <Input
              value={f.play_store_url}
              onChange={(e) => set("play_store_url", e.target.value)}
              placeholder="https://play.google.com/…"
            />
          </div>
        </div>
      </div>

      <div className={section}>
        <h2 className="font-semibold">Footer text</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className={label}>Newsletter heading</label>
            <Input
              value={f.newsletter_heading}
              onChange={(e) => set("newsletter_heading", e.target.value)}
              placeholder="Subscribe to our Newsletter"
            />
          </div>
          <div>
            <label className={label}>Newsletter text</label>
            <Input
              value={f.newsletter_text}
              onChange={(e) => set("newsletter_text", e.target.value)}
              placeholder="Get offers and new arrivals…"
            />
          </div>
          <div>
            <label className={label}>"Powered by" text</label>
            <Input
              value={f.powered_by_text}
              onChange={(e) => set("powered_by_text", e.target.value)}
              placeholder="Powered by …"
            />
          </div>
          <div>
            <label className={label}>"Powered by" link</label>
            <Input
              value={f.powered_by_url}
              onChange={(e) => set("powered_by_url", e.target.value)}
              placeholder="https://…"
            />
          </div>
        </div>
      </div>

      <div className={section}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Store pickup</h2>
          <Switch
            checked={f.pickup_enabled}
            onCheckedChange={(v) => set("pickup_enabled", v)}
            aria-label="Offer store pickup"
          />
        </div>
        <p className={help}>
          When on, the header's location button offers "Pickup" next to delivery. Checkout still
          charges delivery for now (see HOMEPAGE_PROGRESS.md), so leave this off until pickup orders
          are supported.
        </p>
        <div>
          <label className={label}>Pickup address</label>
          <Textarea
            rows={2}
            value={f.pickup_address}
            onChange={(e) => set("pickup_address", e.target.value)}
          />
        </div>
      </div>

      <Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
        {saving ? "Saving…" : "Save Header & Footer"}
      </Button>
    </div>
  );
}
