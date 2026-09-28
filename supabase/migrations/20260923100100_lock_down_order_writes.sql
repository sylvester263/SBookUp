-- =====================================================================
-- Audit fix 1.2
-- Problem: the INSERT policies on orders / order_items only checked user_id,
-- so any signed-in customer could call the Supabase API directly and create an
-- order with any total, status ('delivered') or payment_status ('paid'), or add
-- items to other people's guest orders.
-- Fix:
--  * drop the customer INSERT policies; orders are created only by
--    public.place_order() (SECURITY DEFINER, see 20260923100000);
--  * customers keep SELECT on their own orders / items (existing policies);
--  * staff keep full access (existing orders_staff_all / order_items_staff_all);
--  * a trigger blocks every INSERT/UPDATE/DELETE made through the public API
--    roles (anon / authenticated) unless the caller is staff. Trusted database
--    functions run as their owner, and the service_role key is not affected.
-- =====================================================================

drop policy if exists "orders_owner_insert" on public.orders;
drop policy if exists "order_items_owner_insert" on public.order_items;

create or replace function public.guard_order_writes()
returns trigger
language plpgsql
security invoker            -- must be invoker so current_user is the real caller
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated')
     and not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager')) then
    raise exception 'Orders can only be created or changed through checkout or by staff'
      using errcode = '42501';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_orders_guard_writes on public.orders;
create trigger trg_orders_guard_writes
  before insert or update or delete on public.orders
  for each row execute function public.guard_order_writes();

drop trigger if exists trg_order_items_guard_writes on public.order_items;
create trigger trg_order_items_guard_writes
  before insert or update or delete on public.order_items
  for each row execute function public.guard_order_writes();
