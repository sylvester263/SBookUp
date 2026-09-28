-- =====================================================================
-- Audit fix 2.4 (storefront side)
-- Problem: the cart only knew the price/quantity saved in the browser, so it
-- could not warn about out-of-stock items or stop quantities above stock.
-- Fix: cart_lines() returns, for each cart line, the CURRENT database price
-- and how many units are available. It never raises (a checkout attempt is
-- still validated by place_order()). For a bundle, "available" is the number
-- of complete bundles the component stock allows.
-- Read-only; runs with the caller's rights (public catalogue data only).
-- =====================================================================

create or replace function public.cart_lines(p_items jsonb)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_item jsonb;
  v_idx integer := 0;
  v_out jsonb := '[]'::jsonb;
  v_pid uuid; v_vid uuid; v_bid uuid; v_sbid uuid;
  v_name text; v_unit numeric; v_avail integer; v_ok boolean;
  p record; v record; b record;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    return v_out;
  end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_pid := null; v_vid := null; v_bid := null; v_sbid := null;
    v_name := null; v_unit := null; v_avail := 0; v_ok := false;
    begin
      v_pid  := nullif(v_item->>'product_id', '')::uuid;
      v_vid  := nullif(v_item->>'variant_id', '')::uuid;
      v_bid  := nullif(v_item->>'bundle_id', '')::uuid;
      v_sbid := nullif(v_item->>'school_bundle_id', '')::uuid;
    exception when others then
      v_pid := null; v_vid := null; v_bid := null; v_sbid := null;
    end;

    if v_pid is not null then
      select name, price, sale_price, stock_quantity, is_active into p from public.products where id = v_pid;
      if found and p.is_active then
        v_ok := true;
        v_name := p.name;
        v_unit := case when p.sale_price is not null and p.sale_price < p.price then p.sale_price else p.price end;
        v_avail := greatest(0, p.stock_quantity);
        if v_vid is not null then
          select name, price_modifier, stock into v from public.product_variants where id = v_vid and product_id = v_pid;
          if found then
            v_name := p.name || ' — ' || v.name;
            v_unit := v_unit + v.price_modifier;
            v_avail := greatest(0, v.stock);
          else
            v_ok := false;
          end if;
        end if;
      end if;
    elsif v_bid is not null then
      select name, total_price, discounted_price, is_active into b from public.bundles where id = v_bid;
      if found and b.is_active then
        v_ok := true;
        v_name := b.name;
        v_unit := case when b.discounted_price > 0 then b.discounted_price else b.total_price end;
        select coalesce(min(floor(pr.stock_quantity::numeric / s.q)), 0)::int into v_avail
        from (select product_id, sum(quantity) q from public.bundle_items where bundle_id = v_bid group by product_id) s
        join public.products pr on pr.id = s.product_id;
        v_avail := greatest(0, coalesce(v_avail, 0));
      end if;
    elsif v_sbid is not null then
      select bundle_name, total_price, is_active into b from public.school_bundles where id = v_sbid;
      if found and b.is_active then
        v_ok := true;
        v_name := b.bundle_name;
        v_unit := b.total_price;
        select coalesce(min(floor(pr.stock_quantity::numeric / s.q)), 0)::int into v_avail
        from (select product_id, sum(quantity) q from public.school_bundle_items where bundle_id = v_sbid group by product_id) s
        join public.products pr on pr.id = s.product_id;
        v_avail := greatest(0, coalesce(v_avail, 0));
      end if;
    end if;

    v_out := v_out || jsonb_build_object(
      'index', v_idx, 'available_for_sale', v_ok, 'name', v_name,
      'unit_price', v_unit, 'available', case when v_ok then v_avail else 0 end
    );
    v_idx := v_idx + 1;
  end loop;
  return v_out;
end;
$$;

revoke all on function public.cart_lines(jsonb) from public;
grant execute on function public.cart_lines(jsonb) to anon, authenticated, service_role;
