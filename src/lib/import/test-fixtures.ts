// Test fixture for the importer tests: mirrors the seeded catalog
// (20260925100000_catalog_data_model.sql) closely enough to cover packs,
// inherited attributes, gift-bag colour as a product attribute and costume
// size / colour as variant axes.
import type { ExistingProduct, ImportContext, MappedRow } from "./types";

const opts = (...v: string[]) => v.map((x, i) => ({ value: x, label: x, sort: i + 1 }));

export const ctx: ImportContext = {
  categories: [
    { id: "books", slug: "books", name: "Books", parent_id: null },
    { id: "novels", slug: "novels", name: "Novels", parent_id: "books" },
    { id: "stationery", slug: "stationery", name: "Stationery", parent_id: null },
    { id: "notebooks", slug: "notebooks", name: "Notebooks", parent_id: "stationery" },
    { id: "gifts", slug: "gifts", name: "Gifts", parent_id: null },
    {
      id: "wrap",
      slug: "gift-wrapping-sheets",
      name: "Gift Wrapping Sheets",
      parent_id: "gifts",
      default_sell_unit: "pack",
      default_pack_size: 6,
      default_unit_label: "sheet",
    },
    { id: "bags", slug: "gift-bags", name: "Gift Bags", parent_id: "gifts" },
    {
      id: "folders",
      slug: "money-folders",
      name: "Money Folders",
      parent_id: "gifts",
      default_sell_unit: "pack",
      default_pack_size: 12,
      default_unit_label: "folder",
    },
    { id: "costumes", slug: "character-costumes", name: "Character Costumes", parent_id: null },
    { id: "old", slug: "old-stock", name: "Old Stock", parent_id: null, is_active: false },
  ],
  definitions: [
    {
      id: "author",
      key: "author",
      label: "Author",
      type: "select",
      options: opts("Umera Ahmed"),
      allow_new_options: true,
    },
    {
      id: "age",
      key: "age_group",
      label: "Age Group",
      type: "select",
      options: opts("0-2", "3-5", "6-8", "9-12", "13+", "Adult"),
    },
    {
      id: "paper",
      key: "paper_size",
      label: "Size",
      type: "select",
      options: opts("A3", "A4", "A5"),
    },
    {
      id: "csize",
      key: "clothing_size",
      label: "Size",
      type: "select",
      options: opts("4-5Y", "6-7Y", "8-9Y"),
      is_variant_axis: true,
    },
    {
      id: "colour",
      key: "colour",
      label: "Colour",
      type: "select",
      options: [
        ...opts("Red", "Blue"),
        { value: "Gold", label: "Gold", sort: 9, is_active: false },
      ],
      allow_new_options: true,
      is_variant_axis: true,
    },
    {
      id: "occasion",
      key: "occasion",
      label: "Occasion",
      type: "select",
      options: opts("Birthday", "Eid", "Wedding"),
    },
    { id: "subjects", key: "subjects", label: "Subjects", type: "number", options: [] },
    {
      id: "binding",
      key: "binding_type",
      label: "Binding Type",
      type: "select",
      options: opts("Spiral", "Stitched"),
    },
    {
      id: "langs",
      key: "languages",
      label: "Languages",
      type: "multiselect",
      options: opts("English", "Urdu"),
    },
  ],
  categoryAttributes: [
    {
      category_id: "books",
      attribute_id: "author",
      is_required: false,
      is_variant_axis: false,
      sort_order: 20,
    },
    {
      category_id: "books",
      attribute_id: "age",
      is_required: false,
      is_variant_axis: false,
      sort_order: 10,
    },
    {
      category_id: "books",
      attribute_id: "langs",
      is_required: false,
      is_variant_axis: false,
      sort_order: 30,
    },
    {
      category_id: "notebooks",
      attribute_id: "subjects",
      is_required: false,
      is_variant_axis: false,
      sort_order: 10,
    },
    {
      category_id: "notebooks",
      attribute_id: "binding",
      is_required: true,
      is_variant_axis: false,
      sort_order: 20,
    },
    {
      category_id: "wrap",
      attribute_id: "paper",
      is_required: false,
      is_variant_axis: false,
      sort_order: 10,
    },
    {
      category_id: "bags",
      attribute_id: "paper",
      is_required: false,
      is_variant_axis: false,
      sort_order: 10,
    },
    {
      category_id: "bags",
      attribute_id: "occasion",
      is_required: false,
      is_variant_axis: false,
      sort_order: 20,
    },
    {
      category_id: "bags",
      attribute_id: "colour",
      is_required: false,
      is_variant_axis: false,
      sort_order: 30,
    },
    {
      category_id: "costumes",
      attribute_id: "csize",
      is_required: true,
      is_variant_axis: true,
      sort_order: 20,
    },
    {
      category_id: "costumes",
      attribute_id: "colour",
      is_required: true,
      is_variant_axis: true,
      sort_order: 30,
    },
  ],
};

export const product = (
  p: Partial<ExistingProduct> & { id: string; slug: string },
): ExistingProduct => ({
  name: p.slug,
  sku: null,
  isbn: null,
  price: 100,
  sale_price: null,
  sell_unit: "item",
  pack_size: null,
  unit_label: null,
  attributes: {},
  images: [],
  category_ids: ["books"],
  ...p,
});

let n = 1;
/** A mapped row; keys are field ids ("price", "attr:author", "option:colour"…). */
export const row = (values: Record<string, string | null>, rowNumber?: number): MappedRow => ({
  rowNumber: rowNumber ?? ++n,
  values,
});

/** headerOf where every field's header is its canonical name. */
export const headerOf = (fields: string[]) =>
  Object.fromEntries(
    fields.map((f) => [f, f.replace(/^attr:/, "attr_").replace(/^option:/, "option_")]),
  );
