
create or replace function public.decrement_order_stock(p_order_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  oi record;
  bi record;
  prev_qty integer;
  new_qty integer;
  thr integer;
  prod_id uuid;
  dec_amount integer;
begin
  -- Regular product items (bundle_id is null)
  for oi in
    select id, product_id, variant_id, quantity
    from public.order_items
    where order_id = p_order_id and bundle_id is null
  loop
    if oi.variant_id is not null then
      update public.product_variants
      set stock = greatest(0, stock - oi.quantity)
      where id = oi.variant_id;
    end if;

    if oi.product_id is not null then
      select stock_quantity, low_stock_threshold
        into prev_qty, thr
      from public.products
      where id = oi.product_id
      for update;

      if prev_qty is not null then
        new_qty := greatest(0, prev_qty - oi.quantity);
        update public.products
        set stock_quantity = new_qty
        where id = oi.product_id;

        if prev_qty > coalesce(thr, 5) and new_qty <= coalesce(thr, 5) then
          insert into public.activity_logs (action, entity_type, entity_id, old_value, new_value)
          values ('low_stock_alert', 'product', oi.product_id,
                  jsonb_build_object('stock', prev_qty),
                  jsonb_build_object('stock', new_qty, 'threshold', coalesce(thr, 5)));
        end if;
      end if;
    end if;
  end loop;

  -- Bundle items
  for oi in
    select id, bundle_id, quantity
    from public.order_items
    where order_id = p_order_id and bundle_id is not null
  loop
    for bi in
      select product_id, quantity from public.bundle_items where bundle_id = oi.bundle_id
    loop
      dec_amount := bi.quantity * oi.quantity;
      select stock_quantity, low_stock_threshold
        into prev_qty, thr
      from public.products
      where id = bi.product_id
      for update;

      if prev_qty is not null then
        new_qty := greatest(0, prev_qty - dec_amount);
        update public.products
        set stock_quantity = new_qty
        where id = bi.product_id;

        if prev_qty > coalesce(thr, 5) and new_qty <= coalesce(thr, 5) then
          insert into public.activity_logs (action, entity_type, entity_id, old_value, new_value)
          values ('low_stock_alert', 'product', bi.product_id,
                  jsonb_build_object('stock', prev_qty),
                  jsonb_build_object('stock', new_qty, 'threshold', coalesce(thr, 5)));
        end if;
      end if;
    end loop;
  end loop;
end;
$$;

grant execute on function public.decrement_order_stock(uuid) to authenticated, service_role;

-- Helper for admin dashboard: products at/under their threshold
create or replace function public.get_low_stock_products(p_limit integer default 50)
returns table (
  id uuid,
  name text,
  stock_quantity integer,
  low_stock_threshold integer,
  price numeric,
  category_name text
)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.name, p.stock_quantity, p.low_stock_threshold, p.price, c.name as category_name
  from public.products p
  left join public.categories c on c.id = p.category_id
  where p.is_active = true
    and p.stock_quantity <= p.low_stock_threshold
  order by p.stock_quantity asc
  limit p_limit;
$$;

grant execute on function public.get_low_stock_products(integer) to authenticated, service_role;
