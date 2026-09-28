import { describe, expect, it } from "vitest";
import { breadcrumbJsonLd, isFilteredListing, jsonLd, listingCanonical, listingHead, productJsonLd, variantPrice } from "./seo";

const BASE = "https://shop.pk";
const stationery = { id: "s", slug: "stationery", parent_id: null, name: "Stationery", seo_title: "Stationery Online", seo_description: "Pens, notebooks…" };
const notebooks = { id: "n", slug: "notebooks", parent_id: "s", name: "Notebooks", description: "<p>Spiral &amp; bound</p>" };

describe("listing canonical", () => {
  it("filtered, searched or sorted views point at the plain category page", () => {
    expect(listingCanonical("/shop/books", { f: { author: ["Umera Ahmed"] } })).toBe("/shop/books");
    expect(listingCanonical("/shop/books", { min: 100, page: 3 })).toBe("/shop/books");
    expect(listingCanonical("/shop/books", { sort: "price_asc" })).toBe("/shop/books");
    expect(listingCanonical("/shop/books", { q: "maths" })).toBe("/shop/books");
    expect(listingCanonical("/shop/gifts", { type: ["gift-bags"] })).toBe("/shop/gifts");
  });
  it("keeps the page number on unfiltered pages", () => {
    expect(listingCanonical("/shop/books", { page: 2 })).toBe("/shop/books?page=2");
    expect(listingCanonical("/shop/books", { page: 1, sort: "new_arrivals" })).toBe("/shop/books");
    expect(isFilteredListing({ f: { author: [] } })).toBe(false);
  });
});

describe("category <head>", () => {
  it("uses the category's SEO title/description, canonical and breadcrumbs", () => {
    const h = listingHead([stationery], { f: { binding_type: ["Spiral"] } }, BASE);
    expect(h.meta[0]).toEqual({ title: "Stationery Online — SchoolBooksExperts" });
    expect(h.meta[1]).toEqual({ name: "description", content: "Pens, notebooks…" });
    expect(h.links[0]).toEqual({ rel: "canonical", href: "https://shop.pk/shop/stationery" });
  });
  it("sub-category: falls back to name/description, canonical /shop/<parent>/<child>", () => {
    const h = listingHead([stationery, notebooks], { page: 2 }, BASE);
    expect(h.meta[0].title).toBe("Notebooks — Page 2 — SchoolBooksExperts");
    expect(h.meta[1].content).toBe("Spiral & bound");
    expect(h.links[0].href).toBe("https://shop.pk/shop/stationery/notebooks?page=2");
    const ld = JSON.parse(h.scripts[0].children);
    expect(ld.itemListElement.map((i: any) => i.item)).toEqual(["https://shop.pk/", "https://shop.pk/shop", "https://shop.pk/shop/stationery", "https://shop.pk/shop/stationery/notebooks"]);
    expect(ld.itemListElement.map((i: any) => i.position)).toEqual([1, 2, 3, 4]);
  });
  it("/shop itself", () => {
    expect(listingHead([], {}, BASE).links[0].href).toBe("https://shop.pk/shop");
  });
});

describe("JSON-LD", () => {
  it("BreadcrumbList", () => {
    expect(breadcrumbJsonLd([{ name: "Home", path: "/" }], BASE)).toEqual({
      "@context": "https://schema.org", "@type": "BreadcrumbList",
      itemListElement: [{ "@type": "ListItem", position: 1, name: "Home", item: "https://shop.pk/" }],
    });
  });

  it("simple product: one Offer at the sale price, stock → availability, ISBN → gtin13", () => {
    const ld: any = productJsonLd({ name: "Maths 5", slug: "maths-5", price: 500, sale_price: 450, stock_quantity: 0, isbn: "978-0-19-123456-7", publisher: "Oxford", images: ["https://img/1.jpg"] }, BASE);
    expect(ld["@type"]).toBe("Product");
    expect(ld.offers).toMatchObject({ "@type": "Offer", price: 450, priceCurrency: "PKR", availability: "https://schema.org/OutOfStock", url: "https://shop.pk/product/maths-5" });
    expect(ld.gtin13).toBe("9780191234567");
    expect(ld.brand).toEqual({ "@type": "Brand", name: "Oxford" });
  });

  it("variants: one Offer per active variant inside an AggregateOffer", () => {
    const ld: any = productJsonLd({
      name: "Spider-Man Costume", slug: "spidey", price: 2000, sale_price: 1800, stock_quantity: 0,
      variants: [
        { id: "a", name: "6-7Y / Red", price: 2500, stock: 2, sku: "SP-67-R" },
        { id: "b", name: "4-5Y / Red", price: null, price_modifier: -300, stock: 0 },
        { id: "c", name: "8-9Y / Red", price: 9999, stock: 5, is_active: false },
      ],
    }, BASE);
    expect(ld.offers["@type"]).toBe("AggregateOffer");
    expect(ld.offers.offerCount).toBe(2);
    expect(ld.offers.lowPrice).toBe(1500); // sale 1800 − 300
    expect(ld.offers.highPrice).toBe(2500);
    expect(ld.offers.offers[0]).toMatchObject({ name: "6-7Y / Red", sku: "SP-67-R", price: 2500, availability: "https://schema.org/InStock" });
    expect(ld.offers.offers[1]).toMatchObject({ price: 1500, availability: "https://schema.org/OutOfStock" });
  });

  it("packs: price per pack with the pack size as reference quantity", () => {
    const ld: any = productJsonLd({ name: "Floral Wrap", slug: "floral-wrap", price: 600, stock_quantity: 4, sell_unit: "pack", pack_size: 6, unit_label: "sheet" }, BASE);
    expect(ld.offers.price).toBe(600);
    expect(ld.offers.priceSpecification.referenceQuantity).toEqual({ "@type": "QuantitativeValue", value: 6, unitText: "sheet" });
  });

  it("can't close the <script> tag from product text", () => {
    const out = jsonLd(productJsonLd({ name: "</script><script>alert(1)</script>", slug: "x", price: 1 }, BASE));
    expect(out).not.toContain("</script>");
    expect(JSON.parse(out).name).toBe("</script><script>alert(1)</script>");
  });
});

describe("variant pricing matches the server rule", () => {
  it("variant price wins; otherwise (sale) base + modifier", () => {
    expect(variantPrice({ price: 1000, sale_price: null }, { id: "v", name: "v", price: 1200 })).toBe(1200);
    expect(variantPrice({ price: 1000, sale_price: 800 }, { id: "v", name: "v", price_modifier: 150 })).toBe(950);
    expect(variantPrice({ price: 1000, sale_price: 1200 }, { id: "v", name: "v", price_modifier: 0 })).toBe(1000); // a higher "sale" is ignored
  });
});
