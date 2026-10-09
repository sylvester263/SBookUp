// Column registry for the bulk importer: the ONE place that defines the sheet
// headers, the old / human names accepted for them, how each cell is read, and
// the help text shown in the template's Instructions sheet. The template, the
// export and the parser all use this list, so export → edit → import round-trips.

export type ColumnKind =
  | "text"
  | "longtext"
  | "price"
  | "int"
  | "bool"
  | "date"
  | "code"
  | "list"
  | "categories"
  | "sell_unit"
  | "url_list"
  | "url";

export type ColumnDef = {
  /** Canonical header, written by the template and the export. */
  key: string;
  kind: ColumnKind;
  /** Other header spellings accepted on import (compared after normaliseHeader). */
  aliases?: string[];
  help: string;
  example?: string;
  /** "Required for new products" (updates never require a column). */
  requiredOnCreate?: boolean;
  /** CLEAR in the cell empties the value on an existing product. */
  clearable?: boolean;
  /** Formatted as Text in the template / export so Excel keeps every digit. */
  textFormat?: boolean;
  maxLength?: number;
  width?: number;
};

export const PRODUCT_COLUMNS: ColumnDef[] = [
  {
    key: "sku",
    kind: "code",
    textFormat: true,
    clearable: true,
    maxLength: 80,
    width: 18,
    aliases: ["product sku", "item code", "product code", "code", "sku code"],
    help: "Your own product code. Existing products are found by SKU first. Keep the column formatted as Text.",
    example: "BK-00123",
  },
  {
    key: "name",
    kind: "text",
    requiredOnCreate: true,
    maxLength: 200,
    width: 36,
    aliases: ["product name", "title", "product title", "item name", "product"],
    help: "Product name as customers see it. Urdu is fine.",
    example: "Oxford Progressive English 5",
  },
  {
    key: "slug",
    kind: "text",
    maxLength: 200,
    width: 28,
    aliases: ["url", "handle", "url key", "permalink", "product slug"],
    help: "Web address part (a-z, 0-9 and -). Leave blank for new products to make one from the name. Changing it changes the product's link.",
    example: "oxford-progressive-english-5",
  },
  {
    key: "categories",
    kind: "categories",
    requiredOnCreate: true,
    width: 30,
    aliases: [
      "category",
      "category slug",
      "category slugs",
      "category_slug",
      "categories slugs",
      "category name",
      "category names",
    ],
    help: 'Category slugs (or names) from the Instructions sheet, separated by "|". The FIRST one is the main category. Blank = keep the current categories.',
    example: "books|novels",
  },
  {
    key: "price",
    kind: "price",
    requiredOnCreate: true,
    width: 12,
    aliases: ["regular price", "mrp", "list price", "price rs", "price pkr", "rate"],
    help: 'Regular price in rupees. "Rs. 1,250" is fine. For pack products this is the price of ONE PACK.',
    example: "1250",
  },
  {
    key: "sale_price",
    kind: "price",
    clearable: true,
    width: 12,
    aliases: [
      "sale",
      "discount price",
      "discounted price",
      "offer price",
      "special price",
      "sale price rs",
    ],
    help: "Discounted price (lower than price). CLEAR removes the discount.",
    example: "999",
  },
  {
    key: "compare_at_price",
    kind: "price",
    clearable: true,
    width: 14,
    aliases: ["compare at price", "compare price", "was price", "original price"],
    help: 'Optional, Shopify style: the old "was" price. If you fill it, "price" is what the customer pays. Don\'t fill both this and sale_price.',
  },
  {
    key: "cost_price",
    kind: "price",
    clearable: true,
    width: 12,
    aliases: ["cost", "purchase price", "buying price", "cost rs"],
    help: "What the item costs you. Never shown on the website.",
  },
  {
    key: "stock_quantity",
    kind: "int",
    width: 10,
    aliases: ["stock", "qty", "quantity", "stock qty", "inventory", "in stock", "stock quantity"],
    help: "How many you have (packs, for pack products). New products default to 0.",
    example: "20",
  },
  {
    key: "low_stock_threshold",
    kind: "int",
    width: 10,
    aliases: ["low stock", "low stock alert", "reorder level", "low stock level"],
    help: "Low-stock warning level. Default 5.",
  },
  {
    key: "isbn",
    kind: "code",
    textFormat: true,
    clearable: true,
    maxLength: 40,
    width: 18,
    aliases: ["isbn13", "isbn 13", "isbn10", "isbn 10", "barcode", "ean", "ean13"],
    help: "ISBN for books, or the barcode (EAN) for other items. Keep the column formatted as Text or Excel turns it into 9.78E+12.",
    example: "9780199000000",
  },
  {
    key: "brand",
    kind: "text",
    clearable: true,
    maxLength: 120,
    width: 16,
    aliases: ["make", "manufacturer"],
    help: "Brand / maker.",
  },
  {
    key: "edition",
    kind: "text",
    clearable: true,
    maxLength: 80,
    width: 12,
    help: "Book edition.",
  },
  {
    key: "description",
    kind: "longtext",
    clearable: true,
    width: 40,
    aliases: ["details", "product description", "long description", "body", "body html"],
    help: "Product description. Plain text or simple HTML (scripts are removed on the website).",
  },
  {
    key: "weight_grams",
    kind: "int",
    clearable: true,
    width: 10,
    aliases: ["weight", "weight g", "weight gram", "weight grams", "weight in grams", "grams"],
    help: "Shipping weight in grams.",
  },
  {
    key: "sell_unit",
    kind: "sell_unit",
    width: 10,
    aliases: ["sold by", "sell by", "unit"],
    help: '"item" or "pack". Blank on new products = the category default (Gift Wrapping Sheets: pack of 6, Money Folders: pack of 12).',
  },
  {
    key: "pack_size",
    kind: "int",
    width: 10,
    aliases: ["pack", "pack qty", "items per pack", "pack quantity", "pieces per pack"],
    help: "Items in one pack (2 or more). Blank = the category default.",
  },
  {
    key: "unit_label",
    kind: "text",
    clearable: true,
    maxLength: 30,
    width: 10,
    aliases: ["unit label", "pack unit"],
    help: 'What one item in the pack is called, e.g. "sheet".',
  },
  {
    key: "is_active",
    kind: "bool",
    width: 9,
    aliases: ["active", "status", "published", "visible", "enabled", "show on website"],
    help: "yes = shown on the website, no = hidden (draft). New products default to yes.",
  },
  {
    key: "is_featured",
    kind: "bool",
    width: 9,
    aliases: ["featured"],
    help: "yes / no. Default no.",
  },
  {
    key: "is_new_arrival",
    kind: "bool",
    width: 9,
    aliases: ["new arrival", "new"],
    help: "yes / no. Default no.",
  },
  {
    key: "new_arrival_until",
    kind: "date",
    clearable: true,
    width: 14,
    aliases: ["new arrival until", "new until"],
    help: "Last day shown as a new arrival: 2026-12-31 (an Excel date is fine).",
  },
  {
    key: "tags",
    kind: "list",
    clearable: true,
    width: 20,
    aliases: ["tag", "keywords"],
    help: 'Search tags separated by "|".',
  },
  {
    key: "images",
    kind: "url_list",
    clearable: true,
    width: 40,
    aliases: [
      "image",
      "image url",
      "image urls",
      "image link",
      "image links",
      "photo",
      "photos",
      "picture",
      "pictures",
      "image_url",
    ],
    help: 'Image links separated by "|". The first is the main image. Images are copied to the website\'s storage (Google Drive and Dropbox share links work if shared publicly). Blank = keep the current images.',
  },
];

/** Legacy one-image-per-column headers (image_url_1, image 2…), merged into images. */
export const LEGACY_IMAGE_COLUMN = /^(?:image|image url|photo|picture) ?([1-9])$/;

export const VARIANT_COLUMNS: ColumnDef[] = [
  {
    key: "product_sku",
    kind: "code",
    textFormat: true,
    width: 18,
    aliases: ["parent sku", "product code", "main sku"],
    help: "SKU of the product this variant belongs to (it can be a new product in the Products sheet of the same file).",
    example: "COSTUME-SPIDEY",
  },
  {
    key: "product_slug",
    kind: "text",
    width: 24,
    aliases: ["parent slug", "product url"],
    help: "Use instead of product_sku for products that have no SKU.",
  },
  {
    key: "variant_sku",
    kind: "code",
    textFormat: true,
    clearable: true,
    maxLength: 80,
    width: 20,
    aliases: ["sku", "variant code", "variant sku code"],
    help: "The variant's own SKU (unique across the whole shop). Existing variants are found by this SKU, otherwise by product + options.",
    example: "SPIDEY-6-7Y-RED",
  },
  {
    key: "name",
    kind: "text",
    maxLength: 80,
    width: 18,
    aliases: ["variant name", "variant"],
    help: 'Blank = made from the options, e.g. "6-7Y / Red".',
  },
  {
    key: "price",
    kind: "price",
    clearable: true,
    width: 10,
    aliases: ["variant price"],
    help: "Blank or CLEAR = the product's price.",
  },
  {
    key: "compare_at_price",
    kind: "price",
    clearable: true,
    width: 12,
    aliases: ["compare at price", "was price"],
    help: 'Optional "was" price shown struck through.',
  },
  {
    key: "stock",
    kind: "int",
    width: 8,
    aliases: ["stock quantity", "stock_quantity", "qty", "quantity"],
    help: "Stock of this variant.",
  },
  {
    key: "is_active",
    kind: "bool",
    width: 9,
    aliases: ["active", "status", "enabled"],
    help: "yes / no. Default yes.",
  },
  {
    key: "image_url",
    kind: "url",
    clearable: true,
    width: 36,
    aliases: ["image", "image link", "photo"],
    help: "Optional image for this variant.",
  },
];

/** CLEAR (any case) empties a value on an existing product. */
export const CLEAR_TOKEN = "CLEAR";
/** Template example rows have SKUs starting with this; the importer skips them. */
export const EXAMPLE_SKU_PREFIX = "EXAMPLE-";
export const ATTRIBUTE_PREFIX = "attr_";
export const OPTION_PREFIX = "option_";

/** Lower-case, no line breaks / NBSP / BOM, "_" "-" "." treated as spaces, no brackets. */
export function normaliseHeader(h: unknown): string {
  return String(h ?? "")
    .replace(/[\uFEFF\u200B-\u200D]/g, "")
    .replace(/[\r\n\t\u00A0]+/g, " ")
    .toLowerCase()
    .replace(/[()[\]*:#?]/g, " ")
    .replace(/[\s_\-.]+/g, " ")
    .trim();
}
