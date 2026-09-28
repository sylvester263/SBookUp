// Renders homepage sections (from Admin → Homepage) in order. Unknown types
// and sections with nothing to show render nothing. While school features are
// off, banners / slides that link to school pages are dropped.
import { Fragment } from "react";
import { useInView } from "@/lib/use-in-view";
import { useSchoolFeatures } from "@/lib/feature-flags";
import { isKnownType, parseConfig, sectionStatus, type SectionRow } from "@/lib/homepage-sections";
import { isSchoolLink, visibleBanners } from "@/lib/homepage-render";
import { HeroSlider } from "@/components/home/sections/HeroSlider";
import {
  AppBannerSection,
  BannerFullSection,
  BannerPairSection,
  BannerWithProductsSection,
  CategoryCirclesSection,
  PriceBarSection,
  ProductCarouselSection,
  PromoTilesSection,
} from "@/components/home/sections/Sections";

export function HomeSections({
  rows,
  preview = false,
  afterHero,
}: {
  rows: SectionRow[];
  preview?: boolean;
  afterHero?: React.ReactNode;
}) {
  const school = useSchoolFeatures();
  const heroIndex = rows.findIndex((r) => r.type === "hero_slider");
  const firstCarousel = rows.find((r) => r.type === "product_carousel")?.id;
  return (
    <>
      {rows.map((row, i) => (
        <Fragment key={row.id}>
          {preview && sectionStatus(row) !== "live" && <PreviewLabel row={row} />}
          {i < EAGER_SECTIONS ? (
            <Section row={row} school={school} priority={row.id === firstCarousel} />
          ) : (
            <WhenNear>
              <Section row={row} school={school} priority={false} />
            </WhenNear>
          )}
          {i === heroIndex && afterHero}
        </Fragment>
      ))}
      {heroIndex < 0 && afterHero}
    </>
  );
}

/**
 * Sections server-rendered with the page (hero, first carousel, departments).
 * The rest render when the shopper scrolls near them: less HTML to parse and
 * far less to hydrate on load (the main cost on mid-range phones).
 */
const EAGER_SECTIONS = 3;

/** Renders its children once they're within ~1 screen; until then a spacer keeps the page length stable. */
function WhenNear({ children }: { children: React.ReactNode }) {
  const [ref, near] = useInView<HTMLDivElement>("800px");
  if (near) return <>{children}</>;
  return <div ref={ref} aria-hidden="true" className="min-h-[420px]" />;
}

function PreviewLabel({ row }: { row: SectionRow }) {
  const status = sectionStatus(row);
  return (
    <div className="container mx-auto px-4 pt-4">
      <div className="rounded-md border border-dashed border-amber-400 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900">
        Preview only — this section is{" "}
        {status === "off"
          ? "switched off"
          : status === "scheduled"
            ? "scheduled for later"
            : "past its end date"}{" "}
        and hidden from shoppers
        {!isKnownType(row.type) && ` (unknown type "${row.type}")`}
      </div>
    </div>
  );
}

function Section({
  row,
  school,
  priority,
}: {
  row: SectionRow;
  school: boolean;
  priority: boolean;
}) {
  if (!isKnownType(row.type)) return null;
  const common = { id: row.id, title: row.title, subtitle: row.subtitle };
  switch (row.type) {
    case "hero_slider": {
      const c = parseConfig("hero_slider", row.config);
      return (
        <HeroSlider
          slides={visibleBanners(c.slides, school)}
          interval={c.interval_seconds}
          label={row.title ?? "Featured"}
        />
      );
    }
    case "product_carousel": {
      const c = parseConfig("product_carousel", row.config);
      return (
        <ProductCarouselSection {...common} source={c.source} limit={c.limit} priority={priority} />
      );
    }
    case "category_circles": {
      const c = parseConfig("category_circles", row.config);
      return <CategoryCirclesSection {...common} slugs={c.category_slugs} />;
    }
    case "banner_full": {
      const c = parseConfig("banner_full", row.config);
      const [banner] = visibleBanners([c.banner], school);
      return banner ? (
        <BannerFullSection {...common} banner={banner} source={c.source} limit={c.limit} />
      ) : null;
    }
    case "banner_with_products": {
      const c = parseConfig("banner_with_products", row.config);
      const [banner] = visibleBanners([c.banner], school);
      return banner ? (
        <BannerWithProductsSection
          {...common}
          banner={banner}
          side={c.side}
          source={c.source}
          limit={c.limit}
        />
      ) : null;
    }
    case "banner_pair": {
      const c = parseConfig("banner_pair", row.config);
      return <BannerPairSection title={row.title} banners={visibleBanners(c.banners, school)} />;
    }
    case "promo_tiles": {
      const c = parseConfig("promo_tiles", row.config);
      // Hide tiles linking to school pages while school features are off
      return (
        <PromoTilesSection
          title={row.title}
          tiles={school ? c.tiles : c.tiles.filter((t) => !isSchoolLink(t.link))}
        />
      );
    }
    case "price_bar": {
      const c = parseConfig("price_bar", row.config);
      return <PriceBarSection {...common} ranges={c.ranges} />;
    }
    case "app_banner": {
      const c = parseConfig("app_banner", row.config);
      return <AppBannerSection banner={c.banner} />;
    }
  }
}
