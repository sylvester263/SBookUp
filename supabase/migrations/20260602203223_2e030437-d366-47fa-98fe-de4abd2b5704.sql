
-- 1) Restrict products.cost_price from public and authenticated SELECT via column-level grants
REVOKE SELECT ON public.products FROM anon;
REVOKE SELECT ON public.products FROM authenticated;

GRANT SELECT (
  id, name, slug, sku, isbn, category_id, brand, author, publisher, edition,
  description, price, sale_price, stock_quantity, low_stock_threshold,
  weight_grams, is_active, is_featured, images, tags, created_at, updated_at
) ON public.products TO anon;

GRANT SELECT (
  id, name, slug, sku, isbn, category_id, brand, author, publisher, edition,
  description, price, sale_price, stock_quantity, low_stock_threshold,
  weight_grams, is_active, is_featured, images, tags, created_at, updated_at
) ON public.products TO authenticated;

-- service_role retains full access (already granted ALL elsewhere); ensure it
GRANT ALL ON public.products TO service_role;

-- 2) Remove broad authenticated read access to coupons.
-- Staff (admin/manager) keep full access via existing coupons_staff_write (FOR ALL).
-- Coupon validation for shoppers runs through validateCoupon server fn using service role.
DROP POLICY IF EXISTS coupons_authenticated_read ON public.coupons;
