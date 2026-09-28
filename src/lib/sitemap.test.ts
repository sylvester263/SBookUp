import { describe, expect, it } from "vitest";
import { buildRobotsTxt, buildSitemapXml, resolveBaseUrl } from "./sitemap";

const cat = (id: string, slug: string, parent_id: string | null, updated_at?: string) => ({ id, slug, parent_id, updated_at });

describe("sitemap", () => {
  it("uses SITE_URL without trailing slash, else the request origin", () => {
    expect(resolveBaseUrl("https://shop.pk/", "http://localhost:3000/sitemap.xml")).toBe("https://shop.pk");
    expect(resolveBaseUrl(undefined, "http://localhost:3000/sitemap.xml")).toBe("http://localhost:3000");
  });

  it("builds absolute URLs for every page type with lastmod dates", () => {
    const xml = buildSitemapXml("https://shop.pk", {
      products: [{ slug: "maths-5", updated_at: "2026-09-01T10:00:00Z" }],
      categories: [cat("1", "books", null, "2026-08-01T00:00:00Z")],
      bundles: [{ slug: "class-5", updated_at: null }],
      schools: [{ slug: "allied-school", updated_at: "2026-07-01T00:00:00Z" }],
      schoolFeatures: true,
    });
    expect(xml).toContain("<loc>https://shop.pk/product/maths-5</loc><lastmod>2026-09-01</lastmod>");
    expect(xml).toContain("<loc>https://shop.pk/shop/books</loc><lastmod>2026-08-01</lastmod>");
    expect(xml).toContain("<loc>https://shop.pk/schools/allied-school</loc><lastmod>2026-07-01</lastmod>");
    expect(xml).toContain("<loc>https://shop.pk/bundle/class-5</loc>");
    expect(xml).toContain("<loc>https://shop.pk/shop</loc>");
    expect(xml).toContain("<loc>https://shop.pk/</loc>");
    expect(xml).not.toContain("/category/");
    expect(xml).not.toContain("<loc>https://shop.pk/products</loc>");
    expect(xml).not.toMatch(/<loc>\//); // no relative URLs
  });

  it("lists sub-categories at /shop/<parent>/<child> and skips ones under a hidden parent", () => {
    const xml = buildSitemapXml("https://shop.pk", {
      products: [],
      categories: [cat("s", "stationery", null), cat("n", "notebooks", "s"), cat("x", "orphan", "hidden-parent-id")],
      bundles: [], schools: [],
    });
    expect(xml).toContain("<loc>https://shop.pk/shop/stationery</loc>");
    expect(xml).toContain("<loc>https://shop.pk/shop/stationery/notebooks</loc>");
    expect(xml).not.toContain("orphan");
  });

  it("escapes unsafe characters in slugs", () => {
    const xml = buildSitemapXml("https://shop.pk", { products: [{ slug: "a&b<c" }], categories: [cat("1", "x&y", null)], bundles: [], schools: [] });
    expect(xml).toContain("/product/a%26b%3Cc");
    expect(xml).toContain("/shop/x%26y");
    expect(xml).not.toContain("a&b<c");
  });

  it("leaves out /schools, school pages and bundles while school features are hidden", () => {
    const xml = buildSitemapXml("https://shop.pk", {
      products: [{ slug: "maths-5" }],
      categories: [cat("1", "books", null)],
      bundles: [{ slug: "class-5" }],
      schools: [{ slug: "allied-school" }],
      schoolFeatures: false,
    });
    expect(xml).toContain("/product/maths-5");
    expect(xml).toContain("/shop/books");
    expect(xml).not.toContain("/schools");
    expect(xml).not.toContain("/bundle/");
  });

  it("robots.txt points to the sitemap", () => {
    expect(buildRobotsTxt("https://shop.pk")).toContain("Sitemap: https://shop.pk/sitemap.xml");
  });
});
