-- Order number trigger
DROP TRIGGER IF EXISTS trg_orders_set_order_number ON public.orders;
CREATE TRIGGER trg_orders_set_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_order_number();

-- updated_at triggers
DROP TRIGGER IF EXISTS trg_orders_set_updated_at ON public.orders;
CREATE TRIGGER trg_orders_set_updated_at BEFORE UPDATE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_profiles_set_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_addresses_set_updated_at ON public.addresses;
CREATE TRIGGER trg_addresses_set_updated_at BEFORE UPDATE ON public.addresses
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_products_set_updated_at ON public.products;
CREATE TRIGGER trg_products_set_updated_at BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_categories_set_updated_at ON public.categories;
CREATE TRIGGER trg_categories_set_updated_at BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS trg_bundles_set_updated_at ON public.bundles;
CREATE TRIGGER trg_bundles_set_updated_at BEFORE UPDATE ON public.bundles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- New user signup trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
