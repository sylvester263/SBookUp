// Storefront product card: used on the homepage, listing pages and related
// products. Colours come from the store-* theme tokens (src/styles.css).
import { lazy, Suspense, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { WishlistButton } from "@/components/site/WishlistButton";
import { cardPricing, type CardProduct } from "@/lib/pricing";
import { addToCartWithFeedback } from "@/lib/add-to-cart";
import { PRODUCT_PLACEHOLDER } from "@/lib/images";

// Only downloaded when a shopper opens "Choose options"
const QuickViewDialog = lazy(() =>
  import("@/components/store/QuickViewDialog").then((m) => ({ default: m.QuickViewDialog })),
);

export type CardItem = CardProduct & {
  id: string;
  name: string;
  slug: string;
  images?: string[] | null;
};

export function ProductCard({
  p,
  priority = false,
}: {
  p: CardItem;
  /** Above the fold: load the image eagerly. */ priority?: boolean;
}) {
  const navigate = useNavigate();
  const [quickOpen, setQuickOpen] = useState(false);
  const pricing = cardPricing(p);
  const img = p.images?.[0] || PRODUCT_PLACEHOLDER;

  function onButton() {
    if (pricing.action === "options") return setQuickOpen(true);
    if (pricing.action !== "add") return;
    addToCartWithFeedback({
      productId: p.id,
      name: p.name,
      image: img,
      price: pricing.unitPrice,
      slug: p.slug,
      stock: p.stock_quantity ?? null,
      onViewCart: () => navigate({ to: "/cart" }),
    });
  }

  return (
    <article className="group relative flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white shadow-sm transition-shadow hover:shadow-md">
      {/* Heart: on hover (desktop), always shown on touch screens */}
      <WishlistButton
        productId={p.id}
        className="absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/95 shadow-sm transition-opacity md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100 aria-pressed:opacity-100"
      />
      <Link
        to="/product/$slug"
        params={{ slug: p.slug }}
        className="block bg-white p-3 md:p-4"
        tabIndex={-1}
        aria-hidden="true"
      >
        <img
          src={img}
          alt=""
          width={400}
          height={400}
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={`aspect-square w-full object-contain transition-transform duration-300 group-hover:scale-[1.03] ${pricing.action === "out" ? "opacity-60" : ""}`}
        />
      </Link>
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 md:px-4 md:pb-4">
        <h3 className="font-sans text-[11px] md:text-xs font-semibold uppercase leading-snug tracking-wide text-store-ink line-clamp-2 min-h-[2.75em]">
          <Link
            to="/product/$slug"
            params={{ slug: p.slug }}
            className="hover:text-store-primary focus-visible:underline"
          >
            {p.name}
          </Link>
        </h3>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="rounded-full bg-store-price px-2.5 py-1 text-xs md:text-sm font-bold text-store-price-foreground whitespace-nowrap">
            {pricing.priceText}
          </span>
          {pricing.wasText && (
            <span className="text-[11px] md:text-xs text-muted-foreground line-through whitespace-nowrap">
              {pricing.wasText}
            </span>
          )}
        </div>
        {pricing.packText && (
          <div className="text-[11px] md:text-xs font-medium text-muted-foreground">
            {pricing.packText}
          </div>
        )}
        <button
          type="button"
          onClick={onButton}
          disabled={pricing.action === "out"}
          className="mt-auto h-9 md:h-10 w-full rounded-md bg-store-primary text-[11px] md:text-xs font-bold uppercase tracking-wide text-store-primary-foreground transition-colors hover:bg-store-primary-hover disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
        >
          {pricing.action === "out"
            ? "Out of stock"
            : pricing.action === "options"
              ? "Choose options"
              : "Add to cart"}
        </button>
      </div>
      {quickOpen && (
        <Suspense fallback={null}>
          <QuickViewDialog slug={p.slug} open={quickOpen} onOpenChange={setQuickOpen} />
        </Suspense>
      )}
    </article>
  );
}

/** Loading placeholder with the same shape as the card (no layout shift). */
export function ProductCardSkeleton() {
  return (
    <div
      className="flex h-full flex-col overflow-hidden rounded-xl border border-border bg-white"
      aria-hidden="true"
    >
      <div className="p-3 md:p-4">
        <div className="aspect-square w-full animate-pulse rounded-md bg-muted" />
      </div>
      <div className="flex flex-1 flex-col gap-2 px-3 pb-3 md:px-4 md:pb-4">
        <div className="h-3 w-full animate-pulse rounded bg-muted" />
        <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-6 w-24 animate-pulse rounded-full bg-muted" />
        <div className="mt-auto h-9 md:h-10 w-full animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
