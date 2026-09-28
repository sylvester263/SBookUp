// The default homepage (the reference layout). Seeded into homepage_sections by
// 20260928130000_homepage_default_sections.sql; also the fallback the storefront
// renders when the table is missing or empty. A test checks both stay identical.
import type { SectionRow } from "@/lib/homepage-sections";

const b = (
  heading: string,
  subheading: string | null,
  cta: string | null,
  slug: string | null,
) => ({
  image: null,
  mobile_image: null,
  alt: "",
  heading,
  subheading,
  cta,
  link: slug ? { type: "category", slug } : null,
});

type Default = Omit<SectionRow, "id" | "starts_at" | "ends_at"> & { seed_key: string };

export const DEFAULT_HOME_LAYOUT: Default[] = [
  {
    seed_key: "home_default_hero",
    type: "hero_slider",
    title: "Hero",
    subtitle: null,
    sort_order: 10,
    is_active: true,
    config: {
      interval_seconds: 5,
      slides: [
        b(
          "Back to School Stationery",
          "Notebooks, sketch books and drafting pads for the new session",
          "Shop Now",
          "stationery",
        ),
        b(
          "Gifts for Every Occasion",
          "Wrapping sheets, gift bags and money folders",
          "Shop Now",
          "gifts",
        ),
        b(
          "Character Costumes",
          "Dress-up favourites for every age",
          "Shop Now",
          "character-costumes",
        ),
      ],
    },
  },
  {
    seed_key: "home_default_new_arrivals",
    type: "product_carousel",
    title: "New Arrivals",
    subtitle: null,
    sort_order: 20,
    is_active: true,
    config: { source: { type: "new_arrivals" }, limit: 12 },
  },
  {
    seed_key: "home_default_departments",
    type: "category_circles",
    title: "Shop by Department",
    subtitle: null,
    sort_order: 30,
    is_active: true,
    config: {
      category_slugs: [
        "books",
        "notebooks",
        "sketch-books",
        "drafting-pads",
        "gift-wrapping-sheets",
        "gift-bags",
        "money-folders",
        "toys-games",
        "sports-items",
        "character-costumes",
      ],
    },
  },
  {
    seed_key: "home_default_books",
    type: "banner_full",
    title: "Books Collection",
    subtitle: null,
    sort_order: 40,
    is_active: true,
    config: {
      banner: b("Books Collection", "Classics, readers and more", "Shop Books", "books"),
      source: { type: "category", slug: "books" },
      limit: 12,
    },
  },
  {
    seed_key: "home_default_stationery",
    type: "banner_with_products",
    title: "Stationery",
    subtitle: null,
    sort_order: 50,
    is_active: true,
    config: {
      side: "left",
      banner: b("Stationery", "Everything for the school bag", "Shop Stationery", "stationery"),
      source: { type: "category", slug: "stationery" },
      limit: 12,
    },
  },
  {
    seed_key: "home_default_pair",
    type: "banner_pair",
    title: "Toys & Games | Character Costumes",
    subtitle: null,
    sort_order: 60,
    is_active: true,
    config: {
      banners: [
        b("Toys & Games", null, "Shop Now", "toys-games"),
        b("Character Costumes", null, "Shop Now", "character-costumes"),
      ],
    },
  },
  {
    seed_key: "home_default_gifts",
    type: "banner_with_products",
    title: "Gifts",
    subtitle: null,
    sort_order: 70,
    is_active: true,
    config: {
      side: "right",
      banner: b("Gifts", "Wrap it, bag it, gift it", "Shop Gifts", "gifts"),
      source: { type: "category", slug: "gifts" },
      limit: 12,
    },
  },
  {
    seed_key: "home_default_sports",
    type: "banner_full",
    title: "Sports Items",
    subtitle: null,
    sort_order: 80,
    is_active: true,
    config: {
      banner: b("Sports Items", "Bats, balls, rackets and more", "Shop Sports", "sports-items"),
      source: { type: "category", slug: "sports-items" },
      limit: 12,
    },
  },
  {
    seed_key: "home_default_price_bar",
    type: "price_bar",
    title: "Shop by Price",
    subtitle: null,
    sort_order: 90,
    is_active: true,
    config: {
      ranges: [
        { label: "Under Rs. 500", min: null, max: 500 },
        { label: "Rs. 500 – 1,000", min: 500, max: 1000 },
        { label: "Rs. 1,000 – 2,500", min: 1000, max: 2500 },
        { label: "Rs. 2,500 – 5,000", min: 2500, max: 5000 },
        { label: "Rs. 5,000+", min: 5000, max: null },
      ],
    },
  },
  {
    seed_key: "home_default_best_sellers",
    type: "product_carousel",
    title: "Best Sellers",
    subtitle: null,
    sort_order: 100,
    is_active: true,
    config: { source: { type: "best_sellers" }, limit: 12 },
  },
  {
    seed_key: "home_default_recently_added",
    type: "product_carousel",
    title: "Recently Added",
    subtitle: null,
    sort_order: 110,
    is_active: true,
    config: { source: { type: "recently_added" }, limit: 12 },
  },
  {
    seed_key: "home_default_promo_tiles",
    type: "promo_tiles",
    title: "Promotions",
    subtitle: null,
    sort_order: 120,
    is_active: true,
    config: {
      tiles: [
        {
          image: null,
          alt: "",
          title: "Deals & Discounts",
          cta: "SHOP DEALS",
          color: "#0E7C7B",
          link: { type: "listing", href: "/shop?on_sale=true" },
        },
        {
          image: null,
          alt: "",
          title: "Gift Ideas",
          cta: "SHOP DEALS",
          color: "#B7472A",
          link: { type: "category", slug: "gifts" },
        },
        {
          image: null,
          alt: "",
          title: "Web Exclusive",
          cta: "SHOP DEALS",
          color: "#3D5A98",
          link: { type: "listing", href: "/shop" },
        },
      ],
    },
  },
  {
    seed_key: "home_default_app",
    type: "app_banner",
    title: "Download our App",
    subtitle: null,
    sort_order: 130,
    is_active: false,
    config: {
      banner: {
        ...b("Download our App", "Shop faster, track orders and get app-only offers", null, null),
      },
    },
  },
];

/** The fallback layout as rows the renderer understands (inactive ones dropped). */
export function defaultSectionRows(): SectionRow[] {
  return DEFAULT_HOME_LAYOUT.filter((s) => s.is_active).map(({ seed_key, ...s }) => ({
    ...s,
    id: seed_key,
    starts_at: null,
    ends_at: null,
  }));
}
