-- =====================================================================
-- Audit fix 1.1 (+ groundwork for 2.3, 2.4, 2.5, 3.5, 3.6)
-- Problem: the placeOrder server function trusted the unit price sent by the
-- browser, checked no stock, skipped coupon expiry/limits and saved the order
-- and its items in separate, non-atomic steps.
-- Fix: all pricing, stock, coupon, shipping and tax logic now lives in the
-- database. public.place_order() does everything in ONE transaction;
-- public.quote_order() runs the same maths without saving anything.
-- Neither function accepts a price, total, status or payment status.
-- =====================================================================

-- School bundles can now be ordered as a single line (Task 3.6 groundwork).
alter table public.order_items
  add column if not exists school_bundle_id uuid references public.school_bundles(id) on delete set null;

-- Stock is now reduced inside place_order(); the old separate step is removed
-- so stock can never be reduced twice.
drop function if exists public.decrement_order_stock(uuid);

-- ---------------------------------------------------------------------
-- Internal pricing engine. Not callable by clients (execute revoked below).
-- Input p_items: [{ product_id?, variant_id?, bundle_id?, school_bundle_id?, quantity }]
-- Raises on unavailable items or insufficient stock.
-- Coupon problems are returned in "coupon_error" so a quote can still show a total.
-- ---------------------------------------------------------------------
create or replace function public._compute_order(
  p_items jsonb,
  p_city text,
  p_payment_method text,
  p_coupon_code text
) returns jsonb
language plpgsql
stable
set search_path = public
as $$
declare
  c_cod_fee constant numeric := 150;       -- COD handling fee (was hard-coded in the app)
  c_default_shipping constant numeric := 250; -- used when no shipping zone exists
  v_item jsonb;
  v_qty integer;
  v_pid uuid; v_vid uuid; v_bid uuid; v_sbid uuid;
  v_ids integer;
  v_name text;
  v_unit numeric;
  v_weight numeric := 0;
  v_subtotal numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_need_p jsonb := '{}'::jsonb;   -- product_id -> units needed
  v_need_v jsonb := '{}'::jsonb;   -- variant_id -> units needed
  p record; v record; b record; comp record;
  v_key text;
  v_zone record;
  v_delivery numeric;
  v_cod numeric;
  v_discount numeric := 0;
  v_coupon record;
  v_coupon_code text := nullif(upper(trim(coalesce(p_coupon_code, ''))), '');
  v_coupon_error text;
  v_free_shipping boolean := false;
  v_coupon_type text;
  v_tax_rate numeric;
  v_tax numeric;
begin
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Your cart is empty';
  end if;
  if jsonb_array_length(p_items) > 100 then
    raise exception 'Too many items in one order (max 100 lines)';
  end if;
  if p_payment_method is null or p_payment_method not in ('cod', 'bank_transfer', 'jazzcash', 'easypaisa') then
    raise exception 'Unsupported payment method';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := nullif(v_item->>'quantity', '')::integer;
    if v_qty is null or v_qty < 1 or v_qty > 99 then
      raise exception 'Invalid quantity in cart';
    end if;
    v_pid  := nullif(v_item->>'product_id', '')::uuid;
    v_vid  := nullif(v_item->>'variant_id', '')::uuid;
    v_bid  := nullif(v_item->>'bundle_id', '')::uuid;
    v_sbid := nullif(v_item->>'school_bundle_id', '')::uuid;
    v_ids := (v_pid is not null)::int + (v_bid is not null)::int + (v_sbid is not null)::int;
    if v_ids <> 1 or (v_vid is not null and v_pid is null) then
      raise exception 'Invalid cart line';
    end if;

    if v_pid is not null then
      select id, name, price, sale_price, weight_grams, is_active into p
      from public.products where id = v_pid;
      if not found or not p.is_active then
        raise exception 'An item in your cart is no longer available';
      end if;
      v_unit := case when p.sale_price is not null and p.sale_price < p.price then p.sale_price else p.price end;
      v_name := p.name;
      if v_vid is not null then
        select id, name, price_modifier into v
        from public.product_variants where id = v_vid and product_id = v_pid;
        if not found then
          raise exception '"%" option is no longer available', p.name;
        end if;
        v_unit := v_unit + v.price_modifier;
        v_name := p.name || ' — ' || v.name;
        v_need_v := jsonb_set(v_need_v, array[v_vid::text], to_jsonb(coalesce((v_need_v->>v_vid::text)::int, 0) + v_qty));
      else
        v_need_p := jsonb_set(v_need_p, array[v_pid::text], to_jsonb(coalesce((v_need_p->>v_pid::text)::int, 0) + v_qty));
      end if;
      v_weight := v_weight + coalesce(p.weight_grams, 0) * v_qty;

    elsif v_bid is not null then
      select id, name, total_price, discounted_price, is_active into b
      from public.bundles where id = v_bid;
      if not found or not b.is_active then
        raise exception 'A bundle in your cart is no longer available';
      end if;
      v_unit := case when b.discounted_price > 0 then b.discounted_price else b.total_price end;
      v_name := b.name;
      if not exists (select 1 from public.bundle_items where bundle_id = v_bid) then
        raise exception 'Bundle "%" has no items', b.name;
      end if;
      for comp in
        select bi.product_id, bi.quantity, pr.weight_grams
        from public.bundle_items bi join public.products pr on pr.id = bi.product_id
        where bi.bundle_id = v_bid
      loop
        v_need_p := jsonb_set(v_need_p, array[comp.product_id::text],
          to_jsonb(coalesce((v_need_p->>comp.product_id::text)::int, 0) + comp.quantity * v_qty));
        v_weight := v_weight + coalesce(comp.weight_grams, 0) * comp.quantity * v_qty;
      end loop;

    else
      select sb.id, sb.bundle_name, sb.total_price, sb.is_active, s.name as school_name, c.class_name into b
      from public.school_bundles sb
      join public.schools s on s.id = sb.school_id
      join public.school_classes c on c.id = sb.class_id
      where sb.id = v_sbid;
      if not found or not b.is_active then
        raise exception 'A school bundle in your cart is no longer available';
      end if;
      v_unit := b.total_price;
      v_name := b.school_name || ' — ' || b.class_name || ' (' || b.bundle_name || ')';
      if not exists (select 1 from public.school_bundle_items where bundle_id = v_sbid) then
        raise exception 'School bundle "%" has no items', v_name;
      end if;
      for comp in
        select sbi.product_id, sbi.quantity, pr.weight_grams
        from public.school_bundle_items sbi join public.products pr on pr.id = sbi.product_id
        where sbi.bundle_id = v_sbid
      loop
        v_need_p := jsonb_set(v_need_p, array[comp.product_id::text],
          to_jsonb(coalesce((v_need_p->>comp.product_id::text)::int, 0) + comp.quantity * v_qty));
        v_weight := v_weight + coalesce(comp.weight_grams, 0) * comp.quantity * v_qty;
      end loop;
    end if;

    if v_unit is null or v_unit < 0 then
      raise exception 'Price missing for "%"', v_name;
    end if;

    v_subtotal := v_subtotal + v_unit * v_qty;
    v_lines := v_lines || jsonb_build_object(
      'product_id', v_pid, 'variant_id', v_vid, 'bundle_id', v_bid, 'school_bundle_id', v_sbid,
      'name', v_name, 'unit_price', v_unit, 'quantity', v_qty, 'subtotal', v_unit * v_qty
    );
  end loop;

  -- Stock check (totals across all lines, including bundle components)
  for v_key in select jsonb_object_keys(v_need_p) loop
    select name, stock_quantity into p from public.products where id = v_key::uuid;
    if p.stock_quantity < (v_need_p->>v_key)::int then
      if p.stock_quantity <= 0 then
        raise exception '"%" is out of stock', p.name;
      end if;
      raise exception 'Not enough stock for "%": only % left', p.name, p.stock_quantity;
    end if;
  end loop;
  for v_key in select jsonb_object_keys(v_need_v) loop
    select pv.stock, pr.name || ' — ' || pv.name as name into v
    from public.product_variants pv join public.products pr on pr.id = pv.product_id
    where pv.id = v_key::uuid;
    if v.stock < (v_need_v->>v_key)::int then
      if v.stock <= 0 then
        raise exception '"%" is out of stock', v.name;
      end if;
      raise exception 'Not enough stock for "%": only % left', v.name, v.stock;
    end if;
  end loop;

  -- Shipping zone: matched by city on the server (client never picks the zone)
  select * into v_zone from public.shipping_zones z
  where z.is_active
    and exists (select 1 from unnest(z.cities) c where lower(trim(c)) = lower(trim(coalesce(p_city, ''))))
  order by z.created_at limit 1;
  if not found then
    select * into v_zone from public.shipping_zones z where z.is_active order by z.created_at limit 1;
  end if;
  if v_zone.id is null then
    v_delivery := c_default_shipping;
  else
    v_delivery := v_zone.base_rate + round((v_weight / 1000.0) * v_zone.per_kg_rate);
  end if;

  -- Coupon
  if v_coupon_code is not null then
    select * into v_coupon from public.coupons where upper(code) = v_coupon_code;
    if not found or not v_coupon.is_active then
      v_coupon_error := 'Invalid coupon code';
    elsif v_coupon.valid_from is not null and v_coupon.valid_from > now() then
      v_coupon_error := 'Coupon is not active yet';
    elsif v_coupon.valid_until is not null and v_coupon.valid_until < now() then
      v_coupon_error := 'Coupon expired';
    elsif v_coupon.max_uses is not null and v_coupon.uses_count >= v_coupon.max_uses then
      v_coupon_error := 'Coupon usage limit reached';
    elsif v_coupon.min_order_amount > v_subtotal then
      v_coupon_error := format('Minimum order for this coupon is PKR %s', v_coupon.min_order_amount);
    else
      v_coupon_type := v_coupon.type::text;
      if v_coupon.type = 'percentage' then
        v_discount := least(v_subtotal, round(v_subtotal * v_coupon.value / 100));
      elsif v_coupon.type = 'fixed' then
        v_discount := least(v_subtotal, v_coupon.value);
      else
        v_free_shipping := true;
      end if;
    end if;
  end if;
  if v_free_shipping then
    v_delivery := 0;
  end if;

  v_cod := case when p_payment_method = 'cod' then c_cod_fee else 0 end;

  select coalesce(tax_rate, 0) into v_tax_rate from public.store_settings where id = true;
  v_tax_rate := coalesce(v_tax_rate, 0);
  v_tax := case when v_tax_rate > 0 then round((v_subtotal - v_discount) * v_tax_rate / 100) else 0 end;

  return jsonb_build_object(
    'lines', v_lines,
    'subtotal', v_subtotal,
    'discount', v_discount,
    'delivery_fee', v_delivery,
    'cod_fee', v_cod,
    'shipping', v_delivery + v_cod,
    'tax_rate', v_tax_rate,
    'tax', v_tax,
    'total', greatest(0, v_subtotal - v_discount + v_delivery + v_cod + v_tax),
    'coupon_code', case when v_coupon_error is null then v_coupon_code end,
    'coupon_type', v_coupon_type,
    'coupon_error', v_coupon_error,
    'free_shipping', v_free_shipping,
    'zone_name', coalesce(v_zone.name, 'Standard'),
    'eta_days', coalesce(v_zone.estimated_days, 5),
    'weight_grams', v_weight,
    'need_products', v_need_p,
    'need_variants', v_need_v
  );
end;
$$;

revoke all on function public._compute_order(jsonb, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- quote_order: same inputs as place_order, saves nothing.
-- ---------------------------------------------------------------------
create or replace function public.quote_order(
  p_items jsonb,
  p_city text default null,
  p_payment_method text default 'cod',
  p_coupon_code text default null
) returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  r jsonb;
begin
  r := public._compute_order(p_items, p_city, p_payment_method, p_coupon_code);
  return r - 'need_products' - 'need_variants';
end;
$$;

revoke all on function public.quote_order(jsonb, text, text, text) from public;
grant execute on function public.quote_order(jsonb, text, text, text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------
-- place_order: the ONLY way to create an order.
-- ---------------------------------------------------------------------
create or replace function public.place_order(
  p_items jsonb,
  p_shipping_address jsonb,
  p_payment_method text,
  p_coupon_code text default null,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_addr jsonb;
  v_q jsonb;
  v_order_id uuid;
  v_order_number text;
  v_line jsonb;
  v_key text;
  v_prev integer;
  v_thr integer;
  v_new integer;
begin
  if v_uid is null then
    raise exception 'Please sign in to place an order';
  end if;

  -- Keep only known address fields
  v_addr := jsonb_strip_nulls(jsonb_build_object(
    'name',        nullif(trim(p_shipping_address->>'name'), ''),
    'phone',       nullif(trim(p_shipping_address->>'phone'), ''),
    'street',      nullif(trim(p_shipping_address->>'street'), ''),
    'city',        nullif(trim(p_shipping_address->>'city'), ''),
    'province',    nullif(trim(p_shipping_address->>'province'), ''),
    'postal_code', nullif(trim(p_shipping_address->>'postal_code'), '')
  ));
  if v_addr->>'name' is null or v_addr->>'phone' is null or v_addr->>'street' is null or v_addr->>'city' is null then
    raise exception 'Shipping address is incomplete';
  end if;
  if length(coalesce(p_notes, '')) > 500 then
    raise exception 'Order notes are too long (max 500 characters)';
  end if;

  -- Lock every product / variant row this order touches (stable order avoids deadlocks)
  perform 1 from public.products where id in (
    select nullif(e->>'product_id', '')::uuid from jsonb_array_elements(p_items) e where nullif(e->>'variant_id', '') is null
    union
    select bi.product_id from public.bundle_items bi
      where bi.bundle_id in (select nullif(e->>'bundle_id', '')::uuid from jsonb_array_elements(p_items) e)
    union
    select sbi.product_id from public.school_bundle_items sbi
      where sbi.bundle_id in (select nullif(e->>'school_bundle_id', '')::uuid from jsonb_array_elements(p_items) e)
  ) order by id for update;
  perform 1 from public.product_variants where id in (
    select nullif(e->>'variant_id', '')::uuid from jsonb_array_elements(p_items) e
  ) order by id for update;
  if nullif(trim(coalesce(p_coupon_code, '')), '') is not null then
    perform 1 from public.coupons where upper(code) = upper(trim(p_coupon_code)) for update;
  end if;

  -- Price everything from the database (raises on stock / availability problems)
  v_q := public._compute_order(p_items, v_addr->>'city', p_payment_method, p_coupon_code);
  if v_q->>'coupon_error' is not null then
    raise exception '%', v_q->>'coupon_error';
  end if;

  insert into public.orders (
    order_number, user_id, status, payment_status, payment_method,
    subtotal, shipping_cost, discount_amount, tax_amount, total,
    coupon_code, shipping_address, notes
  ) values (
    '', v_uid, 'pending', 'pending', p_payment_method::public.payment_method,
    (v_q->>'subtotal')::numeric, (v_q->>'shipping')::numeric, (v_q->>'discount')::numeric,
    (v_q->>'tax')::numeric, (v_q->>'total')::numeric,
    v_q->>'coupon_code', v_addr, nullif(trim(coalesce(p_notes, '')), '')
  ) returning id, order_number into v_order_id, v_order_number;

  for v_line in select * from jsonb_array_elements(v_q->'lines') loop
    insert into public.order_items (
      order_id, product_id, variant_id, bundle_id, school_bundle_id,
      name_snapshot, price_snapshot, quantity, subtotal
    ) values (
      v_order_id,
      nullif(v_line->>'product_id', '')::uuid,
      nullif(v_line->>'variant_id', '')::uuid,
      nullif(v_line->>'bundle_id', '')::uuid,
      nullif(v_line->>'school_bundle_id', '')::uuid,
      v_line->>'name', (v_line->>'unit_price')::numeric, (v_line->>'quantity')::int, (v_line->>'subtotal')::numeric
    );
  end loop;

  -- Reduce stock (rows are already locked and checked)
  for v_key in select jsonb_object_keys(v_q->'need_products') loop
    select stock_quantity, low_stock_threshold into v_prev, v_thr from public.products where id = v_key::uuid;
    v_new := v_prev - (v_q->'need_products'->>v_key)::int;
    update public.products set stock_quantity = v_new where id = v_key::uuid;
    if v_prev > coalesce(v_thr, 5) and v_new <= coalesce(v_thr, 5) then
      insert into public.activity_logs (action, entity_type, entity_id, old_value, new_value)
      values ('low_stock_alert', 'product', v_key::uuid,
              jsonb_build_object('stock', v_prev),
              jsonb_build_object('stock', v_new, 'threshold', coalesce(v_thr, 5)));
    end if;
  end loop;
  for v_key in select jsonb_object_keys(v_q->'need_variants') loop
    update public.product_variants
      set stock = stock - (v_q->'need_variants'->>v_key)::int
      where id = v_key::uuid;
  end loop;

  if v_q->>'coupon_code' is not null then
    update public.coupons set uses_count = uses_count + 1 where upper(code) = v_q->>'coupon_code';
  end if;

  return jsonb_build_object('order_id', v_order_id, 'order_number', v_order_number, 'total', (v_q->>'total')::numeric);
end;
$$;

revoke all on function public.place_order(jsonb, jsonb, text, text, text) from public, anon;
grant execute on function public.place_order(jsonb, jsonb, text, text, text) to authenticated, service_role;
