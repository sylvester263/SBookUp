// Sheet rows (cells by position) → mapped rows (cleaned cells by field id).
import { cleanCell } from "./coerce";
import type { HeaderResult } from "./headers";
import type { MappedRow } from "./types";

export function mapRows(
  rows: { rowNumber: number; cells: string[] }[],
  headers: HeaderResult,
): MappedRow[] {
  return rows.map((r) => {
    const values: Record<string, string | null> = {};
    for (const col of headers.columns)
      if (col.field) values[col.field] = cleanCell(r.cells[col.index]);
    return { rowNumber: r.rowNumber, values };
  });
}

/** Rows whose mapped cells are all blank (only unknown columns filled) — nothing to import. */
export const isBlankRow = (r: MappedRow) => Object.values(r.values).every((v) => v == null);
