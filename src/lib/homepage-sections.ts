// Homepage section builder: section types, their config (validated with Zod on
// save), defaults, recommended image sizes, product sources and scheduling.
// Pure — shared by the admin screen, the server functions and the storefront.
// Unit-tested in homepage-sections.test.ts.
import { z } from "zod";
import { categoryHref, type TreeCategory } from "@/lib/category-path";

export const SECTION_TYPES = [
  "hero_slider",
  "product_carousel",
  "category_circles",
  "banner_full",
  "banner_with_products",
  "banner_pair",
  "promo_tiles",
  "price_bar",
  "app_banner",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export const SECTION_LABELS: Record<SectionType, string> = {
  hero_slider: "Hero slider",
  product_carousel: "Product carousel",
  category_circles: "Shop by Department (category circles)",
  banner_full: "Full-width banner",
  banner_with_products: "Banner + products",
  banner_pair: "Two banners",
  promo_tiles: "Promo tiles (3)",
  price_bar: "Shop by Price",
  app_banner: "Download our App",
};

/** Recommended upload sizes (shown in admin, used for placeholders and width/height). */
export const IMAGE_SIZES = {
  hero: { width: 1920, height: 700 },
  heroMobile: { width: 800, height: 800 },
  full: { width: 1600, height: 300 },
  fullMobile: { width: 800, height: 400 },
  side: { width: 600, height: 420 },
  pair: { width: 900, height: 520 },
  tile: { width: 600, height: 480 },
  circle: { width: 300, height: 300 },
  app: { width: 1920, height: 600 },
  appMobile: { width: 800, height: 600 },
} as const;
export type ImageSlot = keyof typeof IMAGE_SIZES;
export const sizeLabel = (slot: ImageSlot) =>
  `${IMAGE_SIZES[slot].width}×${IMAGE_SIZES[slot].height} px`;

// ---------------------------------------------------------------- schemas
const isSafeUrl = (v: string) =>
  (v.startsWith("/") && !v.startsWith("//")) || /^https?:\/\//i.test(v);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => v || null);

export const imageRefSchema = z.object({
  src: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .refine(isSafeUrl, "Image must be an https:// URL or a /path"),
  width: z.number().int().min(1).max(8000),
  height: z.number().int().min(1).max(8000),
});
export type ImageRef = z.infer<typeof imageRefSchema>;

export const bannerLinkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("category"), slug: z.string().trim().min(1).max(120) }),
  z.object({ type: z.literal("product"), slug: z.string().trim().min(1).max(200) }),
  z.object({
    type: z.literal("listing"),
    href: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v.startsWith("/") && !v.startsWith("//"), "A listing link must start with /"),
  }),
  z.object({
    type: z.literal("url"),
    href: z.string().trim().max(500).refine(isSafeUrl, "Use https://… or a /path"),
  }),
]);

/** A banner. Alt text is required whenever there is an image (accessibility). */
export const bannerSchema = z
  .object({
    image: imageRefSchema.nullable().default(null),
    mobile_image: imageRefSchema.nullable().default(null),
    alt: z.string().trim().max(200).default(""),
    heading: optText(120),
    subheading: optText(200),
    cta: optText(40),
    link: bannerLinkSchema.nullable().default(null),
  })
  .refine((b) => !(b.image || b.mobile_image) || b.alt.length > 0, {
    message: "Alt text is required for every banner image",
    path: ["alt"],
  });
export type Banner = z.infer<typeof bannerSchema>;

export const PRODUCT_SOURCES = [
  "category",
  "new_arrivals",
  "recently_added",
  "best_sellers",
  "on_sale",
  "manual",
] as const;
export const SOURCE_LABELS: Record<(typeof PRODUCT_SOURCES)[number], string> = {
  category: "A category (with its sub-categories)",
  new_arrivals: "New arrivals",
  recently_added: "Recently added",
  best_sellers: "Best sellers",
  on_sale: "On sale (deals)",
  manual: "Hand-picked products",
};

export const sourceSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("category"),
    slug: z.string().trim().min(1, "Choose a category").max(120),
  }),
  z.object({ type: z.literal("new_arrivals") }),
  z.object({ type: z.literal("recently_added") }),
  z.object({ type: z.literal("best_sellers") }),
  z.object({ type: z.literal("on_sale") }),
  z.object({ type: z.literal("manual"), product_ids: z.array(z.string().uuid()).max(48) }),
]);
export type ProductSource = z.infer<typeof sourceSchema>;

const limit = z.number().int().min(1).max(24).default(12);
const hex = z
  .string()
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #0E7C7B");

export const promoTileSchema = z
  .object({
    image: imageRefSchema.nullable().default(null),
    alt: z.string().trim().max(200).default(""),
    title: z.string().trim().min(1, "Tile title is required").max(60),
    cta: z.string().trim().min(1).max(30).default("SHOP DEALS"),
    color: hex.default("#0E7C7B"),
    link: bannerLinkSchema.nullable().default(null),
  })
  .refine((t) => !t.image || t.alt.length > 0, {
    message: "Alt text is required for every tile image",
    path: ["alt"],
  });
export type PromoTile = z.infer<typeof promoTileSchema>;

export const priceRangeSchema = z
  .object({
    label: z.string().trim().min(1).max(40),
    min: z.number().min(0).nullable(),
    max: z.number().min(0).nullable(),
  })
  .refine((r) => r.min == null || r.max == null || r.max > r.min, {
    message: "Max must be above min",
    path: ["max"],
  });
export type PriceRange = z.infer<typeof priceRangeSchema>;

export const CONFIG_SCHEMAS = {
  hero_slider: z.object({
    slides: z.array(bannerSchema).max(10).default([]),
    interval_seconds: z.number().int().min(2).max(20).default(5),
  }),
  product_carousel: z.object({ source: sourceSchema, limit }),
  category_circles: z.object({
    category_slugs: z.array(z.string().trim().min(1).max(120)).max(30).default([]),
  }),
  banner_full: z.object({
    banner: bannerSchema,
    source: sourceSchema.nullable().default(null),
    limit,
  }),
  banner_with_products: z.object({
    banner: bannerSchema,
    side: z.enum(["left", "right"]).default("left"),
    source: sourceSchema,
    limit,
  }),
  banner_pair: z.object({ banners: z.tuple([bannerSchema, bannerSchema]) }),
  promo_tiles: z.object({ tiles: z.array(promoTileSchema).length(3) }),
  price_bar: z.object({ ranges: z.array(priceRangeSchema).min(1).max(8) }),
  app_banner: z.object({ banner: bannerSchema }),
} satisfies Record<SectionType, z.ZodTypeAny>;

export type SectionConfig = { [K in SectionType]: z.infer<(typeof CONFIG_SCHEMAS)[K]> };

export const sectionBaseSchema = z.object({
  id: z.string().uuid().optional(),
  type: z.enum(SECTION_TYPES),
  title: optText(120),
  subtitle: optText(200),
  is_active: z.boolean().default(true),
  starts_at: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .transform((v) => v ?? null),
  ends_at: z
    .string()
    .datetime({ offset: true })
    .nullish()
    .transform((v) => v ?? null),
  config: z.record(z.unknown()),
});

/** Validates a section from the admin form; returns the cleaned section or throws a readable error. */
export function validateSection(input: unknown) {
  const base = sectionBaseSchema.parse(input);
  if (base.starts_at && base.ends_at && new Date(base.ends_at) <= new Date(base.starts_at)) {
    throw new Error("The end date must be after the start date");
  }
  const cfg = CONFIG_SCHEMAS[base.type].safeParse(base.config);
  if (!cfg.success) {
    const issue = cfg.error.issues[0];
    throw new Error(`${issue.path.length ? issue.path.join(" › ") + ": " : ""}${issue.message}`);
  }
  return { ...base, config: cfg.data as Record<string, unknown> };
}

// ---------------------------------------------------------------- defaults
export const emptyBanner = (): Banner => ({
  image: null,
  mobile_image: null,
  alt: "",
  heading: null,
  subheading: null,
  cta: "Shop Now",
  link: null,
});

export const DEFAULT_PRICE_RANGES: PriceRange[] = [
  { label: "Under Rs. 500", min: null, max: 500 },
  { label: "Rs. 500 – 1,000", min: 500, max: 1000 },
  { label: "Rs. 1,000 – 2,500", min: 1000, max: 2500 },
  { label: "Rs. 2,500 – 5,000", min: 2500, max: 5000 },
  { label: "Rs. 5,000+", min: 5000, max: null },
];

/** A new section of this type, ready to edit. */
export function defaultConfig<T extends SectionType>(type: T): SectionConfig[T] {
  const d: { [K in SectionType]: SectionConfig[K] } = {
    hero_slider: {
      slides: [{ ...emptyBanner(), heading: "New season, new supplies" }],
      interval_seconds: 5,
    },
    product_carousel: { source: { type: "new_arrivals" }, limit: 12 },
    category_circles: { category_slugs: [] },
    banner_full: { banner: emptyBanner(), source: null, limit: 12 },
    banner_with_products: {
      banner: emptyBanner(),
      side: "left",
      source: { type: "best_sellers" },
      limit: 12,
    },
    banner_pair: { banners: [emptyBanner(), emptyBanner()] },
    promo_tiles: {
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
    price_bar: { ranges: DEFAULT_PRICE_RANGES },
    app_banner: { banner: { ...emptyBanner(), heading: "Download our App", cta: null } },
  };
  return d[type];
}

/** Storefront: the section's config, or the type's defaults if stored data is invalid (never crashes the page). */
export function parseConfig<T extends SectionType>(type: T, raw: unknown): SectionConfig[T] {
  const r = CONFIG_SCHEMAS[type].safeParse(raw);
  return (r.success ? r.data : defaultConfig(type)) as SectionConfig[T];
}

// ---------------------------------------------------------------- scheduling
export type SectionRow = {
  id: string;
  type: string;
  title: string | null;
  subtitle: string | null;
  config: unknown;
  sort_order: number;
  is_active: boolean;
  starts_at: string | null;
  ends_at: string | null;
};

export type SectionStatus = "live" | "off" | "scheduled" | "ended";

/** Same rule as the public read policy: active and within starts_at / ends_at. */
export function sectionStatus(
  s: Pick<SectionRow, "is_active" | "starts_at" | "ends_at">,
  now = new Date(),
): SectionStatus {
  if (!s.is_active) return "off";
  if (s.starts_at && new Date(s.starts_at) > now) return "scheduled";
  if (s.ends_at && new Date(s.ends_at) <= now) return "ended";
  return "live";
}

export const isKnownType = (t: string): t is SectionType =>
  (SECTION_TYPES as readonly string[]).includes(t);

// ---------------------------------------------------------------- sources
/** The "View all" link for a product source (null for hand-picked products). */
export function viewAllHref(source: ProductSource, cats: TreeCategory[] = []): string | null {
  switch (source.type) {
    case "category":
      return categoryHref(cats, source.slug);
    case "new_arrivals":
      return "/shop";
    case "recently_added":
      return "/shop";
    case "best_sellers":
      return `/shop?sort=${encodeURIComponent(JSON.stringify("best_sellers"))}`;
    case "on_sale":
      return "/shop?on_sale=true";
    case "manual":
      return null;
  }
}

/** catalog_search request for a source (manual sources are loaded by id instead). */
export function sourceSearchParams(
  source: Exclude<ProductSource, { type: "manual" }>,
  limitN: number,
) {
  const base = {
    page: 1,
    per_page: limitN,
    filters: {},
    q: null,
    min_price: null,
    max_price: null,
    types: null,
  };
  switch (source.type) {
    case "category":
      return { ...base, category: source.slug, sort: "new_arrivals", only: null };
    case "new_arrivals":
      return { ...base, category: null, sort: "new_arrivals", only: "new_arrivals" };
    // catalog_search orders unknown sorts by newest first
    case "recently_added":
      return { ...base, category: null, sort: "newest", only: null };
    case "best_sellers":
      return { ...base, category: null, sort: "best_sellers", only: "best_sellers" };
    case "on_sale":
      return { ...base, category: null, sort: "new_arrivals", only: "on_sale" };
  }
}
