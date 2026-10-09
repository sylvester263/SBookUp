// Validates Variants-sheet rows (size / colour…) against the variant axes of
// the parent product's categories. The parent can be an existing product or a
// new product from the Products sheet of the same file. Upserts by variant_sku,
// otherwise by product + option combination.
import { comboKey, effectiveAttributesFor } from "@/lib/catalog-import";
import { matchOption } from "./attribute-schema";
import { categoryPath } from "./categories";
import { EXAMPLE_SKU_PREFIX, VARIANT_COLUMNS } from "./columns";
import { readBool, readCode, readNumber, readText, readUrl, rowReader } from "./validate-products";
import {
  statusOf,
  type ExistingProduct,
  type ExistingVariant,
  type ImportContext,
  type Issue,
  type MappedRow,
  type ProductPlan,
  type VariantPayload,
  type VariantPlan,
} from "./types";

export type VariantValidationOptions = { headerOf: Record<string, string> };

export function planVariants(
  rows: MappedRow[],
  ctx: ImportContext,
  existingProducts: ExistingProduct[],
  existingVariants: ExistingVariant[],
  productPlans: ProductPlan[],
  opts: VariantValidationOptions,
): VariantPlan[] {
  const bySku = new Map(existingProducts.filter((p) => p.sku).map((p) => [p.sku!, p]));
  const bySlug = new Map(existingProducts.map((p) => [p.slug, p]));
  const variantBySku = new Map(existingVariants.filter((v) => v.sku).map((v) => [v.sku!, v]));

  const plans = rows.map((row): VariantPlan => {
    const rd = rowReader(row, opts.headerOf, VARIANT_COLUMNS);
    const plan: VariantPlan = {
      row: row.rowNumber,
      status: "ok",
      action: "create",
      productKey: null,
      variantSku: null,
      options: {},
      issues: rd.issues,
      image: undefined,
      existingImage: null,
      newOptions: {},
    };

    // ---- parent product
    const pSku = readCode(rd, "product_sku", "product_sku");
    const pSlug = readText(rd, "product_slug");
    plan.productKey = pSku || pSlug || null;
    if (pSku && pSku.toUpperCase().startsWith(EXAMPLE_SKU_PREFIX)) {
      rd.warn("product_sku", "Example row from the template — skipped");
      plan.status = "skipped";
      plan.action = "skip";
      return plan;
    }
    const product: ExistingProduct | undefined =
      (pSku ? bySku.get(pSku) : undefined) ?? (pSlug ? bySlug.get(pSlug) : undefined);
    let categoryIds = product?.category_ids ?? [];
    if (!product && plan.productKey) {
      const inFile = productPlans.find(
        (p) => p.action !== "skip" && ((pSku && p.sku === pSku) || (pSlug && p.slug === pSlug)),
      );
      if (inFile?.status === "error")
        rd.error(
          pSku ? "product_sku" : "product_slug",
          `The product in row ${inFile.row} of the Products sheet has errors — fix it first`,
        );
      else if (inFile) {
        plan.parentInFile = true;
        if (inFile.productId) plan.productId = inFile.productId;
        categoryIds = inFile.categoryIds;
      } else {
        rd.error(
          pSku ? "product_sku" : "product_slug",
          `Product "${plan.productKey}" not found — check the SKU/slug, or add the product to the Products sheet`,
        );
      }
    } else if (!plan.productKey)
      rd.error("product_sku", "product_sku (or product_slug) is required", null);
    if (product) plan.productId = product.id;

    // ---- options
    const applicable = effectiveAttributesFor(categoryIds, ctx);
    const axes = applicable.filter((a) => a.variant_axis);
    if ((product || plan.parentInFile) && !axes.length) {
      const where =
        categoryIds.map((id) => categoryPath(id, ctx.categories)).join(", ") || "no category";
      rd.error(
        pSku ? "product_sku" : "product_slug",
        `This product's categories (${where}) have no variant options such as size or colour`,
      );
    }
    // ---- existing variant by variant SKU (SKUs are unique across all products)
    const vSku = readCode(rd, "variant_sku", "variant_sku");
    plan.variantSku = vSku ?? null;
    let match: ExistingVariant | undefined;
    if (vSku) {
      const v = variantBySku.get(vSku);
      if (v && plan.productId && v.product_id !== plan.productId) {
        const owner = existingProducts.find((p) => p.id === v.product_id);
        rd.error(
          "variant_sku",
          `variant_sku ${vSku} is already used by a variant of ${owner ? `"${owner.name}"` : "another product"}`,
        );
      } else if (v && plan.parentInFile && !plan.productId) {
        rd.error("variant_sku", `variant_sku ${vSku} is already used by another product's variant`);
      } else match = v;
    }

    // An option value this product's variants already use is accepted as stored
    // (even if the option was deactivated since), so an export re-imports cleanly.
    const siblings = existingVariants.filter(
      (v) => plan.productId && v.product_id === plan.productId,
    );
    const stored = (key: string, raw: string) =>
      [match, ...siblings]
        .map((v) => v?.option_values?.[key])
        .find((x) => x != null && x.trim().toLowerCase() === raw.trim().toLowerCase());
    const given: Record<string, string> = {};
    for (const f of Object.keys(row.values).filter((k) => k.startsWith("option:"))) {
      const c = rd.cell(f, false);
      if (c.kind !== "value") continue;
      const key = f.slice(7);
      const def = axes.find((a) => a.key === key);
      if (!def) {
        if (axes.length)
          rd.error(
            f,
            `${ctx.definitions.find((d) => d.key === key)?.label ?? key} is not a variant option for this product (options: ${axes.map((a) => a.label).join(", ")})`,
          );
        continue;
      }
      const keep = stored(key, c.raw);
      if (keep) {
        given[key] = keep;
        continue;
      }
      const m = matchOption(def, c.raw);
      if ("error" in m) rd.error(f, m.error);
      else {
        given[key] = m.value;
        if (m.isNew) plan.newOptions[key] = [m.value];
      }
    }

    // ---- otherwise match by product + option combination
    const options =
      match && !Object.keys(given).length
        ? { ...match.option_values }
        : { ...(match?.option_values ?? {}), ...given };
    for (const a of axes)
      if (!options[a.key])
        rd.error(`option:${a.key}`, `${a.label} is required for each variant`, null);
    if (!match && plan.productId) {
      const key = comboKey(options);
      match = existingVariants.find(
        (v) => v.product_id === plan.productId && comboKey(v.option_values ?? {}) === key,
      );
    }
    plan.options = options;
    plan.action = match ? "update" : "create";
    plan.existingImage = match?.image_url ?? null;

    // ---- fields
    const set: VariantPayload["set"] = {};
    const optionsChanged =
      !match || Object.keys(given).some((k) => given[k] !== match!.option_values?.[k]);
    if (optionsChanged) set.option_values = options;
    const name = readText(rd, "name");
    if (name) set.name = name;
    else if (optionsChanged)
      set.name =
        axes
          .map((a) => options[a.key])
          .filter(Boolean)
          .join(" / ") || "Variant";
    if (vSku !== undefined && vSku !== match?.sku) set.sku = vSku;
    const price = readNumber(rd, "price", { min: 0, max: 10_000_000 });
    if (price !== undefined) set.price = price;
    const compare = readNumber(rd, "compare_at_price", { min: 0, max: 10_000_000 });
    if (compare !== undefined) set.compare_at_price = compare;
    const finalPrice = price !== undefined ? price : match?.price;
    if (compare != null && finalPrice != null && compare <= finalPrice)
      rd.warn(
        "compare_at_price",
        `compare_at_price (${compare}) is not higher than the price (${finalPrice}), so it won't show`,
      );
    const stock = readNumber(rd, "stock", { int: true, min: 0, max: 10_000_000 });
    if (stock != null) set.stock = stock;
    const active = readBool(rd, "is_active");
    if (active !== undefined) set.is_active = active;
    const img = rd.cell("image_url", true);
    if (img.kind === "clear") plan.image = null;
    else if (img.kind === "value" && readUrl(rd, "image_url", img.raw)) plan.image = img.raw;

    plan.payload = {
      row: row.rowNumber,
      id: match?.id ?? null,
      product_id: plan.productId ?? null,
      set,
    };
    plan.status = statusOf(rd.issues);
    return plan;
  });

  // ---- duplicates inside the file
  const live = plans.filter((p) => p.action !== "skip");
  const dupes = (
    key: (p: VariantPlan) => string | null,
    column: string,
    what: (k: string) => string,
  ) => {
    const groups = new Map<string, VariantPlan[]>();
    for (const p of live) {
      const k = key(p);
      if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
    }
    for (const [k, list] of groups) {
      if (list.length < 2) continue;
      for (const p of list) {
        const others = list
          .filter((o) => o !== p)
          .map((o) => o.row)
          .join(", ");
        p.issues.push({
          row: p.row,
          column,
          value: k.split("#").pop() ?? k,
          message: `${what(k)} is also in row ${others}`,
          level: "error",
        } satisfies Issue);
      }
    }
  };
  dupes(
    (p) => p.variantSku,
    opts.headerOf.variant_sku ?? "variant_sku",
    (k) => `variant_sku "${k}"`,
  );
  dupes(
    (p) =>
      p.productKey && Object.keys(p.options).length
        ? `${p.productKey}#${comboKey(p.options)}`
        : null,
    opts.headerOf.product_sku ?? opts.headerOf.product_slug ?? "product_sku",
    () => "The same product + options combination",
  );
  for (const p of plans) if (p.action !== "skip") p.status = statusOf(p.issues);
  return plans;
}
