// Data-driven product attributes (unit-tested in attributes.test.ts).
// Definitions live in attribute_definitions; which ones apply comes from the
// product's categories (category_attributes, inherited from parents).
import { z } from "zod";

export type AttributeType = "select" | "multiselect" | "number" | "text";
export type AttributeOption = { value: string; label: string; sort?: number; is_active?: boolean };

export type AttributeDefinition = {
  id: string;
  key: string;
  label: string;
  type: AttributeType;
  unit?: string | null;
  help_text?: string | null;
  options: AttributeOption[];
  allow_new_options?: boolean;
  is_filterable?: boolean;
  is_variant_axis?: boolean;
  sort_order?: number;
  is_active?: boolean;
};

/** A definition as it applies to a given set of categories. */
export type EffectiveAttribute = AttributeDefinition & {
  is_required: boolean;
  /** Used as a variant axis (e.g. costume size/colour) in these categories. */
  variant_axis: boolean;
  inherited?: boolean;
};

export type AttributeValues = Record<string, string | number | string[]>;

export type ValidationResult = {
  values: AttributeValues;
  errors: Record<string, string>;
  /** New options to add to definitions that allow it (e.g. a new author). */
  newOptions: Record<string, string[]>;
};

const isEmpty = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);

function activeOptionValues(def: AttributeDefinition) {
  return new Set(def.options.filter((o) => o.is_active !== false).map((o) => o.value));
}

/** Zod schema for ONE attribute value (used by forms and CSV import). */
export function attributeValueSchema(def: AttributeDefinition): z.ZodTypeAny {
  switch (def.type) {
    case "number":
      return z.coerce.number({ invalid_type_error: `${def.label} must be a number` }).finite().min(0, `${def.label} can't be negative`);
    case "text":
      return z.string().trim().max(500, `${def.label} is too long`);
    case "multiselect":
      return z.array(z.string().trim().min(1)).max(50);
    case "select":
    default:
      return z.string().trim().min(1).max(200);
  }
}

/**
 * Validates product-level attribute values against the attributes that apply
 * to the product's categories. Variant axes (size/colour on costumes) belong on
 * variants, so they are ignored here. Unknown keys and invalid values are errors.
 */
export function validateProductAttributes(input: Record<string, unknown> | null | undefined, applicable: EffectiveAttribute[]): ValidationResult {
  const values: AttributeValues = {};
  const errors: Record<string, string> = {};
  const newOptions: Record<string, string[]> = {};
  const byKey = new Map(applicable.filter((a) => a.is_active !== false).map((a) => [a.key, a]));
  const raw = input ?? {};

  for (const key of Object.keys(raw)) {
    if (!byKey.has(key)) errors[key] = `"${key}" is not an attribute of the selected categories`;
  }

  for (const def of byKey.values()) {
    if (def.variant_axis) continue; // lives on variants
    const v = raw[def.key];
    if (isEmpty(v)) {
      if (def.is_required) errors[def.key] = `${def.label} is required`;
      continue;
    }
    const parsed = attributeValueSchema(def).safeParse(def.type === "multiselect" && typeof v === "string" ? v.split("|") : v);
    if (!parsed.success) {
      errors[def.key] = parsed.error.issues[0]?.message ?? `Invalid ${def.label}`;
      continue;
    }
    const val = parsed.data as string | number | string[];
    if (def.type === "select" || def.type === "multiselect") {
      const allowed = activeOptionValues(def);
      const list = Array.isArray(val) ? val : [val as string];
      const unknown = list.filter((x) => !allowed.has(x));
      if (unknown.length) {
        if (def.allow_new_options) newOptions[def.key] = unknown;
        else {
          errors[def.key] = `${def.label}: "${unknown[0]}" is not an allowed option`;
          continue;
        }
      }
      values[def.key] = Array.isArray(val) ? Array.from(new Set(val)) : val;
    } else {
      values[def.key] = val;
    }
  }
  return { values, errors, newOptions };
}

/**
 * Validates a variant's option values (e.g. {clothing_size: "6-7Y", colour: "Red"})
 * against the variant axes of the product's categories. Every axis is required.
 */
export function validateVariantOptions(input: Record<string, unknown> | null | undefined, applicable: EffectiveAttribute[]): ValidationResult {
  const axes = applicable.filter((a) => a.variant_axis && a.is_active !== false);
  const values: AttributeValues = {};
  const errors: Record<string, string> = {};
  const newOptions: Record<string, string[]> = {};
  const raw = input ?? {};
  for (const key of Object.keys(raw)) {
    if (!axes.some((a) => a.key === key)) errors[key] = `"${key}" is not a variant option for this product`;
  }
  for (const def of axes) {
    const v = raw[def.key];
    if (isEmpty(v) || typeof v !== "string") {
      errors[def.key] = `${def.label} is required for each variant`;
      continue;
    }
    const val = v.trim();
    if (!activeOptionValues(def).has(val)) {
      if (def.allow_new_options) newOptions[def.key] = [val];
      else {
        errors[def.key] = `${def.label}: "${val}" is not an allowed option`;
        continue;
      }
    }
    values[def.key] = val;
  }
  return { values, errors, newOptions };
}

/** Merge several categories' attribute sets (a product can have many categories). */
export function mergeApplicable(sets: EffectiveAttribute[][]): EffectiveAttribute[] {
  const out = new Map<string, EffectiveAttribute>();
  for (const set of sets) {
    for (const a of set) {
      const prev = out.get(a.key);
      out.set(a.key, prev
        ? { ...prev, is_required: prev.is_required || a.is_required, variant_axis: prev.variant_axis || a.variant_axis, inherited: prev.inherited && a.inherited }
        : a);
    }
  }
  return Array.from(out.values()).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

/** Adds new option values (sorted after existing ones). */
export function withNewOptions(def: AttributeDefinition, add: string[]): AttributeOption[] {
  const existing = new Set(def.options.map((o) => o.value));
  let sort = Math.max(0, ...def.options.map((o) => o.sort ?? 0));
  const extra = add.filter((v) => !existing.has(v)).map((v) => ({ value: v, label: v, sort: ++sort }));
  return [...def.options, ...extra];
}
