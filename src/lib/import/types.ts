// Shared types for the bulk importer (browser preview + server re-validation).
import type { CatalogContext, CategoryInfo } from "@/lib/catalog-import";

export type ImportCategory = CategoryInfo & { name: string; is_active?: boolean };
export type ImportContext = Omit<CatalogContext, "categories"> & { categories: ImportCategory[] };

/** One data row after header matching: field id → cleaned cell text (null = blank). */
export type MappedRow = { rowNumber: number; values: Record<string, string | null> };

export type IssueLevel = "error" | "warning";
export type Issue = {
  row: number;
  column: string;
  value: string | null;
  message: string;
  level: IssueLevel;
};

export type MatchBy = "auto" | "sku" | "isbn" | "slug";
export type RowStatus = "ok" | "warning" | "error" | "skipped";
export type RowAction = "create" | "update" | "skip";

/** What the importer needs to know about a product that already exists. */
/** Attribute values as stored in products.attributes (JSON). */
export type StoredAttributes = Record<string, string | number | boolean | string[] | null>;

export type ExistingProduct = {
  id: string;
  name: string;
  slug: string;
  sku: string | null;
  isbn: string | null;
  price: number;
  sale_price: number | null;
  sell_unit: string;
  pack_size: number | null;
  unit_label: string | null;
  attributes: StoredAttributes;
  images: string[];
  category_ids: string[];
};

export type ExistingVariant = {
  id: string;
  product_id: string;
  sku: string | null;
  name: string;
  option_values: Record<string, string>;
  price: number | null;
  compare_at_price: number | null;
  stock: number;
  image_url: string | null;
  is_active: boolean;
};

/** Body of one row for public.import_products_batch. */
export type ProductPayload = {
  row: number;
  id: string | null;
  set: Record<string, string | number | boolean | string[] | null>;
  attributes_set: Record<string, unknown>;
  attributes_unset: string[];
  category_ids: string[] | null;
};

export type ProductPlan = {
  row: number;
  status: RowStatus;
  action: RowAction;
  matchedBy?: "sku" | "isbn" | "slug";
  productId?: string;
  /** Shown in the preview: name, SKU, slug. */
  name: string | null;
  sku: string | null;
  slug: string | null;
  issues: Issue[];
  payload?: ProductPayload;
  /** Source image links to copy into storage after the row is saved (null = images column not used). */
  images: string[] | null;
  existingImages: string[];
  newOptions: Record<string, string[]>;
  /** Category names / slugs that will be created first (admin toggle). */
  categoriesToCreate: string[];
  /** Final category ids (for the Variants sheet of the same file). */
  categoryIds: string[];
};

export type VariantPayload = {
  row: number;
  id: string | null;
  product_id: string;
  set: Record<string, string | number | boolean | Record<string, string> | null>;
};

export type VariantPlan = {
  row: number;
  status: RowStatus;
  action: RowAction;
  /** product_sku or product_slug as typed. */
  productKey: string | null;
  productId?: string;
  /** Parent is a new product created by the Products sheet of the same file. */
  parentInFile?: boolean;
  variantSku: string | null;
  options: Record<string, string>;
  issues: Issue[];
  payload?: Omit<VariantPayload, "product_id"> & { product_id: string | null };
  image: string | null | undefined;
  existingImage: string | null;
  newOptions: Record<string, string[]>;
};

export type PlanSummary = {
  total: number;
  create: number;
  update: number;
  skipped: number;
  errors: number;
  warnings: number;
};

export function summarise(plans: { status: RowStatus; action: RowAction }[]): PlanSummary {
  return {
    total: plans.length,
    create: plans.filter((p) => p.status !== "error" && p.action === "create").length,
    update: plans.filter((p) => p.status !== "error" && p.action === "update").length,
    skipped: plans.filter((p) => p.status === "skipped").length,
    errors: plans.filter((p) => p.status === "error").length,
    warnings: plans.filter((p) => p.status === "warning").length,
  };
}

export function statusOf(issues: Issue[], skipped = false): RowStatus {
  if (issues.some((i) => i.level === "error")) return "error";
  if (skipped) return "skipped";
  return issues.length ? "warning" : "ok";
}
