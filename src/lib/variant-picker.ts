// Product page size / colour picker logic (unit-tested in variant-picker.test.ts).

export type PickerVariant = {
  id: string;
  name: string;
  option_values?: Record<string, string> | null;
  stock?: number | null;
  is_active?: boolean | null;
  price?: number | null;
  price_modifier?: number | null;
  image_url?: string | null;
};
export type AxisDef = { key: string; label: string; options?: { value: string; label: string; sort?: number }[] };
export type Axis = { key: string; label: string; values: { value: string; label: string }[] };

const active = (v: PickerVariant) => v.is_active !== false;
const inStock = (v: PickerVariant) => Number(v.stock ?? 0) > 0;

/** Axes present on the product's variants, values ordered like the attribute's options. */
export function axesFromVariants(variants: PickerVariant[], defs: AxisDef[] = []): Axis[] {
  const keys: string[] = [];
  for (const v of variants.filter(active)) for (const k of Object.keys(v.option_values ?? {})) if (!keys.includes(k)) keys.push(k);
  const defOrder = (k: string) => { const i = defs.findIndex((d) => d.key === k); return i < 0 ? 999 : i; };
  keys.sort((a, b) => defOrder(a) - defOrder(b));
  return keys.map((key) => {
    const def = defs.find((d) => d.key === key);
    const vals = Array.from(new Set(variants.filter(active).map((v) => v.option_values?.[key]).filter((x): x is string => !!x)));
    const order = (val: string) => { const o = def?.options?.find((x) => x.value === val); return o?.sort ?? (def?.options ? def.options.indexOf(o!) : 999); };
    vals.sort((a, b) => (order(a) ?? 999) - (order(b) ?? 999) || a.localeCompare(b));
    return { key, label: def?.label ?? key.replace(/_/g, " "), values: vals.map((v) => ({ value: v, label: def?.options?.find((o) => o.value === v)?.label ?? v })) };
  });
}

/** The variant matching every axis in the selection (null until all axes are chosen). */
export function findVariant(variants: PickerVariant[], axes: Axis[], selection: Record<string, string>): PickerVariant | null {
  if (!axes.length || axes.some((a) => !selection[a.key])) return null;
  return variants.find((v) => active(v) && axes.every((a) => v.option_values?.[a.key] === selection[a.key])) ?? null;
}

/** Can this value still be chosen, given the other selected values? (needs an in-stock variant) */
export function isOptionAvailable(variants: PickerVariant[], axes: Axis[], selection: Record<string, string>, key: string, value: string) {
  return variants.some((v) =>
    active(v) && inStock(v) && v.option_values?.[key] === value &&
    axes.every((a) => a.key === key || !selection[a.key] || v.option_values?.[a.key] === selection[a.key]),
  );
}

/** Pre-selects axes that only have one value. */
export function initialSelection(axes: Axis[]): Record<string, string> {
  return Object.fromEntries(axes.filter((a) => a.values.length === 1).map((a) => [a.key, a.values[0].value]));
}
