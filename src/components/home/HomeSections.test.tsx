// Homepage section rendering, one test per section type, plus hiding rules.
// Rendered to HTML with pre-filled query data (no network); router, server
// functions, auth and the "near the screen" trigger are stubbed.
import { describe, expect, test, vi } from "vitest";
import { renderToString } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    params,
    children,
    ...rest
  }: {
    to: string;
    params?: Record<string, string>;
    children: React.ReactNode;
  }) => {
    const href = Object.entries(params ?? {}).reduce((h, [k, v]) => h.replace(`$${k}`, v), to);
    return (
      <a href={href} {...rest}>
        {children}
      </a>
    );
  },
  useNavigate: () => () => {},
}));
vi.mock("@tanstack/react-start", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/auth-context", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/lib/use-in-view", () => ({ useInView: () => [{ current: null }, true] }));

import { HomeSections } from "@/components/home/HomeSections";
import { storeSettingsQueryOptions } from "@/lib/feature-flags";
import { navCategoriesQuery } from "@/lib/shop";
import { sectionProductsQuery } from "@/lib/homepage-queries";
import type { CardItem } from "@/components/store/ProductCard";
import { defaultConfig, type ProductSource, type SectionRow } from "@/lib/homepage-sections";

const CATS = [
  {
    id: "b",
    name: "Books",
    slug: "books",
    parent_id: null,
    display_order: 1,
    show_in_nav: true,
    show_on_home: true,
    image_url: null,
    description: null,
    seo_title: null,
    seo_description: null,
  },
  {
    id: "g",
    name: "Gifts",
    slug: "gifts",
    parent_id: null,
    display_order: 2,
    show_in_nav: true,
    show_on_home: true,
    image_url: "https://cdn.example.com/gifts.webp",
    description: null,
    seo_title: null,
    seo_description: null,
  },
];
const product = (n: number) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  name: `Product ${n}`,
  slug: `product-${n}`,
  price: 1000 + n,
  sale_price: null,
  images: [],
  stock_quantity: 5,
  sell_unit: "item",
  pack_size: null,
  unit_label: null,
  variant_count: 0,
});

function render(
  rows: SectionRow[],
  data: { source: ProductSource; limit: number; items: unknown[] }[] = [],
  opts: { school?: boolean; preview?: boolean } = {},
) {
  const qc = new QueryClient();
  qc.setQueryData(storeSettingsQueryOptions.queryKey, {
    store_name: "Test Store",
    school_features_enabled: !!opts.school,
  });
  qc.setQueryData(navCategoriesQuery.queryKey, CATS);
  for (const d of data) qc.setQueryData(sectionProductsQuery(d.source, d.limit).queryKey, d.items as CardItem[]);
  return renderToString(
    <QueryClientProvider client={qc}>
      <HomeSections rows={rows} preview={opts.preview} />
    </QueryClientProvider>,
  );
}
const row = (type: string, config: unknown, extra: Partial<SectionRow> = {}): SectionRow => ({
  id: `${type}-1`,
  type,
  title: `Title ${type}`,
  subtitle: null,
  config,
  sort_order: 1,
  is_active: true,
  starts_at: null,
  ends_at: null,
  ...extra,
});
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ");

describe("section types", () => {
  test("hero_slider: slides, labelled controls, first slide only is focusable", () => {
    const html = render([row("hero_slider", defaultConfig("hero_slider"))]);
    expect(html).toContain('aria-roledescription="carousel"');
    expect(text(html)).toContain("New season, new supplies");
    const cfg = {
      interval_seconds: 5,
      slides: [
        { alt: "", heading: "One" },
        { alt: "", heading: "Two" },
      ],
    };
    const two = render([row("hero_slider", cfg)]);
    expect(two).toContain('aria-label="Next slide"');
    expect(two).toContain('aria-label="Go to slide 2"');
    expect(two.match(/inert=""/g)).toHaveLength(1);
  });

  test("product_carousel: products, prices, View all; hidden when the source is empty", () => {
    const src = { type: "best_sellers" } as const;
    const html = render(
      [row("product_carousel", { source: src, limit: 12 })],
      [{ source: src, limit: 12, items: [product(1), product(2)] }],
    );
    expect(text(html)).toContain("Title product_carousel");
    expect(text(html)).toContain("Product 1");
    expect(html).toContain("Rs.1,001.00");
    expect(html).toContain('href="/shop?sort=%22best_sellers%22"');
    expect(
      render(
        [row("product_carousel", { source: src, limit: 12 })],
        [{ source: src, limit: 12, items: [] }],
      ),
    ).toBe("");
  });

  test("category_circles: chosen categories in order; image or icon; missing slugs skipped", () => {
    const html = render([row("category_circles", { category_slugs: ["gifts", "nope", "books"] })]);
    const t = text(html);
    expect(t.indexOf("Gifts")).toBeLessThan(t.indexOf("Books"));
    expect(html).toContain('src="https://cdn.example.com/gifts.webp"');
    expect(html).toContain('href="/shop/books"');
    expect(render([row("category_circles", { category_slugs: ["nope"] })])).toBe("");
  });

  test("banner_full: banner (placeholder until an image is uploaded) + carousel; empty carousel keeps the banner", () => {
    const src = { type: "category", slug: "books" } as const;
    const cfg = {
      banner: {
        alt: "",
        heading: "Books Collection",
        cta: "Shop Books",
        link: { type: "category", slug: "books" },
      },
      source: src,
      limit: 12,
    };
    const html = render(
      [row("banner_full", cfg)],
      [{ source: src, limit: 12, items: [product(3)] }],
    );
    expect(text(html)).toContain("Books Collection");
    expect(text(html)).toContain("Product 3");
    const empty = render([row("banner_full", cfg)], [{ source: src, limit: 12, items: [] }]);
    expect(text(empty)).toContain("Books Collection");
    expect(text(empty)).not.toContain("Product");
  });

  test("banner_with_products: side left / right; hidden when the source is empty", () => {
    const src = { type: "category", slug: "gifts" } as const;
    const cfg = (side: string) => ({
      side,
      banner: { alt: "", heading: "Gifts" },
      source: src,
      limit: 12,
    });
    const left = render(
      [row("banner_with_products", cfg("left"))],
      [{ source: src, limit: 12, items: [product(4)] }],
    );
    expect(left).toContain("lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]");
    const right = render(
      [row("banner_with_products", cfg("right"))],
      [{ source: src, limit: 12, items: [product(4)] }],
    );
    expect(right).toContain("lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]");
    expect(
      render([row("banner_with_products", cfg("left"))], [{ source: src, limit: 12, items: [] }]),
    ).toBe("");
  });

  test("banner_pair: two banners with real images and alt text", () => {
    const img = { src: "https://cdn.example.com/a.webp", width: 900, height: 520 };
    const html = render([
      row("banner_pair", {
        banners: [
          { image: img, alt: "Toy shelf", heading: "Toys" },
          { alt: "", heading: "Costumes" },
        ],
      }),
    ]);
    expect(html).toContain('alt="Toy shelf"');
    expect(html).toContain('width="900"');
    expect(text(html)).toContain("Costumes");
  });

  test("promo_tiles: 3 tiles, colour and readable text", () => {
    const html = render([row("promo_tiles", defaultConfig("promo_tiles"))]);
    const t = text(html);
    for (const title of ["Deals & Discounts", "Gift Ideas", "Web Exclusive"])
      expect(t).toContain(title);
    expect(html).toContain('fill="#0E7C7B"');
    expect(html).toContain('href="/shop?on_sale=true"');
  });

  test("price_bar: range links", () => {
    const html = render([row("price_bar", defaultConfig("price_bar"))]);
    expect(html).toContain('href="/shop?max=500"');
    expect(html).toContain('href="/shop?min=5000"');
  });

  test("app_banner: renders; store badges only when links are set", () => {
    const html = render([row("app_banner", defaultConfig("app_banner"))]);
    expect(text(html)).toContain("Download our App");
    expect(text(html)).not.toContain("Google Play");
  });

  test("unknown types render nothing", () => {
    expect(render([row("carousel_3d", {})])).toBe("");
  });
});

describe("hiding rules", () => {
  test("links to school pages are hidden while school features are off", () => {
    const cfg = {
      interval_seconds: 5,
      slides: [
        { alt: "", heading: "Find your school", link: { type: "url", href: "/schools" } },
        { alt: "", heading: "Gifts", link: { type: "category", slug: "gifts" } },
      ],
    };
    expect(text(render([row("hero_slider", cfg)]))).not.toContain("Find your school");
    expect(text(render([row("hero_slider", cfg)], [], { school: true }))).toContain(
      "Find your school",
    );
  });

  test("preview labels sections shoppers can't see", () => {
    const off = row("price_bar", defaultConfig("price_bar"), { is_active: false });
    expect(text(render([off], [], { preview: true }))).toContain("switched off");
    const later = row("price_bar", defaultConfig("price_bar"), {
      starts_at: "2999-01-01T00:00:00Z",
    });
    expect(text(render([later], [], { preview: true }))).toContain("scheduled for later");
    expect(
      text(render([row("price_bar", defaultConfig("price_bar"))], [], { preview: true })),
    ).not.toContain("Preview only");
  });
});
