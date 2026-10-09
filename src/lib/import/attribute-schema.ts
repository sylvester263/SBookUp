// Per-row Zod schema for attribute cells, built DYNAMICALLY from the attributes
// that apply to the row's categories (own + inherited): allowed select options
// (case-insensitive, mapped to the stored value), multi-select lists, numbers,
// text length and required attributes.
import { z } from "zod";
import type { AttributeDefinition, EffectiveAttribute } from "@/lib/attributes";
import { parseNumber, splitList } from "./coerce";

export type OptionMatch = { value: string; isNew?: boolean } | { error: string };

const squash = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** "a3" → "A3"; matches the stored value or the label. New values only where the attribute allows them. */
export function matchOption(def: AttributeDefinition, raw: string): OptionMatch {
  const active = def.options.filter((o) => o.is_active !== false);
  const t = squash(raw);
  const hit =
    active.find((o) => squash(o.value) === t) ?? active.find((o) => squash(o.label) === t);
  if (hit) return { value: hit.value };
  if (def.allow_new_options) {
    // A deactivated option typed again is reused, not duplicated.
    const old = def.options.find((o) => squash(o.value) === t);
    return old ? { value: old.value } : { value: raw.trim().replace(/\s+/g, " "), isNew: true };
  }
  const list = active.map((o) => o.label);
  const shown = list.slice(0, 12).join(", ") + (list.length > 12 ? ", …" : "");
  return {
    error: `"${raw}" is not an allowed ${def.label}. Allowed: ${shown || "(no options set up yet)"}`,
  };
}

export type AttributeCell = { set?: string | number | string[]; unset?: true };
export type AttributeOutput = {
  values: Record<string, AttributeCell>;
  newOptions: Record<string, string[]>;
};

const isEmptyValue = (v: unknown) => v == null || v === "" || (Array.isArray(v) && v.length === 0);

/**
 * input: attribute key → raw cell text, "CLEAR" or null (blank).
 * isCreate: required attributes must be filled. On updates a required attribute
 * may stay blank when the product already has a value.
 */
export function buildAttributeSchema(
  applicable: EffectiveAttribute[],
  opts: { isCreate: boolean; existing: Record<string, unknown> | null; categoriesChanged: boolean },
) {
  const defs = applicable.filter((a) => !a.variant_axis && a.is_active !== false);
  const newOptions: Record<string, string[]> = {};

  const cell = (def: EffectiveAttribute) =>
    z
      .string()
      .nullable()
      .optional()
      .transform((raw, ctx): AttributeCell | undefined => {
        if (raw == null) return undefined;
        if (raw.trim().toUpperCase() === "CLEAR") {
          if (def.is_required)
            ctx.addIssue({
              code: "custom",
              message: `${def.label} is required and can't be cleared`,
            });
          return { unset: true };
        }
        switch (def.type) {
          case "number": {
            const n = parseNumber(raw, { min: 0, label: def.label });
            if (n.error) ctx.addIssue({ code: "custom", message: n.error });
            return n.error ? undefined : { set: n.value };
          }
          case "text":
            if (raw.length > 500)
              ctx.addIssue({
                code: "custom",
                message: `${def.label} is too long (max 500 characters)`,
              });
            return { set: raw };
          case "multiselect": {
            const out: string[] = [];
            for (const part of splitList(raw, { commas: true })) {
              const m = matchOption(def, part);
              if ("error" in m) ctx.addIssue({ code: "custom", message: m.error });
              else {
                if (m.isNew) newOptions[def.key] = [...(newOptions[def.key] ?? []), m.value];
                if (!out.includes(m.value)) out.push(m.value);
              }
            }
            return { set: out };
          }
          default: {
            const m = matchOption(def, raw);
            if ("error" in m) {
              ctx.addIssue({ code: "custom", message: m.error });
              return undefined;
            }
            if (m.isNew) newOptions[def.key] = [...(newOptions[def.key] ?? []), m.value];
            return { set: m.value };
          }
        }
      });

  const shape = Object.fromEntries(defs.map((d) => [d.key, cell(d)]));
  const schema = z.object(shape).superRefine((out, ctx) => {
    for (const d of defs) {
      if (!d.is_required) continue;
      const c = out[d.key] as AttributeCell | undefined;
      const has =
        c?.set !== undefined
          ? !isEmptyValue(c.set)
          : c?.unset
            ? false
            : !isEmptyValue(opts.existing?.[d.key]);
      if (!has && (opts.isCreate || opts.categoriesChanged || c?.unset)) {
        ctx.addIssue({
          code: "custom",
          path: [d.key],
          message: `${d.label} is required for this category`,
        });
      }
    }
  });
  return {
    schema,
    newOptions,
    /** Required attributes still empty on an existing product (warning only). */
    missingRequired: (out: Record<string, AttributeCell | undefined>) =>
      defs
        .filter((d) => d.is_required && !out[d.key]?.set && isEmptyValue(opts.existing?.[d.key]))
        .map((d) => d.label),
  };
}
