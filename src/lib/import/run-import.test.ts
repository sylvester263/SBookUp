import { describe, expect, it, vi } from "vitest";
import type { BatchRowResult } from "./batch-write";
import { directImageUrl, isPrivateAddress } from "./image-links";
import { chunkRows, runImport, type RunDeps, type RunInput } from "./run-import";
import type { MappedRow, ProductPlan } from "./types";

type BatchInput = Parameters<RunDeps["productsBatch"]>[0];
const mk = (n: number, extra: Record<string, string | null> = {}): MappedRow => ({
  rowNumber: n,
  values: { sku: `S${n}`, ...extra },
});
const planOf = (r: MappedRow, over: Partial<ProductPlan> = {}): ProductPlan => ({
  row: r.rowNumber,
  status: "ok",
  action: "create",
  name: null,
  sku: r.values.sku ?? null,
  slug: null,
  issues: [],
  images: null,
  existingImages: [],
  newOptions: {},
  categoriesToCreate: [],
  categoryIds: [],
  ...over,
});
const ok = (rows: MappedRow[]): { results: BatchRowResult[]; batchFailed: boolean } => ({
  results: rows.map((r) => ({
    row: r.rowNumber,
    outcome: "created",
    id: `id-${r.rowNumber}`,
    issues: [],
  })),
  batchFailed: false,
});

function deps(over: Partial<RunDeps> = {}): RunDeps & { calls: Record<string, unknown[]> } {
  const calls: Record<string, unknown[]> = { products: [], apply: [], finish: [] };
  return {
    calls,
    createCategories: vi.fn(async () => ({ created: [] })),
    productsBatch: vi.fn(async (input: BatchInput) => {
      calls.products.push(input.rows.map((r) => r.rowNumber));
      return ok(input.rows);
    }),
    variantsBatch: vi.fn(async (input: BatchInput) => ok(input.rows)),
    fetchImage: vi.fn(async () => ({
      ok: true as const,
      contentType: "image/png",
      base64: btoa("png"),
      bytes: 3,
    })),
    storeImage: vi.fn(async (f: File) => `https://store.test/p/${f.name}`),
    applyImages: vi.fn(async (b) => calls.apply.push(b)),
    finish: vi.fn(async (b) => calls.finish.push(b)),
    ...over,
  };
}
const input = (
  rows: MappedRow[],
  plans?: ProductPlan[],
  mode: RunInput["mode"] = "valid_only",
): RunInput => ({
  fileName: "f.xlsx",
  matchBy: "auto",
  mode,
  storagePrefix: "https://store.test/p/",
  categoriesToCreate: [],
  products: { rows, headerOf: {}, plans: plans ?? rows.map((r) => planOf(r)) },
});

describe("batching", () => {
  it("≤100 rows and ≤~900 KB per batch", () => {
    expect(
      chunkRows(Array.from({ length: 250 }, (_, i) => mk(i + 2))).map((b) => b.length),
    ).toEqual([100, 100, 50]);
    const big = Array.from({ length: 10 }, (_, i) =>
      mk(i + 2, { description: "x".repeat(300_000) }),
    );
    expect(chunkRows(big).map((b) => b.length)).toEqual([2, 2, 2, 2, 2]); // 3 × 300 KB + JSON > 900 KB
  });
});

describe("runImport", () => {
  it("sends valid rows only, in batches, and logs ONE activity entry with the counts", async () => {
    const rows = Array.from({ length: 205 }, (_, i) => mk(i + 2));
    const plans = rows.map((r) => planOf(r, r.rowNumber === 5 ? { status: "error" } : {}));
    const d = deps();
    const res = await runImport(
      input(rows, plans),
      d,
      () => {},
      () => false,
    );
    expect(d.calls.products.map((b) => (b as number[]).length)).toEqual([100, 100, 4]);
    expect((d.calls.products.flat() as number[]).includes(5)).toBe(false);
    expect(res.counts.products).toEqual({ created: 204, updated: 0, skipped: 1, failed: 0 });
    expect(d.finish).toHaveBeenCalledTimes(1);
  });
  it("a failed batch is retried once without the rows that failed (valid-only mode)", async () => {
    const rows = [mk(2), mk(3), mk(4)];
    let first = true;
    const d = deps({
      productsBatch: vi.fn(async (inp: BatchInput) => {
        if (first) {
          first = false;
          return {
            batchFailed: true,
            results: inp.rows.map((r) => ({
              row: r.rowNumber,
              outcome: "failed" as const,
              issues:
                r.rowNumber === 3
                  ? [
                      {
                        row: 3,
                        column: "row",
                        value: null,
                        level: "error" as const,
                        message: "This SKU is already used by another product",
                      },
                    ]
                  : [
                      {
                        row: r.rowNumber,
                        column: "row",
                        value: null,
                        level: "error" as const,
                        message:
                          "Not saved: another row in the same batch failed, so the batch was rolled back",
                      },
                    ],
            })),
          };
        }
        return ok(inp.rows);
      }),
    });
    const res = await runImport(
      input(rows),
      d,
      () => {},
      () => false,
    );
    expect(d.productsBatch).toHaveBeenCalledTimes(2);
    expect(
      (d.productsBatch as ReturnType<typeof vi.fn>).mock.calls[1][0].rows.map(
        (r: MappedRow) => r.rowNumber,
      ),
    ).toEqual([2, 4]);
    expect(res.counts.products).toEqual({ created: 2, updated: 0, skipped: 0, failed: 1 });
  });
  it("'fix errors first' mode stops at a failed batch", async () => {
    const rows = Array.from({ length: 150 }, (_, i) => mk(i + 2));
    const d = deps({
      productsBatch: vi.fn(async (inp: BatchInput) => ({
        batchFailed: true,
        results: inp.rows.map((r) => ({
          row: r.rowNumber,
          outcome: "failed" as const,
          issues: [],
        })),
      })),
    });
    const res = await runImport(
      input(rows, undefined, "all"),
      d,
      () => {},
      () => false,
    );
    expect(d.productsBatch).toHaveBeenCalledTimes(1);
    expect(res.stoppedBy).toMatch(/stopped/);
  });
  it("cancel stops between batches", async () => {
    const rows = Array.from({ length: 300 }, (_, i) => mk(i + 2));
    let cancelled = false;
    const d = deps({
      productsBatch: vi.fn(async (inp: BatchInput) => ((cancelled = true), ok(inp.rows))),
    });
    const res = await runImport(
      input(rows),
      d,
      () => {},
      () => cancelled,
    );
    expect(d.productsBatch).toHaveBeenCalledTimes(1);
    expect(res.cancelled).toBe(true);
    expect(d.finish).toHaveBeenCalledWith(expect.objectContaining({ cancelled: true }));
  });
  it("images run after the rows are saved; a failed image keeps the old image", async () => {
    const rows = [mk(2), mk(3), mk(4)];
    const plans = [
      planOf(rows[0], {
        images: ["https://a.test/1.png", "https://store.test/p/kept.webp"],
        existingImages: ["https://store.test/p/kept.webp"],
      }),
      planOf(rows[1], {
        images: ["https://bad.test/x.png"],
        existingImages: ["https://store.test/p/old.webp"],
      }),
      planOf(rows[2], { images: [], existingImages: ["https://store.test/p/old2.webp"] }), // CLEAR
    ];
    const d = deps({
      fetchImage: vi.fn(async (u: string) =>
        u.includes("bad")
          ? { ok: false as const, message: "Image not found (404)" }
          : { ok: true as const, contentType: "image/png", base64: btoa("x"), bytes: 1 },
      ),
    });
    const res = await runImport(
      input(rows, plans),
      d,
      () => {},
      () => false,
    );
    expect(res.counts.images).toEqual({ copied: 1, failed: 1 });
    expect(res.imageIssues[0]).toMatchObject({
      row: 3,
      level: "warning",
      message: "Image not copied: Image not found (404)",
    });
    const applied = d.calls.apply[0] as { products: { id: string; images: string[] }[] };
    expect(applied.products).toHaveLength(2);
    expect(applied.products).toEqual(
      expect.arrayContaining([
        {
          id: "id-2",
          images: ["https://store.test/p/import-id-2-1.png", "https://store.test/p/kept.webp"],
        },
        { id: "id-4", images: [] },
      ]),
    ); // id-3 untouched: its only image failed
  });
});

describe("image links", () => {
  it("rewrites Google Drive / Dropbox share links to direct downloads", () => {
    expect(directImageUrl("https://drive.google.com/file/d/1AbC-x_9/view?usp=sharing")).toEqual({
      url: "https://drive.google.com/uc?export=download&id=1AbC-x_9",
    });
    expect(directImageUrl("https://drive.google.com/open?id=XYZ")).toEqual({
      url: "https://drive.google.com/uc?export=download&id=XYZ",
    });
    expect(directImageUrl("https://www.dropbox.com/scl/fi/abc/pic.jpg?rlkey=k&dl=0")).toEqual({
      url: "https://www.dropbox.com/scl/fi/abc/pic.jpg?rlkey=k&dl=1",
    });
    expect("error" in directImageUrl("https://drive.google.com/drive/folders/abc")).toBe(true);
    expect("error" in directImageUrl("ftp://x.test/a.png")).toBe(true);
  });
  it("blocks private / local addresses (SSRF)", () => {
    for (const ip of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.1",
      "169.254.169.254",
      "::1",
      "fd00::1",
      "::ffff:10.0.0.1",
      "0.0.0.0",
    ])
      expect(isPrivateAddress(ip)).toBe(true);
    for (const ip of ["8.8.8.8", "142.250.72.14", "2606:4700::1111"])
      expect(isPrivateAddress(ip)).toBe(false);
  });
});
