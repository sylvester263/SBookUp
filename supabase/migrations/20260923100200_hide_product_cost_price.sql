-- =====================================================================
-- Audit fix 1.3
-- Problem: migration 20260602203223 hid products.cost_price with column grants,
-- but 20260602212813 re-ran "GRANT SELECT ON public.products TO anon,
-- authenticated", exposing every column again. The storefront's
-- select('*') on products sent cost_price to every visitor.
-- Fix: revoke table-wide SELECT and grant SELECT on every column EXCEPT
-- cost_price. Staff read cost_price only through server functions that
-- check the staff role first and then use the service-role client.
-- NOTE: a column added to products later will NOT be readable by the
-- public until it is added to this grant list in a new migration.
-- INSERT / UPDATE / DELETE grants are unchanged (RLS still limits them to staff).
-- =====================================================================

revoke select on public.products from anon, authenticated;

grant select (
  id, name, slug, description, sku, isbn, category_id, brand, author, publisher, edition,
  price, sale_price, stock_quantity, low_stock_threshold, weight_grams,
  images, tags, is_featured, is_active, created_at, updated_at
) on public.products to anon, authenticated;

grant all on public.products to service_role;
