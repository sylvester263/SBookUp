import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { ImportFileError, decodeText, readWorkbook } from "./read-workbook";

const bytes = (s: string) => new TextEncoder().encode(s);
const buf = (u: Uint8Array) =>
  u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

function xlsx(
  sheets: Record<string, unknown[][]>,
  opts: {
    hidden?: string[];
    merges?: Record<string, XLSX.Range[]>;
    type?: XLSX.BookType;
    formats?: Record<string, Record<string, string>>;
  } = {},
) {
  const wb = XLSX.utils.book_new();
  for (const [name, aoa] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    if (opts.merges?.[name]) ws["!merges"] = opts.merges[name];
    for (const [addr, z] of Object.entries(opts.formats?.[name] ?? {})) ws[addr].z = z;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  wb.Workbook = {
    Sheets: wb.SheetNames.map((n) => ({ name: n, Hidden: opts.hidden?.includes(n) ? 1 : 0 })),
  } as XLSX.WorkBook["Workbook"];
  return XLSX.write(wb, { type: "array", bookType: opts.type ?? "xlsx" }) as ArrayBuffer;
}

describe("CSV files", () => {
  it("UTF-8 with BOM: headers clean, Urdu kept, empty rows skipped, row numbers stay Excel's", () => {
    const csv =
      '\uFEFFname,categories,price\r\nپیرِ کامل,books,"Rs. 1,250"\r\n,,\r\nUrdu Qaida,books,300\r\n';
    const wb = readWorkbook(buf(bytes(csv)), "products.csv");
    expect(wb.products!.headers).toEqual(["name", "categories", "price"]);
    expect(wb.products!.rows).toEqual([
      { rowNumber: 2, cells: ["پیرِ کامل", "books", "Rs. 1,250"] },
      { rowNumber: 4, cells: ["Urdu Qaida", "books", "300"] },
    ]);
    expect(wb.warnings).toEqual([]);
  });
  it("Windows-1252 (Excel's plain CSV) is decoded with a warning", () => {
    const ansi = new Uint8Array([...bytes("name,price\r\nCaf"), 0xe9, ...bytes(",100\r\n")]);
    const wb = readWorkbook(buf(ansi), "old.csv");
    expect(wb.products!.rows[0].cells[0]).toBe("Café");
    expect(wb.warnings[0]).toMatch(/CSV UTF-8/);
  });
  it("UTF-16 'Unicode Text' and semicolon-separated files", () => {
    const warnings: string[] = [];
    const u16 = new Uint8Array([
      0xff,
      0xfe,
      ...Array.from("a\tb").flatMap((c) => [c.charCodeAt(0), 0]),
    ]);
    expect(decodeText(u16, warnings)).toBe("a\tb");
    const wb = readWorkbook(buf(bytes("name;price\nPen;50\n")), "semi.csv");
    expect(wb.products!.rows[0].cells).toEqual(["Pen", "50"]);
  });
  it("detects a Variants CSV by its headers", () => {
    const wb = readWorkbook(
      buf(bytes("product_sku,variant_sku,option_colour\nCOS-1,COS-1-R,Red\n")),
      "variants.csv",
    );
    expect(wb.variants?.rows).toHaveLength(1);
    expect(wb.products).toBeUndefined();
  });
});

describe("Excel files", () => {
  it("reads every cell as the raw value: full ISBN digits, dates as ISO, booleans, errors", () => {
    const data = xlsx(
      {
        Products: [
          ["name", "isbn", "price", "new_arrival_until", "is_active", "sku"],
          ["Book", 9780199000000, 1250, 46022, true, "00123"],
        ],
      },
      { formats: { Products: { C2: '"Rs." #,##0', D2: "dd/mm/yyyy" } } },
    );
    const wb = readWorkbook(data, "books.xlsx");
    expect(wb.products!.rows[0].cells).toEqual([
      "Book",
      "9780199000000",
      "1250",
      "2025-12-31",
      "TRUE",
      "00123",
    ]);
  });
  it("reads the sheet named Products (and Variants), skipping hidden sheets", () => {
    const data = xlsx(
      {
        Notes: [["hello"]],
        Products: [
          ["name", "price"],
          ["Pen", 50],
        ],
        Variants: [
          ["product_sku", "variant_sku"],
          ["P1", "P1-R"],
        ],
        Secret: [["name"], ["x"]],
      },
      { hidden: ["Secret"] },
    );
    const wb = readWorkbook(data, "book.xlsx");
    expect(wb.products!.sheetName).toBe("Products");
    expect(wb.variants!.rows[0].cells).toEqual(["P1", "P1-R"]);
    expect(wb.warnings.join()).toMatch(/Hidden sheet\(s\) ignored: Secret/);
  });
  it("uses the first VISIBLE sheet when none is named Products", () => {
    const data = xlsx(
      {
        Hidden: [["name"], ["no"]],
        Sheet1: [
          ["name", "price"],
          ["Pen", 50],
        ],
      },
      { hidden: ["Hidden"] },
    );
    expect(readWorkbook(data, "x.xlsx").products!.sheetName).toBe("Sheet1");
  });
  it("finds the header row under a title row and fills merged cells", () => {
    const data = xlsx(
      {
        Products: [
          ["My price list"],
          [],
          ["name", "categories", "price"],
          ["Pen", "stationery", 50],
          ["Pencil", null, 20],
          [null, null, null],
        ],
      },
      { merges: { Products: [{ s: { r: 3, c: 1 }, e: { r: 4, c: 1 } }] } },
    );
    const sheet = readWorkbook(data, "x.xlsx").products!;
    expect(sheet.headerRow).toBe(3);
    expect(sheet.rows).toEqual([
      { rowNumber: 4, cells: ["Pen", "stationery", "50"] },
      { rowNumber: 5, cells: ["Pencil", "stationery", "20"] },
    ]);
  });
  it("old .xls files work too", () => {
    const data = xlsx(
      {
        Products: [
          ["name", "price"],
          ["Pen", 50],
        ],
      },
      { type: "biff8" },
    );
    expect(readWorkbook(data, "old.xls").products!.rows[0].cells).toEqual(["Pen", "50"]);
  });
  it("rejects files that are not spreadsheets, and empty ones", () => {
    expect(() => readWorkbook(buf(bytes("%PDF-1.4")), "catalog.pdf")).toThrow(ImportFileError);
    expect(() => readWorkbook(buf(bytes("name,price\n")), "empty.csv")).toThrow(/No product rows/);
  });
});
