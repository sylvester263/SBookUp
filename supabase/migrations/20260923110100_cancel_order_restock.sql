-- =====================================================================
-- Audit fixes 2.2 + 2.3 (coupon reversal)
-- Problem: customers had no UPDATE permission on orders, so "cancel" silently
-- did nothing, and a cancelled order (from either side) never returned stock
-- or released its coupon use.
-- Fix:
--  * orders.restocked_at: set the first time an order's stock is returned,
--    so it can never be restocked twice;
--  * orders.coupon_counted: true when place_order() counted the coupon use.
--    Orders placed before this fix never counted one, so they get false and
--    their cancellation does not wrongly lower the coupon's usage count;
--  * _restock_order(): returns stock (products, variants, bundle and
--    school-bundle contents) and releases the coupon use, exactly once;
--  * trigger: ANY move to 'cancelled' (customer or admin) restocks;
--  * trigger: a cancelled order whose stock was returned cannot be re-opened
--    (its stock is no longer reserved); place a new order instead;
--  * cancel_my_order(): the customer-facing cancel.
-- =====================================================================

alter table public.orders add column if not exists restocked_at timestamptz;
alter table public.orders add column if not exists coupon_counted boolean not null default false;
-- Existing rows keep false (set above); new rows from place_order() get true.
alter table public.orders alter column coupon_counted set default true;

create or replace function public._restock_order(p_order_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  o record;
  li record;
begin
  select id, restocked_at, coupon_code, coupon_counted into o
  from public.orders where id = p_order_id for update;
  if not found or o.restocked_at is not null then
    return false;
  end if;

  for li in
    select product_id, variant_id, bundle_id, school_bundle_id, quantity
    from public.order_items where order_id = p_order_id
  loop
    if li.variant_id is not null then
      update public.product_variants set stock = stock + li.quantity where id = li.variant_id;
    elsif li.bundle_id is not null then
      update public.products p set stock_quantity = p.stock_quantity + s.q * li.quantity
      from (select product_id, sum(quantity) q from public.bundle_items
            where bundle_id = li.bundle_id group by product_id) s
      where p.id = s.product_id;
    elsif li.school_bundle_id is not null then
      update public.products p set stock_quantity = p.stock_quantity + s.q * li.quantity
      from (select product_id, sum(quantity) q from public.school_bundle_items
            where bundle_id = li.school_bundle_id group by product_id) s
      where p.id = s.product_id;
    elsif li.product_id is not null then
      update public.products set stock_quantity = stock_quantity + li.quantity where id = li.product_id;
    end if;
  end loop;

  if o.coupon_code is not null and o.coupon_counted then
    update public.coupons set uses_count = greatest(0, uses_count - 1)
    where upper(code) = upper(o.coupon_code);
  end if;

  update public.orders set restocked_at = now(), coupon_counted = false where id = p_order_id;
  return true;
end;
$$;
revoke all on function public._restock_order(uuid) from public, anon, authenticated;

create or replace function public.orders_after_cancel()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public._restock_order(new.id);
  return null;
end;
$$;
revoke all on function public.orders_after_cancel() from public, anon, authenticated;

drop trigger if exists trg_orders_restock_on_cancel on public.orders;
create trigger trg_orders_restock_on_cancel
  after update of status on public.orders
  for each row
  when (new.status = 'cancelled' and old.status is distinct from 'cancelled')
  execute function public.orders_after_cancel();

create or replace function public.orders_block_reopen()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status = 'cancelled' and new.status <> 'cancelled' and old.restocked_at is not null then
    raise exception 'This order was cancelled and its stock returned; it cannot be re-opened. Please create a new order.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_orders_block_reopen on public.orders;
create trigger trg_orders_block_reopen
  before update of status on public.orders
  for each row execute function public.orders_block_reopen();

create or replace function public.cancel_my_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  o record;
begin
  if v_uid is null then
    raise exception 'Please sign in';
  end if;
  select id, user_id, status, payment_status into o from public.orders where id = p_order_id for update;
  if not found or o.user_id is distinct from v_uid then
    raise exception 'Order not found';
  end if;
  if o.status = 'cancelled' then
    raise exception 'This order is already cancelled';
  end if;
  if o.status not in ('pending', 'confirmed') then
    raise exception 'This order can no longer be cancelled because it is already %. Please contact us.', o.status;
  end if;
  if o.payment_status = 'paid' then
    raise exception 'This order has already been paid. Please contact us to cancel and arrange a refund.';
  end if;

  update public.orders set status = 'cancelled' where id = p_order_id;  -- trigger restocks

  insert into public.activity_logs (admin_id, action, entity_type, entity_id, old_value, new_value)
  values (null, 'customer_cancelled', 'order', p_order_id,
          jsonb_build_object('status', o.status),
          jsonb_build_object('status', 'cancelled', 'by_user', v_uid));

  return jsonb_build_object('ok', true, 'status', 'cancelled');
end;
$$;
revoke all on function public.cancel_my_order(uuid) from public, anon;
grant execute on function public.cancel_my_order(uuid) to authenticated;
