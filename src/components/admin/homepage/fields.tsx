// Form fields for the homepage section editor: image upload (with the
// recommended size), banner, link picker, product source picker (incl.
// hand-picked products), ordered category picker.
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, GripVertical, ImagePlus, Loader2, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { adminGetUploadUrl } from "@/lib/admin.functions";
import { adminPickProducts } from "@/lib/homepage-admin.functions";
import { navCategoriesQuery, type NavCategory } from "@/lib/shop";
import type { BannerLink } from "@/lib/banner-link";
import {
  IMAGE_SIZES,
  PRODUCT_SOURCES,
  SOURCE_LABELS,
  sizeLabel,
  type Banner,
  type ImageRef,
  type ImageSlot,
  type ProductSource,
} from "@/lib/homepage-sections";

export function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
    </div>
  );
}

/** Indented category list for selects: "Stationery", "— Notebooks". */
export function useCategoryOptions() {
  const { data } = useQuery(navCategoriesQuery);
  const all = data ?? [];
  const out: { slug: string; label: string; cat: NavCategory }[] = [];
  const walk = (parent: string | null, depth: number) => {
    for (const c of all
      .filter((x) => x.parent_id === parent)
      .sort((a, b) => a.display_order - b.display_order)) {
      out.push({ slug: c.slug, label: `${"— ".repeat(depth)}${c.name}`, cat: c });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// ---------------------------------------------------------------- image
export function ImageField({
  label,
  value,
  onChange,
  slot,
}: {
  label: string;
  value: ImageRef | null;
  onChange: (v: ImageRef | null) => void;
  slot: ImageSlot;
}) {
  const uploadFn = useServerFn(adminGetUploadUrl);
  const [busy, setBusy] = useState(false);
  const rec = IMAGE_SIZES[slot];

  async function upload(file: File) {
    setBusy(true);
    try {
      const { prepareUploadSized, toWebpPath } = await import("@/lib/image-upload");
      // Keep up to 2× the recommended width for sharp retina screens (max 2400 px)
      const { blob, contentType, width, height } = await prepareUploadSized(
        file,
        Math.min(2400, rec.width * 2),
      );
      const name = toWebpPath(
        `home-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
      ).slice(-120);
      const res = await uploadFn({ data: { bucket: "banner-images", filename: name } });
      const { error } = await supabase.storage
        .from("banner-images")
        .uploadToSignedUrl(res.path, res.token, blob, { contentType });
      if (error) throw error;
      onChange({ src: res.publicUrl, width, height });
      const ratio = width / height,
        want = rec.width / rec.height;
      if (Math.abs(ratio - want) / want > 0.15)
        toast.warning(
          `Uploaded, but its shape (${width}×${height}) differs from the recommended ${sizeLabel(slot)}; it may be cropped.`,
        );
      else toast.success("Image uploaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Field
      label={label}
      help={`Recommended ${sizeLabel(slot)} (JPG / PNG / WebP, max 5 MB). Converted to WebP.`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-28 shrink-0 items-center justify-center overflow-hidden rounded border bg-slate-50">
          {value ? (
            <img src={value.src} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImagePlus className="h-5 w-5 text-muted-foreground" />
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-xs font-medium hover:bg-slate-50">
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            {value ? "Replace" : "Upload"}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) void upload(f);
              }}
            />
          </label>
          {value && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-8 text-xs text-red-600"
              onClick={() => onChange(null)}
            >
              Remove
            </Button>
          )}
          {value && (
            <span className="self-center text-[11px] text-muted-foreground">
              {value.width}×{value.height}
            </span>
          )}
        </div>
      </div>
    </Field>
  );
}

// ---------------------------------------------------------------- link
type LinkKind = "none" | BannerLink["type"];

export function LinkPicker({
  value,
  onChange,
  label = "Link",
}: {
  value: BannerLink | null;
  onChange: (v: BannerLink | null) => void;
  label?: string;
}) {
  const cats = useCategoryOptions();
  const kind: LinkKind = value?.type ?? "none";
  const setKind = (k: LinkKind) =>
    onChange(
      k === "none"
        ? null
        : k === "category"
          ? { type: "category", slug: cats[0]?.slug ?? "" }
          : k === "product"
            ? { type: "product", slug: "" }
            : k === "listing"
              ? { type: "listing", href: "/shop" }
              : { type: "url", href: "https://" },
    );

  return (
    <Field label={label} help="Where the banner goes when clicked.">
      <div className="grid grid-cols-[150px_1fr] gap-2">
        <Select value={kind} onValueChange={(v) => setKind(v as LinkKind)}>
          <SelectTrigger className="h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">No link</SelectItem>
            <SelectItem value="category">Category</SelectItem>
            <SelectItem value="product">Product</SelectItem>
            <SelectItem value="listing">Filtered listing</SelectItem>
            <SelectItem value="url">Other URL</SelectItem>
          </SelectContent>
        </Select>
        {value?.type === "category" && (
          <Select value={value.slug} onValueChange={(slug) => onChange({ type: "category", slug })}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {value?.type === "product" && (
          <ProductSlugPicker
            slug={value.slug}
            onChange={(slug) => onChange({ type: "product", slug })}
          />
        )}
        {value?.type === "listing" && (
          <Input
            className="h-9"
            value={value.href}
            onChange={(e) => onChange({ type: "listing", href: e.target.value })}
            placeholder="/shop/books?sort=%22best_sellers%22"
          />
        )}
        {value?.type === "url" && (
          <Input
            className="h-9"
            value={value.href}
            onChange={(e) => onChange({ type: "url", href: e.target.value })}
            placeholder="https://…"
          />
        )}
      </div>
      {value?.type === "listing" && (
        <p className="text-[11px] text-muted-foreground">
          Tip: open the shop, set filters / sort, then copy the address from the browser (the part
          from /shop).
        </p>
      )}
    </Field>
  );
}

function useProductSearch(q: string) {
  const pickFn = useServerFn(adminPickProducts);
  return useQuery({
    queryKey: ["admin-pick-products", q],
    queryFn: () => pickFn({ data: { q } }),
    enabled: q.trim().length >= 2,
    staleTime: 30_000,
  });
}

function ProductSlugPicker({ slug, onChange }: { slug: string; onChange: (slug: string) => void }) {
  const [q, setQ] = useState("");
  const results = useProductSearch(q);
  return (
    <div className="relative">
      <Input
        className="h-9"
        value={q || slug}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search product by name or SKU"
      />
      {q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
          {results.isLoading && <div className="p-2 text-xs text-muted-foreground">Searching…</div>}
          {(results.data ?? []).map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange(p.slug);
                setQ("");
              }}
              className="block w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
            >
              {p.name} <span className="text-xs text-muted-foreground">{p.sku}</span>
            </button>
          ))}
          {results.data && !results.data.length && (
            <div className="p-2 text-xs text-muted-foreground">No products found.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- banner
export function BannerFields({
  value,
  onChange,
  slot,
  mobileSlot,
}: {
  value: Banner;
  onChange: (v: Banner) => void;
  slot: ImageSlot;
  mobileSlot?: ImageSlot;
}) {
  const set = <K extends keyof Banner>(k: K, v: Banner[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <ImageField
        label="Image (desktop)"
        slot={slot}
        value={value.image}
        onChange={(v) => set("image", v)}
      />
      {mobileSlot && (
        <ImageField
          label="Image (mobile, optional)"
          slot={mobileSlot}
          value={value.mobile_image}
          onChange={(v) => set("mobile_image", v)}
        />
      )}
      <Field
        label="Alt text (required with an image)"
        help="Describes the image for screen readers and search engines."
      >
        <Input
          value={value.alt}
          onChange={(e) => set("alt", e.target.value)}
          placeholder="e.g. Children holding new notebooks"
          maxLength={200}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Heading">
          <Input
            value={value.heading ?? ""}
            onChange={(e) => set("heading", e.target.value || null)}
            maxLength={120}
          />
        </Field>
        <Field label="Button text">
          <Input
            value={value.cta ?? ""}
            onChange={(e) => set("cta", e.target.value || null)}
            placeholder="Shop Now"
            maxLength={40}
          />
        </Field>
      </div>
      <Field label="Subheading">
        <Input
          value={value.subheading ?? ""}
          onChange={(e) => set("subheading", e.target.value || null)}
          maxLength={200}
        />
      </Field>
      <LinkPicker value={value.link} onChange={(v) => set("link", v)} />
    </div>
  );
}

// ---------------------------------------------------------------- product source
export function SourcePicker({
  value,
  onChange,
  limit,
  onLimit,
}: {
  value: ProductSource;
  onChange: (v: ProductSource) => void;
  limit: number;
  onLimit: (n: number) => void;
}) {
  const cats = useCategoryOptions();
  const setType = (t: ProductSource["type"]) =>
    onChange(
      t === "category"
        ? { type: "category", slug: cats[0]?.slug ?? "" }
        : t === "manual"
          ? { type: "manual", product_ids: [] }
          : ({ type: t } as ProductSource),
    );
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_110px] gap-2">
        <Field label="Products from">
          <Select value={value.type} onValueChange={(v) => setType(v as ProductSource["type"])}>
            <SelectTrigger className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRODUCT_SOURCES.map((s) => (
                <SelectItem key={s} value={s}>
                  {SOURCE_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field label="How many">
          <Input
            type="number"
            min={1}
            max={24}
            className="h-9"
            value={limit}
            onChange={(e) => onLimit(Math.max(1, Math.min(24, Number(e.target.value) || 12)))}
          />
        </Field>
      </div>
      {value.type === "category" && (
        <Field label="Category">
          <Select value={value.slug} onValueChange={(slug) => onChange({ type: "category", slug })}>
            <SelectTrigger className="h-9">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {cats.map((c) => (
                <SelectItem key={c.slug} value={c.slug}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      )}
      {value.type === "manual" && (
        <ManualProducts
          ids={value.product_ids}
          onChange={(ids) => onChange({ type: "manual", product_ids: ids })}
        />
      )}
      <p className="text-[11px] text-muted-foreground">
        The section is hidden automatically while this returns no products.
      </p>
    </div>
  );
}

/** Hand-picked products: search to add, drag (or arrows) to order. */
function ManualProducts({ ids, onChange }: { ids: string[]; onChange: (ids: string[]) => void }) {
  const pickFn = useServerFn(adminPickProducts);
  const [q, setQ] = useState("");
  const [drag, setDrag] = useState<number | null>(null);
  const results = useProductSearch(q);
  const picked = useQuery({
    queryKey: ["admin-picked-products", ids],
    queryFn: () => pickFn({ data: { ids } }),
    enabled: ids.length > 0,
  });
  const byId = new Map((picked.data ?? []).map((p) => [p.id, p]));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= ids.length || from === to) return;
    const next = [...ids];
    const [x] = next.splice(from, 1);
    next.splice(to, 0, x);
    onChange(next);
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <Input
          className="h-9"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={ids.length >= 48 ? "Maximum 48 products" : "Search products to add…"}
          disabled={ids.length >= 48}
        />
        {q.trim().length >= 2 && (
          <div className="absolute z-50 mt-1 max-h-56 w-full overflow-y-auto rounded-md border bg-white shadow-lg">
            {(results.data ?? [])
              .filter((p) => !ids.includes(p.id))
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    onChange([...ids, p.id]);
                    setQ("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50"
                >
                  {p.images?.[0] ? (
                    <img src={p.images[0]} alt="" className="h-7 w-7 rounded object-cover" />
                  ) : (
                    <span className="h-7 w-7 rounded bg-slate-100" />
                  )}
                  <span className="flex-1 truncate">{p.name}</span>
                  {!p.is_active && <span className="text-[10px] text-orange-600">inactive</span>}
                </button>
              ))}
            {results.isLoading && (
              <div className="p-2 text-xs text-muted-foreground">Searching…</div>
            )}
          </div>
        )}
      </div>
      <ol className="divide-y rounded-md border">
        {ids.map((id, i) => {
          const p = byId.get(id);
          return (
            <li
              key={id}
              draggable
              onDragStart={() => setDrag(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag != null) move(drag, i);
                setDrag(null);
              }}
              className={`flex items-center gap-2 px-2 py-1.5 text-sm ${drag === i ? "opacity-50" : ""}`}
            >
              <GripVertical
                className="h-4 w-4 cursor-grab text-muted-foreground"
                aria-hidden="true"
              />
              <span className="flex-1 truncate">
                {p?.name ?? "Loading…"}
                {p && !p.is_active && (
                  <span className="ml-1 text-[10px] text-orange-600">(inactive: hidden)</span>
                )}
              </span>
              <button
                type="button"
                aria-label="Move up"
                onClick={() => move(i, i - 1)}
                className="rounded p-1 hover:bg-slate-100"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Move down"
                onClick={() => move(i, i + 1)}
                className="rounded p-1 hover:bg-slate-100"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                aria-label="Remove"
                onClick={() => onChange(ids.filter((x) => x !== id))}
                className="rounded p-1 text-red-600 hover:bg-red-50"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          );
        })}
        {!ids.length && (
          <li className="p-3 text-center text-xs text-muted-foreground">No products picked yet.</li>
        )}
      </ol>
    </div>
  );
}

// ---------------------------------------------------------------- categories
/** Ordered category list (for "Shop by Department"). */
export function CategoryListPicker({
  slugs,
  onChange,
}: {
  slugs: string[];
  onChange: (s: string[]) => void;
}) {
  const cats = useCategoryOptions();
  const name = (s: string) => cats.find((c) => c.slug === s)?.cat.name ?? `${s} (missing)`;
  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= slugs.length) return;
    const next = [...slugs];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const available = cats.filter((c) => !slugs.includes(c.slug));
  return (
    <div className="space-y-2">
      <ol className="divide-y rounded-md border">
        {slugs.map((s, i) => (
          <li key={s} className="flex items-center gap-2 px-2 py-1.5 text-sm">
            <span className="flex-1">{name(s)}</span>
            <button
              type="button"
              aria-label="Move up"
              onClick={() => move(i, -1)}
              className="rounded p-1 hover:bg-slate-100"
            >
              <ArrowUp className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Move down"
              onClick={() => move(i, 1)}
              className="rounded p-1 hover:bg-slate-100"
            >
              <ArrowDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              aria-label="Remove"
              onClick={() => onChange(slugs.filter((x) => x !== s))}
              className="rounded p-1 text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
        {!slugs.length && (
          <li className="p-3 text-center text-xs text-muted-foreground">No categories yet.</li>
        )}
      </ol>
      {available.length > 0 && (
        <Select value="" onValueChange={(slug) => onChange([...slugs, slug])}>
          <SelectTrigger className="h-9">
            <SelectValue placeholder="Add a category…" />
          </SelectTrigger>
          <SelectContent>
            {available.map((c) => (
              <SelectItem key={c.slug} value={c.slug}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <p className="text-[11px] text-muted-foreground">
        Circle images come from each category's image (Admin → Categories, {sizeLabel("circle")});
        categories without one show an icon.
      </p>
    </div>
  );
}
