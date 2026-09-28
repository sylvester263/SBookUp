import { describe, expect, it } from "vitest";
import { axesFromVariants, findVariant, initialSelection, isOptionAvailable, type PickerVariant } from "./variant-picker";

const v = (id: string, size: string, colour: string, stock: number, extra: Partial<PickerVariant> = {}): PickerVariant =>
  ({ id, name: `${size} / ${colour}`, option_values: { clothing_size: size, colour }, stock, is_active: true, ...extra });
const variants = [v("a", "6-7Y", "Red", 2), v("b", "6-7Y", "Blue", 0), v("c", "4-5Y", "Blue", 3), v("d", "8-9Y", "Red", 5, { is_active: false })];
const defs = [
  { key: "clothing_size", label: "Size", options: [{ value: "4-5Y", label: "4-5Y", sort: 1 }, { value: "6-7Y", label: "6-7Y", sort: 2 }, { value: "8-9Y", label: "8-9Y", sort: 3 }] },
  { key: "colour", label: "Colour", options: [{ value: "Red", label: "Red", sort: 1 }, { value: "Blue", label: "Blue", sort: 2 }] },
];

describe("costume size / colour picker", () => {
  const axes = axesFromVariants(variants, defs);
  it("builds axes from active variants in the attribute's option order", () => {
    expect(axes.map((a) => a.label)).toEqual(["Size", "Colour"]);
    expect(axes[0].values.map((x) => x.value)).toEqual(["4-5Y", "6-7Y"]); // inactive 8-9Y hidden
  });
  it("finds the variant only when every axis is chosen", () => {
    expect(findVariant(variants, axes, { clothing_size: "6-7Y" })).toBeNull();
    expect(findVariant(variants, axes, { clothing_size: "6-7Y", colour: "Red" })?.id).toBe("a");
  });
  it("disables combinations with no in-stock variant", () => {
    expect(isOptionAvailable(variants, axes, { clothing_size: "6-7Y" }, "colour", "Blue")).toBe(false); // b is out of stock
    expect(isOptionAvailable(variants, axes, { clothing_size: "6-7Y" }, "colour", "Red")).toBe(true);
    expect(isOptionAvailable(variants, axes, { colour: "Blue" }, "clothing_size", "4-5Y")).toBe(true);
    expect(isOptionAvailable(variants, axes, {}, "clothing_size", "8-9Y")).toBe(false); // inactive
  });
  it("pre-selects single-value axes", () => {
    expect(initialSelection(axesFromVariants([v("x", "S", "Red", 1), v("y", "M", "Red", 1)], defs))).toEqual({ colour: "Red" });
  });
});
