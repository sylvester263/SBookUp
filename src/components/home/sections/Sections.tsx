// Homepage section blocks (everything except the hero). Product rows load when
// they come near the screen and disappear when their source has no products.
import { useQuery } from "@tanstack/react-query";
import { BannerImage } from "@/components/store/BannerImage";
import { ProductCard, ProductCardSkeleton } from "@/components/store/ProductCard";
import { ProductCarousel } from "@/components/store/ProductCarousel";
import { SectionHeading } from "@/components/store/SectionHeading";
import { navCategoriesQuery, categoryHref } from "@/lib/shop";
import { sectionProductsQuery } from "@/lib/homepage-queries";
import {
  IMAGE_SIZES,
  viewAllHref,
  type Banner,
  type PriceRange,
  type ProductSource,
  type PromoTile,
} from "@/lib/homepage-sections";
import { priceRangeHref, readableTextOn } from "@/lib/homepage-render";
import { resolveBannerLink } from "@/lib/banner-link";
import { categoryIcon } from "@/lib/category-icons";
import { useSiteSettings } from "@/lib/site-settings";
import { useInView } from "@/lib/use-in-view";

/** Centred content column with the page's vertical rhythm. */
export function Container({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`container mx-auto px-4 ${className}`}>{children}</div>;
}
const SECTION_Y = "py-6 md:py-10";

// ---------------------------------------------------------------- product rows
/**
 * Products for a source. Loads when near the screen (or immediately if already
 * loaded on the server); `status` tells the caller when there's nothing to show.
 */
function useSourceProducts(source: ProductSource, limit: number) {
  const q0 = sectionProductsQuery(source, limit);
  const [ref, inView] = useInView<HTMLDivElement>("600px");
  const q = useQuery({ ...q0, enabled: inView });
  const status = q.data ? (q.data.length ? "ready" : "empty") : q.isError ? "empty" : "loading";
  return { ref, items: q.data ?? [], status } as const;
}

function ProductsOrSkeleton({
  items,
  status,
  label,
  width,
  priority = false,
}: {
  items: ReturnType<typeof useSourceProducts>["items"];
  status: string;
  label: string;
  width?: "full" | "narrow";
  /** First product row on the page: load the visible images eagerly (LCP). */
  priority?: boolean;
}) {
  return (
    <ProductCarousel label={label} width={width}>
      {status === "loading"
        ? Array.from({ length: 6 }, (_, k) => <ProductCardSkeleton key={k} />)
        : items.map((p, k) => <ProductCard key={p.id} p={p} priority={priority && k < 6} />)}
    </ProductCarousel>
  );
}

export function ProductCarouselSection({
  id,
  title,
  subtitle,
  source,
  limit,
  priority = false,
}: {
  id: string;
  title: string | null;
  subtitle: string | null;
  source: ProductSource;
  limit: number;
  priority?: boolean;
}) {
  const { ref, items, status } = useSourceProducts(source, limit);
  const cats = useQuery(navCategoriesQuery);
  if (status === "empty") return null;
  const label = title ?? "Products";
  return (
    <section ref={ref} aria-labelledby={`h-${id}`} className={SECTION_Y}>
      <Container>
        <SectionHeading
          id={`h-${id}`}
          title={label}
          subtitle={subtitle}
          viewAllHref={viewAllHref(source, cats.data ?? [])}
        />
        <ProductsOrSkeleton items={items} status={status} label={label} priority={priority} />
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- banners
export function BannerFullSection({
  id,
  title,
  subtitle,
  banner,
  source,
  limit,
}: {
  id: string;
  title: string | null;
  subtitle: string | null;
  banner: Banner;
  source: ProductSource | null;
  limit: number;
}) {
  return (
    <section aria-label={title ?? banner.heading ?? "Banner"} className={SECTION_Y}>
      {/* Full-bleed brand strip */}
      <BannerImage
        desktop={banner.image}
        mobile={banner.mobile_image}
        placeholderSize={IMAGE_SIZES.full}
        placeholderMobileSize={IMAGE_SIZES.fullMobile}
        alt={banner.alt}
        heading={banner.heading}
        subheading={banner.subheading}
        cta={banner.cta}
        link={banner.link}
        rounded={false}
      />
      {source && (
        <BannerProducts id={id} title={title} subtitle={subtitle} source={source} limit={limit} />
      )}
    </section>
  );
}

/** The carousel under a full-width banner (hidden when its source is empty, the banner stays). */
function BannerProducts({
  id,
  title,
  subtitle,
  source,
  limit,
}: {
  id: string;
  title: string | null;
  subtitle: string | null;
  source: ProductSource;
  limit: number;
}) {
  const { ref, items, status } = useSourceProducts(source, limit);
  const cats = useQuery(navCategoriesQuery);
  if (status === "empty") return <div ref={ref} />;
  const label = title ?? "Products";
  return (
    <Container className="pt-6 md:pt-8">
      <div ref={ref}>
        <SectionHeading
          id={`h-${id}`}
          title={label}
          subtitle={subtitle}
          viewAllHref={viewAllHref(source, cats.data ?? [])}
        />
        <ProductsOrSkeleton items={items} status={status} label={label} />
      </div>
    </Container>
  );
}

export function BannerWithProductsSection({
  id,
  title,
  subtitle,
  banner,
  side,
  source,
  limit,
}: {
  id: string;
  title: string | null;
  subtitle: string | null;
  banner: Banner;
  side: "left" | "right";
  source: ProductSource;
  limit: number;
}) {
  const { ref, items, status } = useSourceProducts(source, limit);
  const cats = useQuery(navCategoriesQuery);
  if (status === "empty") return null;
  const label = title ?? "Products";
  return (
    <section ref={ref} aria-labelledby={`h-${id}`} className={SECTION_Y}>
      <Container>
        <SectionHeading
          id={`h-${id}`}
          title={label}
          subtitle={subtitle}
          viewAllHref={viewAllHref(source, cats.data ?? [])}
        />
        <div
          className={`grid items-stretch gap-4 lg:gap-6 ${side === "right" ? "lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:[&>*:first-child]:order-2" : "lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]"}`}
        >
          <BannerImage
            desktop={banner.image}
            placeholderSize={IMAGE_SIZES.side}
            alt={banner.alt}
            heading={banner.heading}
            subheading={banner.subheading}
            cta={banner.cta}
            link={banner.link}
            className="h-full [&>div]:h-full [&_img]:h-full [&_picture]:block [&_picture]:h-full"
          />
          <div className="min-w-0 self-center">
            <ProductsOrSkeleton items={items} status={status} label={label} width="narrow" />
          </div>
        </div>
      </Container>
    </section>
  );
}

export function BannerPairSection({ title, banners }: { title: string | null; banners: Banner[] }) {
  if (!banners.length) return null;
  return (
    <section aria-label={title ?? "Featured"} className={SECTION_Y}>
      <Container className={`grid gap-4 md:gap-6 ${banners.length > 1 ? "md:grid-cols-2" : ""}`}>
        {banners.map((b, k) => (
          <BannerImage
            key={k}
            desktop={b.image}
            placeholderSize={IMAGE_SIZES.pair}
            alt={b.alt}
            heading={b.heading}
            subheading={b.subheading}
            cta={b.cta}
            link={b.link}
          />
        ))}
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- categories
export function CategoryCirclesSection({
  id,
  title,
  subtitle,
  slugs,
}: {
  id: string;
  title: string | null;
  subtitle: string | null;
  slugs: string[];
}) {
  const { data } = useQuery(navCategoriesQuery);
  const all = data ?? [];
  // Only categories that exist and are active, in the chosen order
  const cats = slugs
    .map((s) => all.find((c) => c.slug === s))
    .filter((c): c is NonNullable<typeof c> => !!c);
  if (data && !cats.length) return null;
  const label = title ?? "Shop by Department";
  return (
    <section aria-labelledby={`h-${id}`} className={SECTION_Y}>
      <Container>
        <SectionHeading id={`h-${id}`} title={label} subtitle={subtitle} />
        <ProductCarousel label={label} width="circles">
          {cats.map((c) => {
            const Icon = categoryIcon(c.slug);
            return (
              <a
                key={c.id}
                href={categoryHref(all, c.slug)}
                className="group flex flex-col items-center gap-2 text-center"
              >
                <span className="flex aspect-square w-full max-w-[140px] items-center justify-center overflow-hidden rounded-full border border-border bg-store-soft transition group-hover:border-store-primary group-hover:shadow-md">
                  {c.image_url ? (
                    <img
                      src={c.image_url}
                      alt=""
                      width={300}
                      height={300}
                      loading="lazy"
                      decoding="async"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <Icon className="h-1/3 w-1/3 text-store-primary" aria-hidden="true" />
                  )}
                </span>
                <span className="line-clamp-2 text-xs font-semibold text-store-ink group-hover:text-store-primary md:text-sm">
                  {c.name}
                </span>
              </a>
            );
          })}
        </ProductCarousel>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- promo tiles
export function PromoTilesSection({ title, tiles }: { title: string | null; tiles: PromoTile[] }) {
  const cats = useQuery(navCategoriesQuery);
  if (!tiles.length) return null;
  return (
    <section aria-label={title ?? "Promotions"} className={SECTION_Y}>
      <Container className="grid gap-4 sm:grid-cols-2 md:gap-6 lg:grid-cols-3">
        {tiles.map((t, k) => {
          const target = resolveBannerLink(t.link, cats.data ?? []);
          const ink = readableTextOn(t.color);
          const Tag = target ? "a" : "div";
          return (
            <Tag
              key={k}
              {...(target
                ? {
                    href: target.href,
                    ...(target.external ? { target: "_blank", rel: "noopener noreferrer" } : {}),
                  }
                : {})}
              className="group relative block overflow-hidden rounded-xl bg-muted shadow-sm"
            >
              {t.image ? (
                <img
                  src={t.image.src}
                  alt={t.alt}
                  width={t.image.width}
                  height={t.image.height}
                  loading="lazy"
                  decoding="async"
                  className="aspect-[5/4] w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
                />
              ) : (
                <div
                  aria-hidden="true"
                  className="aspect-[5/4] w-full bg-gradient-to-br from-store-soft to-white"
                />
              )}
              {/* Curved colour shape holding the title and button */}
              <div className="absolute inset-x-0 bottom-0">
                <svg
                  viewBox="0 0 400 40"
                  preserveAspectRatio="none"
                  className="block h-8 w-full md:h-10"
                  aria-hidden="true"
                >
                  <path d="M0 40 C 120 0, 280 0, 400 40 Z" fill={t.color} />
                </svg>
                <div
                  className="flex flex-col items-center gap-2 px-4 pb-4 pt-1 text-center"
                  style={{ background: t.color, color: ink }}
                >
                  <span className="font-sans text-lg font-extrabold md:text-xl">{t.title}</span>
                  <span
                    className="inline-flex h-9 items-center rounded-full px-5 text-xs font-bold uppercase tracking-wide shadow-sm"
                    style={{ background: ink, color: t.color }}
                  >
                    {t.cta}
                  </span>
                </div>
              </div>
            </Tag>
          );
        })}
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- price bar
export function PriceBarSection({
  id,
  title,
  subtitle,
  ranges,
}: {
  id: string;
  title: string | null;
  subtitle: string | null;
  ranges: PriceRange[];
}) {
  if (!ranges.length) return null;
  return (
    <section aria-labelledby={`h-${id}`} className={`${SECTION_Y} bg-store-soft`}>
      <Container>
        <SectionHeading id={`h-${id}`} title={title ?? "Shop by Price"} subtitle={subtitle} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4 lg:grid-cols-5">
          {ranges.map((r) => (
            <a
              key={r.label}
              href={priceRangeHref(r)}
              className="flex min-h-20 flex-col items-center justify-center rounded-xl border border-border bg-white p-4 text-center shadow-sm transition hover:border-store-primary hover:shadow-md"
            >
              <span className="text-sm font-bold text-store-ink md:text-base">{r.label}</span>
              <span className="mt-1 text-xs font-semibold uppercase tracking-wide text-store-primary">
                Shop now →
              </span>
            </a>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------- app banner
export function AppBannerSection({ banner }: { banner: Banner }) {
  const s = useSiteSettings();
  return (
    <section aria-label={banner.heading ?? "Download our App"} className={SECTION_Y}>
      <Container>
        <div className="relative">
          <BannerImage
            desktop={banner.image}
            mobile={banner.mobile_image}
            placeholderSize={IMAGE_SIZES.app}
            placeholderMobileSize={IMAGE_SIZES.appMobile}
            alt={banner.alt}
            heading={banner.heading}
            subheading={banner.subheading}
            cta={null}
            link={null}
          />
          {(s.appStoreUrl || s.playStoreUrl) && (
            <div className="absolute bottom-4 left-5 flex flex-wrap gap-2 md:bottom-10 md:left-10 lg:left-14">
              {s.appStoreUrl && (
                <StoreBadge href={s.appStoreUrl} small="Download on the" big="App Store" />
              )}
              {s.playStoreUrl && (
                <StoreBadge href={s.playStoreUrl} small="Get it on" big="Google Play" />
              )}
            </div>
          )}
        </div>
      </Container>
    </section>
  );
}

function StoreBadge({ href, small, big }: { href: string; small: string; big: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex h-11 min-w-[140px] flex-col justify-center rounded-lg bg-black px-3 leading-tight text-white hover:bg-neutral-800"
    >
      <span className="text-[10px]">{small}</span>
      <span className="text-sm font-semibold">{big}</span>
    </a>
  );
}
