// "Choose options" quick view: size / colour selectors for a product with
// variants, using the same picker rules as the product page. Loads the product
// (with its variants) only when opened.
import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { productBySlugQuery } from "@/lib/product-queries";
import { attributeDefsQuery } from "@/lib/shop";
import {
  axesFromVariants,
  findVariant,
  initialSelection,
  isOptionAvailable,
  type PickerVariant,
} from "@/lib/variant-picker";
import { money, packLabel, isPack, wasPriceOf, type PackInfo } from "@/lib/pricing";
import { addToCartWithFeedback } from "@/lib/add-to-cart";
import { PRODUCT_PLACEHOLDER } from "@/lib/images";

type QuickVariant = PickerVariant & { compare_at_price?: number | null };
type QuickProduct = PackInfo & {
  id: string;
  name: string;
  slug: string;
  price: number;
  sale_price: number | null;
  images: string[] | null;
  variants?: QuickVariant[];
};

export function QuickViewDialog({
  slug,
  open,
  onOpenChange,
}: {
  slug: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const q = useQuery({ ...productBySlugQuery(slug), enabled: open });
  const defs = useQuery({ ...attributeDefsQuery, enabled: open });
  const [selection, setSelection] = useState<Record<string, string>>({});

  const p = q.data as unknown as QuickProduct | null | undefined;
  const variants = p?.variants ?? [];
  const axes = axesFromVariants(variants, defs.data ?? []);
  const sel = { ...initialSelection(axes), ...selection };
  const variant = findVariant(variants, axes, sel) as QuickVariant | null;
  const base = p
    ? p.sale_price != null && Number(p.sale_price) < Number(p.price)
      ? Number(p.sale_price)
      : Number(p.price)
    : 0;
  const price = variant
    ? variant.price != null
      ? Number(variant.price)
      : base + Number(variant.price_modifier ?? 0)
    : null;
  const was = variant && price != null ? wasPriceOf(price, variant.compare_at_price) : null;
  const image = variant?.image_url || p?.images?.[0] || PRODUCT_PLACEHOLDER;
  const stock = variant ? Number(variant.stock ?? 0) : 0;
  const missing = axes.filter((a) => !sel[a.key]).map((a) => a.label.toLowerCase());

  function add() {
    if (!p || !variant || price == null) return;
    const added = addToCartWithFeedback({
      productId: p.id,
      variantId: variant.id,
      name: `${p.name} — ${variant.name}`,
      image,
      price,
      slug: p.slug,
      stock,
      onViewCart: () => navigate({ to: "/cart" }),
    });
    if (added > 0) onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) setSelection({});
      }}
    >
      <DialogContent className="max-w-2xl p-0 overflow-hidden gap-0 max-h-[90vh] overflow-y-auto">
        {!p ? (
          <div className="p-10 flex flex-col items-center gap-3 text-sm text-muted-foreground">
            {q.isLoading ? <Loader2 className="h-6 w-6 animate-spin text-store-primary" /> : null}
            <DialogTitle className="sr-only">Product options</DialogTitle>
            <DialogDescription>
              {q.isLoading ? "Loading options…" : "This product isn't available."}
            </DialogDescription>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2">
            <div className="bg-white p-6 flex items-center justify-center border-b sm:border-b-0 sm:border-r">
              <img
                src={image}
                alt={p.name}
                width={400}
                height={400}
                className="w-full max-w-[320px] aspect-square object-contain"
              />
            </div>
            <div className="p-5 sm:p-6 space-y-4">
              <div>
                <DialogTitle className="font-sans text-base font-bold uppercase tracking-wide text-store-ink pr-6">
                  {p.name}
                </DialogTitle>
                <DialogDescription className="sr-only">
                  Choose options, then add to cart.
                </DialogDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full bg-store-price text-store-price-foreground px-3 py-1 text-sm font-bold">
                  {price != null ? money(price) : "Choose options for price"}
                </span>
                {was != null && (
                  <span className="text-sm text-muted-foreground line-through">{money(was)}</span>
                )}
                {isPack(p) && <span className="text-xs text-muted-foreground">{packLabel(p)}</span>}
              </div>

              {axes.map((axis) => (
                <fieldset key={axis.key}>
                  <legend className="text-sm font-medium text-store-ink mb-2">
                    {axis.label}
                    {sel[axis.key] ? `: ${sel[axis.key]}` : ""}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {axis.values.map((o) => {
                      const on = sel[axis.key] === o.value;
                      const available = isOptionAvailable(variants, axes, sel, axis.key, o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          aria-pressed={on}
                          disabled={!available && !on}
                          title={available ? undefined : "Out of stock with the current selection"}
                          onClick={() => setSelection({ ...sel, [axis.key]: o.value })}
                          className={`min-w-11 px-3 py-2 rounded-md border text-sm ${on ? "border-store-primary bg-store-primary/10 text-store-primary font-semibold" : "border-border hover:bg-muted"} ${available ? "" : "opacity-40 line-through cursor-not-allowed"}`}
                        >
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
              ))}

              {variant && stock > 0 && stock <= 5 && (
                <p className="text-xs text-orange-700">Only {stock} left</p>
              )}
              <button
                type="button"
                onClick={add}
                disabled={!variant || stock <= 0}
                className="w-full h-11 rounded-md bg-store-primary text-store-primary-foreground text-sm font-bold uppercase tracking-wide hover:bg-store-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {!variant
                  ? `Choose ${missing.join(" and ") || "options"}`
                  : stock <= 0
                    ? "Out of stock"
                    : "Add to cart"}
              </button>
              <Link
                to="/product/$slug"
                params={{ slug: p.slug }}
                onClick={() => onOpenChange(false)}
                className="block text-center text-sm font-semibold text-store-primary hover:underline"
              >
                View full details
              </Link>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
