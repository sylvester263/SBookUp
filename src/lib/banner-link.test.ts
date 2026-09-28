import { describe, expect, test } from "vitest";
import { resolveBannerLink } from "@/lib/banner-link";

const cats = [
  { id: "s", slug: "stationery", parent_id: null },
  { id: "n", slug: "notebooks", parent_id: "s" },
  { id: "b", slug: "books", parent_id: null },
];

describe("resolveBannerLink", () => {
  test("category: nested path from the tree", () => {
    expect(resolveBannerLink({ type: "category", slug: "notebooks" }, cats)).toEqual({
      href: "/shop/stationery/notebooks",
      external: false,
    });
    expect(resolveBannerLink({ type: "category", slug: "books" }, cats)).toEqual({
      href: "/shop/books",
      external: false,
    });
    expect(resolveBannerLink({ type: "category", slug: "books" })).toEqual({
      href: "/shop/books",
      external: false,
    });
  });

  test("product", () => {
    expect(resolveBannerLink({ type: "product", slug: "black-beauty" })).toEqual({
      href: "/product/black-beauty",
      external: false,
    });
  });

  test("listing: same-site paths only", () => {
    expect(resolveBannerLink({ type: "listing", href: "/shop/books?sort=best_sellers" })).toEqual({
      href: "/shop/books?sort=best_sellers",
      external: false,
    });
    expect(resolveBannerLink({ type: "listing", href: "//evil.com/x" })).toBeNull();
    expect(resolveBannerLink({ type: "listing", href: "https://evil.com" })).toBeNull();
  });

  test("url: http(s) opens externally, site paths stay internal", () => {
    expect(resolveBannerLink({ type: "url", href: "https://example.com/a" })).toEqual({
      href: "https://example.com/a",
      external: true,
    });
    expect(resolveBannerLink({ type: "url", href: "/about" })).toEqual({
      href: "/about",
      external: false,
    });
  });

  test("unsafe or empty links are refused", () => {
    expect(resolveBannerLink({ type: "url", href: "javascript:alert(1)" })).toBeNull();
    expect(resolveBannerLink({ type: "url", href: "data:text/html,x" })).toBeNull();
    expect(resolveBannerLink({ type: "url", href: "not a url" })).toBeNull();
    expect(resolveBannerLink({ type: "category", slug: "" })).toBeNull();
    expect(resolveBannerLink(null)).toBeNull();
  });
});
