import { describe, expect, it } from "vitest";
import { isNotFound } from "@tanstack/react-router";
import { assertSchoolFeaturesOrNotFound, isSchoolFeatureHref, schoolFeaturesEnabled } from "./feature-flags";
import { isBundleLine } from "./use-hidden-bundle-purge";

describe("school_features_enabled flag", () => {
  it("is off unless explicitly true", () => {
    expect(schoolFeaturesEnabled(null)).toBe(false);
    expect(schoolFeaturesEnabled({})).toBe(false);
    expect(schoolFeaturesEnabled({ school_features_enabled: false })).toBe(false);
    expect(schoolFeaturesEnabled({ school_features_enabled: "true" })).toBe(false);
    expect(schoolFeaturesEnabled({ school_features_enabled: true })).toBe(true);
  });

  it("recognises links to school-feature pages (hidden from nav, footer, banners)", () => {
    for (const h of ["/schools", "/schools/allied-school", "/bundle/class-5", "/bundles", "#bundles", "https://shop.pk/schools?x=1"]) {
      expect(isSchoolFeatureHref(h), h).toBe(true);
    }
    for (const h of ["/", "/category/books", "/product/school-bag", "/schoolbags", "/about", null, undefined, ""]) {
      expect(isSchoolFeatureHref(h), String(h)).toBe(false);
    }
  });

  it("school/bundle routes 404 when hidden and load when enabled", () => {
    let err: unknown;
    try { assertSchoolFeaturesOrNotFound(false); } catch (e) { err = e; }
    expect(isNotFound(err)).toBe(true);
    expect(() => assertSchoolFeaturesOrNotFound(true)).not.toThrow();
  });

  it("identifies cart lines that must be removed while hidden", () => {
    expect(isBundleLine({ bundle_id: "b1" })).toBe(true);
    expect(isBundleLine({ school_bundle_id: "s1" })).toBe(true);
    expect(isBundleLine({})).toBe(false);
  });
});
