import { describe, expect, it } from "vitest";
import {
  cleanCell,
  excelError,
  isbnWarning,
  lostCharactersWarning,
  numberToPlainString,
  parseBool,
  parseCode,
  parseDate,
  parseNumber,
  slugify,
  splitList,
  splitUrls,
} from "./coerce";

describe("cleanCell", () => {
  it("trims, turns NBSP into spaces, drops zero-width chars and makes blanks null", () => {
    expect(cleanCell("\u00A0 Peer-e-Kamil\u00A0")).toBe("Peer-e-Kamil");
    expect(cleanCell("\uFEFFname\u200B")).toBe("name");
    expect(cleanCell("   ")).toBeNull();
    expect(cleanCell("")).toBeNull();
    expect(cleanCell(undefined)).toBeNull();
  });
  it("keeps Urdu text intact", () => {
    expect(cleanCell("  پیرِ کامل  ")).toBe("پیرِ کامل");
  });
});

describe("prices and numbers", () => {
  it.each([
    ["Rs. 1,250", 1250],
    ["Rs 1,250.00", 1250],
    ["1,250", 1250],
    ["PKR 999/-", 999],
    ["₨ 75", 75],
    ["1 250", 1250],
    ["1250.5", 1250.5],
    ["'1250", 1250],
    ["0", 0],
  ])("%s → %d", (raw, n) => expect(parseNumber(raw).value).toBe(n));
  it("explains bad numbers", () => {
    expect(parseNumber("abc", { label: "price" }).error).toBe('price must be a number (got "abc")');
    expect(parseNumber("-5", { min: 0, label: "price" }).error).toMatch(/0 or more/);
    expect(parseNumber("2.5", { int: true, label: "stock" }).error).toMatch(/whole number/);
  });
});

describe("booleans", () => {
  it.each(["yes", "YES", "true", "TRUE", "1", "y", "Active", "published"])("%s → true", (v) =>
    expect(parseBool(v).value).toBe(true),
  );
  it.each(["no", "No", "false", "FALSE", "0", "n", "draft", "hidden"])("%s → false", (v) =>
    expect(parseBool(v).value).toBe(false),
  );
  it("never turns an unknown word into a silent 'no'", () => {
    expect(parseBool("maybe", "is_active").error).toBe('is_active must be yes or no (got "maybe")');
  });
});

describe("dates", () => {
  it("ISO dates and Excel serial numbers", () => {
    expect(parseDate("2026-12-31").value).toBe("2026-12-31");
    expect(parseDate("2026-12-31T00:00:00").value).toBe("2026-12-31");
    expect(parseDate("46022").value).toBe("2025-12-31");
    expect(parseDate("45939").value).toBe("2025-10-09");
  });
  it("day-first slash dates, with a warning when it could be either way", () => {
    expect(parseDate("31/12/2026")).toEqual({ value: "2026-12-31" });
    expect(parseDate("12/31/2026").value).toBe("2026-12-31");
    const amb = parseDate("10/9/2026");
    expect(amb.value).toBe("2026-09-10");
    expect(amb.warning).toMatch(/day\/month\/year/);
    expect(parseDate("9 Oct 2026").value).toBe("2026-10-09");
    expect(parseDate("Oct 9, 2026").value).toBe("2026-10-09");
  });
  it("rejects impossible dates", () => {
    expect(parseDate("31/02/2026").error).toBeDefined();
    expect(parseDate("soon").error).toMatch(/2026-12-31/);
  });
});

describe("ISBN / SKU codes", () => {
  it("flags scientific notation with the fix", () => {
    const r = parseCode("9.78097E+12", "ISBN");
    expect(r.error).toBe(
      "ISBN looks like 9.78097E+12 — Excel changed this number. Format the ISBN column as Text in Excel and type the full number again",
    );
    expect(parseCode("9.78E+12", "SKU").error).toMatch(/Format the SKU column as Text/);
  });
  it("keeps leading zeros and text exactly", () => {
    expect(parseCode("00123", "SKU").value).toBe("00123");
    expect(parseCode("BK-0001", "SKU").value).toBe("BK-0001");
  });
  it("drops a trailing .0 with a warning", () => {
    const r = parseCode("9789690000001.0", "ISBN");
    expect(r.value).toBe("9789690000001");
    expect(r.warning).toBeDefined();
  });
  it("checks ISBN check digits (warning only)", () => {
    expect(isbnWarning("978-0-306-40615-7")).toBeUndefined();
    expect(isbnWarning("0-306-40615-2")).toBeUndefined();
    expect(isbnWarning("9780306406158")).toMatch(/check digit/);
    expect(isbnWarning("12345")).toMatch(/not a 10 or 13 digit/);
  });
  it("prints numbers in full digits (never 9.78E+12)", () => {
    expect(numberToPlainString(9780199000000)).toBe("9780199000000");
    expect(numberToPlainString(1250.5)).toBe("1250.5");
  });
});

describe("lists, links, slugs, Excel errors", () => {
  it("splits on | (commas only for tags without |)", () => {
    expect(splitList("a| b |a")).toEqual(["a", "b"]);
    expect(splitList("x, y", { commas: true })).toEqual(["x", "y"]);
    expect(splitList("x, y|z", { commas: true })).toEqual(["x, y", "z"]);
  });
  it("keeps commas inside image links", () => {
    expect(
      splitUrls("https://res.cloudinary.com/x/w_400,h_400/a.jpg|https://b.test/2.png"),
    ).toEqual(["https://res.cloudinary.com/x/w_400,h_400/a.jpg", "https://b.test/2.png"]);
    expect(splitUrls("https://a.test/1.jpg,https://a.test/2.jpg")).toHaveLength(2);
  });
  it("slugs", () => {
    expect(slugify("Peer-e-Kamil (Urdu)")).toBe("peer-e-kamil-urdu");
    expect(slugify("Café Déjà")).toBe("cafe-deja");
    expect(slugify("پیرِ کامل")).toBe("");
  });
  it("Excel error values", () => {
    expect(excelError("#N/A")).toMatch(/Excel error #N\/A/);
    expect(excelError("#REF!")).toBeDefined();
    expect(excelError("N/A")).toBeUndefined();
  });
  it("detects letters lost by an ANSI save", () => {
    expect(lostCharactersWarning("???? ????")).toMatch(/CSV UTF-8/);
    expect(lostCharactersWarning("Caf\uFFFD")).toMatch(/UTF-8/);
    expect(lostCharactersWarning("Is it new?")).toBeUndefined();
  });
});
