import { describe, expect, it } from "vitest";
import { isSafeRedirect } from "./safe-redirect";

describe("isSafeRedirect", () => {
  it("allows same-site paths", () => {
    for (const p of ["/", "/account", "/checkout", "/product/maths-5?x=1#top"]) expect(isSafeRedirect(p), p).toBe(true);
  });
  it("blocks anything that could leave the site", () => {
    for (const p of ["//evil.com", "/\\evil.com", "@evil.com", "/@evil.com", "https://evil.com", "evil.com", "/ evil", ""]) {
      expect(isSafeRedirect(p), p).toBe(false);
    }
  });
});
