
-- Public read tables (anon + authenticated)
GRANT SELECT ON public.products TO anon, authenticated;
GRANT SELECT ON public.categories TO anon, authenticated;
GRANT SELECT ON public.bundles TO anon, authenticated;
GRANT SELECT ON public.bundle_items TO anon, authenticated;
GRANT SELECT ON public.product_variants TO anon, authenticated;
GRANT SELECT ON public.banners TO anon, authenticated;
GRANT SELECT ON public.shipping_zones TO anon, authenticated;
GRANT SELECT ON public.reviews TO anon, authenticated;

-- Staff write on public catalog tables
GRANT INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bundles TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.bundle_items TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_variants TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.banners TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.shipping_zones TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.reviews TO authenticated;

-- User-scoped tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.addresses TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wishlist TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reminders TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT ON public.user_roles TO authenticated;
GRANT SELECT, INSERT ON public.activity_logs TO authenticated;

-- Public insert tables
GRANT INSERT ON public.contact_messages TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.contact_messages TO authenticated;
GRANT INSERT ON public.newsletters TO anon, authenticated;
GRANT SELECT, UPDATE, DELETE ON public.newsletters TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.coupons TO authenticated;

-- service_role full access on all public tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;
