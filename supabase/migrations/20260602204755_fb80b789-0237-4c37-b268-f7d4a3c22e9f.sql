
revoke execute on function public.decrement_order_stock(uuid) from public, anon, authenticated;
revoke execute on function public.get_low_stock_products(integer) from public, anon, authenticated;
grant execute on function public.decrement_order_stock(uuid) to service_role;
grant execute on function public.get_low_stock_products(integer) to service_role;
