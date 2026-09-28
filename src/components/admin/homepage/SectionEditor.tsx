// Edit form for one homepage section: title / subtitle, on/off, schedule and
// the type-specific settings. Saved through adminSaveHomeSection (validated
// server-side with the same schemas).
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { adminSaveHomeSection } from "@/lib/homepage-admin.functions";
import {
  SECTION_LABELS,
  defaultConfig,
  emptyBanner,
  parseConfig,
  validateSection,
  type Banner,
  type PriceRange,
  type PromoTile,
  type SectionConfig,
  type SectionType,
} from "@/lib/homepage-sections";
import {
  BannerFields,
  CategoryListPicker,
  Field,
  ImageField,
  LinkPicker,
  SourcePicker,
} from "@/components/admin/homepage/fields";

export type EditableSection = {
  id?: string;
  type: SectionType;
  title: string | null;
  subtitle: string | null;
  config: unknown;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

/** ISO ↔ <input type="datetime-local"> (local time). */
const toLocal = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
};
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

const TITLE_HELP: Partial<Record<SectionType, string>> = {
  hero_slider: "Not shown on the page (used to find it in this list).",
  banner_pair: "Not shown on the page.",
  app_banner: "Not shown on the page.",
};

export function SectionEditor({
  section,
  onClose,
  onSaved,
}: {
  section: EditableSection;
  onClose: () => void;
  onSaved: () => void;
}) {
  const saveFn = useServerFn(adminSaveHomeSection);
  const [s, setS] = useState(() => ({
    ...section,
    config: parseConfig(section.type, section.config ?? defaultConfig(section.type)) as unknown,
  }));
  const [saving, setSaving] = useState(false);
  const cfg = s.config as SectionConfig[SectionType];
  const setCfg = (c: unknown) => setS((x) => ({ ...x, config: c }));

  async function save() {
    try {
      validateSection(s); // same checks as the server, instant feedback
    } catch (e) {
      return toast.error(e instanceof Error ? readable(e.message) : "Check the form");
    }
    setSaving(true);
    try {
      await saveFn({ data: s });
      toast.success("Section saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? readable(e.message) : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>
            {section.id ? "Edit" : "New"}: {SECTION_LABELS[s.type]}
          </SheetTitle>
          <SheetDescription>Changes appear on the homepage after saving.</SheetDescription>
        </SheetHeader>
        <div className="mt-4 space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Title" help={TITLE_HELP[s.type]}>
              <Input
                value={s.title ?? ""}
                maxLength={120}
                onChange={(e) => setS({ ...s, title: e.target.value || null })}
              />
            </Field>
            <Field label="Subtitle (optional)">
              <Input
                value={s.subtitle ?? ""}
                maxLength={200}
                onChange={(e) => setS({ ...s, subtitle: e.target.value || null })}
              />
            </Field>
          </div>
          <div className="grid grid-cols-[auto_1fr_1fr] items-end gap-3">
            <Field label="Active">
              <Switch checked={s.is_active} onCheckedChange={(v) => setS({ ...s, is_active: v })} />
            </Field>
            <Field label="Show from (optional)">
              <Input
                type="datetime-local"
                value={toLocal(s.starts_at)}
                onChange={(e) => setS({ ...s, starts_at: fromLocal(e.target.value) })}
              />
            </Field>
            <Field label="Until (optional)">
              <Input
                type="datetime-local"
                value={toLocal(s.ends_at)}
                onChange={(e) => setS({ ...s, ends_at: fromLocal(e.target.value) })}
              />
            </Field>
          </div>
          <hr />
          <TypeFields type={s.type} cfg={cfg} setCfg={setCfg} />
        </div>
        <div className="sticky bottom-0 mt-6 flex justify-end gap-2 border-t bg-white py-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700">
            {saving ? "Saving…" : "Save section"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Zod errors come through as JSON; show the first message. */
function readable(msg: string) {
  try {
    const arr = JSON.parse(msg);
    if (Array.isArray(arr) && arr[0]?.message)
      return `${arr[0].path?.join(" › ") ?? ""} ${arr[0].message}`.trim();
  } catch {
    /* plain text */
  }
  return msg;
}

function TypeFields({
  type,
  cfg,
  setCfg,
}: {
  type: SectionType;
  cfg: unknown;
  setCfg: (c: unknown) => void;
}) {
  switch (type) {
    case "hero_slider": {
      const c = cfg as SectionConfig["hero_slider"];
      return (
        <div className="space-y-4">
          <Field label="Seconds per slide">
            <Input
              type="number"
              min={2}
              max={20}
              className="h-9 w-24"
              value={c.interval_seconds}
              onChange={(e) =>
                setCfg({
                  ...c,
                  interval_seconds: Math.max(2, Math.min(20, Number(e.target.value) || 5)),
                })
              }
            />
          </Field>
          <ListEditor<Banner>
            items={c.slides}
            max={10}
            noun="slide"
            make={emptyBanner}
            onChange={(slides) => setCfg({ ...c, slides })}
            render={(b, set) => (
              <BannerFields value={b} onChange={set} slot="hero" mobileSlot="heroMobile" />
            )}
          />
        </div>
      );
    }
    case "product_carousel": {
      const c = cfg as SectionConfig["product_carousel"];
      return (
        <SourcePicker
          value={c.source}
          onChange={(source) => setCfg({ ...c, source })}
          limit={c.limit}
          onLimit={(limit) => setCfg({ ...c, limit })}
        />
      );
    }
    case "category_circles": {
      const c = cfg as SectionConfig["category_circles"];
      return (
        <CategoryListPicker
          slugs={c.category_slugs}
          onChange={(category_slugs) => setCfg({ ...c, category_slugs })}
        />
      );
    }
    case "banner_full": {
      const c = cfg as SectionConfig["banner_full"];
      return (
        <div className="space-y-4">
          <BannerFields
            value={c.banner}
            onChange={(banner) => setCfg({ ...c, banner })}
            slot="full"
            mobileSlot="fullMobile"
          />
          <hr />
          <label className="flex items-center justify-between text-sm font-medium">
            Products under the banner
            <Switch
              checked={!!c.source}
              onCheckedChange={(v) => setCfg({ ...c, source: v ? { type: "best_sellers" } : null })}
            />
          </label>
          {c.source && (
            <SourcePicker
              value={c.source}
              onChange={(source) => setCfg({ ...c, source })}
              limit={c.limit}
              onLimit={(limit) => setCfg({ ...c, limit })}
            />
          )}
        </div>
      );
    }
    case "banner_with_products": {
      const c = cfg as SectionConfig["banner_with_products"];
      return (
        <div className="space-y-4">
          <Field label="Banner side">
            <Select value={c.side} onValueChange={(side) => setCfg({ ...c, side })}>
              <SelectTrigger className="h-9 w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="left">Left</SelectItem>
                <SelectItem value="right">Right</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <BannerFields
            value={c.banner}
            onChange={(banner) => setCfg({ ...c, banner })}
            slot="side"
          />
          <hr />
          <SourcePicker
            value={c.source}
            onChange={(source) => setCfg({ ...c, source })}
            limit={c.limit}
            onLimit={(limit) => setCfg({ ...c, limit })}
          />
        </div>
      );
    }
    case "banner_pair": {
      const c = cfg as SectionConfig["banner_pair"];
      return (
        <div className="space-y-6">
          {c.banners.map((b, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="text-sm font-semibold">{i === 0 ? "Left" : "Right"} banner</div>
              <BannerFields
                value={b}
                onChange={(nb) =>
                  setCfg({ ...c, banners: c.banners.map((x, k) => (k === i ? nb : x)) })
                }
                slot="pair"
              />
            </div>
          ))}
        </div>
      );
    }
    case "promo_tiles": {
      const c = cfg as SectionConfig["promo_tiles"];
      const setTile = (i: number, t: PromoTile) =>
        setCfg({ ...c, tiles: c.tiles.map((x, k) => (k === i ? t : x)) });
      return (
        <div className="space-y-6">
          {c.tiles.map((t, i) => (
            <div key={i} className="space-y-3 rounded-lg border p-3">
              <div className="text-sm font-semibold">Tile {i + 1}</div>
              <ImageField
                label="Image"
                slot="tile"
                value={t.image}
                onChange={(image) => setTile(i, { ...t, image })}
              />
              <Field label="Alt text (required with an image)">
                <Input
                  value={t.alt}
                  maxLength={200}
                  onChange={(e) => setTile(i, { ...t, alt: e.target.value })}
                />
              </Field>
              <div className="grid grid-cols-[1fr_1fr_110px] gap-2">
                <Field label="Title">
                  <Input
                    value={t.title}
                    maxLength={60}
                    onChange={(e) => setTile(i, { ...t, title: e.target.value })}
                  />
                </Field>
                <Field label="Button">
                  <Input
                    value={t.cta}
                    maxLength={30}
                    onChange={(e) => setTile(i, { ...t, cta: e.target.value })}
                  />
                </Field>
                <Field label="Colour">
                  <div className="flex items-center gap-1">
                    <input
                      type="color"
                      aria-label="Tile colour"
                      value={t.color}
                      onChange={(e) => setTile(i, { ...t, color: e.target.value })}
                      className="h-9 w-10 cursor-pointer rounded border"
                    />
                    <Input
                      className="h-9 px-1.5 text-xs"
                      value={t.color}
                      onChange={(e) => setTile(i, { ...t, color: e.target.value })}
                    />
                  </div>
                </Field>
              </div>
              <LinkPicker value={t.link} onChange={(link) => setTile(i, { ...t, link })} />
            </div>
          ))}
        </div>
      );
    }
    case "price_bar": {
      const c = cfg as SectionConfig["price_bar"];
      return (
        <ListEditor<PriceRange>
          items={c.ranges}
          max={8}
          noun="price range"
          make={() => ({ label: "New range", min: null, max: null })}
          onChange={(ranges) => setCfg({ ...c, ranges })}
          render={(r, set) => (
            <div className="grid grid-cols-[1fr_100px_100px] gap-2">
              <Field label="Label">
                <Input
                  value={r.label}
                  maxLength={40}
                  onChange={(e) => set({ ...r, label: e.target.value })}
                />
              </Field>
              <Field label="Min (Rs.)">
                <Input
                  type="number"
                  min={0}
                  value={r.min ?? ""}
                  onChange={(e) =>
                    set({ ...r, min: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </Field>
              <Field label="Max (Rs.)">
                <Input
                  type="number"
                  min={0}
                  value={r.max ?? ""}
                  onChange={(e) =>
                    set({ ...r, max: e.target.value === "" ? null : Number(e.target.value) })
                  }
                />
              </Field>
            </div>
          )}
        />
      );
    }
    case "app_banner": {
      const c = cfg as SectionConfig["app_banner"];
      return (
        <div className="space-y-3">
          <p className="rounded-md bg-slate-50 p-3 text-xs text-muted-foreground">
            Store badges use the App Store / Google Play links from Settings → Header &amp; Footer.
            Keep this section off until the app is live.
          </p>
          <BannerFields
            value={c.banner}
            onChange={(banner) => setCfg({ ...c, banner })}
            slot="app"
            mobileSlot="appMobile"
          />
        </div>
      );
    }
  }
}

/** Add / remove / reorder a list of items (slides, price ranges). */
function ListEditor<T>({
  items,
  onChange,
  render,
  make,
  max,
  noun,
}: {
  items: T[];
  onChange: (v: T[]) => void;
  render: (item: T, set: (v: T) => void) => React.ReactNode;
  make: () => T;
  max: number;
  noun: string;
}) {
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  return (
    <div className="space-y-3">
      {items.map((it, i) => (
        <div key={i} className="space-y-3 rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold capitalize">
              {noun} {i + 1}
            </span>
            <span className="flex">
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Move up"
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label="Move down"
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7"
                aria-label={`Remove ${noun}`}
                onClick={() => onChange(items.filter((_, k) => k !== i))}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            </span>
          </div>
          {render(it, (v) => onChange(items.map((x, k) => (k === i ? v : x))))}
        </div>
      ))}
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={items.length >= max}
        onClick={() => onChange([...items, make()])}
      >
        <Plus className="mr-1 h-4 w-4" /> Add {noun}
      </Button>
    </div>
  );
}
