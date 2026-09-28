-- =====================================================================
-- Audit fixes, Priority 3 (schema + pricing update)
--  3.1 Payments: store settings get bank details and on/off switches for each
--      payment method; orders get a payment-proof path; a PRIVATE storage
--      bucket 'payment-proofs' holds proofs (customers write only into their
--      own folder, staff read all); attach_payment_proof() links a proof to
--      the customer's own bank-transfer order and marks it
--      'pending_verification'.
--  3.2 Email: store logo, newsletter_campaigns log.
--  3.3 Messages: contact_messages get archive / reply tracking.
--  3.4 Variants: product_variants get their own price (overrides
--      price_modifier), active flag and weight.
--  3.5 Shipping: shipping_zones get an optional free-delivery threshold
--      (NULL = none, so nothing changes until an admin sets one).
--  _compute_order() and cart_lines() are replaced to use all of the above.
--  The pricing logic is otherwise identical to 20260923100000.
-- =====================================================================

-- ---------- 3.1 store settings: bank details + payment switches ----------
alter table public.store_settings
  add column if not exists bank_name text,
  add column if not exists bank_account_title text,
  add column if not exists bank_account_number text,
  add column if not exists bank_iban text,
  add column if not exists bank_instructions text,
  add column if not exists enable_cod boolean not null default true,
  add column if not exists enable_bank_transfer boolean not null default true,
  add column if not exists enable_jazzcash boolean not null default false,
  add column if not exists enable_easypaisa boolean not null default false,
  add column if not exists logo_url text;

-- ---------- 3.1 orders: payment proof ----------
alter table public.orders
  add column if not exists payment_proof_path text,
  add column if not exists payment_proof_uploaded_at timestamptz,
  add column if not exists payment_reference text;

insert into storage.buckets (id, name, public)
values ('payment-proofs', 'payment-proofs', false)
on conflict (id) do nothing;

drop policy if exists "payment_proofs_owner_insert" on storage.objects;
create policy "payment_proofs_owner_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "payment_proofs_owner_read" on storage.objects;
create policy "payment_proofs_owner_read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (storage.foldername(name))[1] = auth.uid()::text);
drop policy if exists "payment_proofs_staff_read" on storage.objects;
create policy "payment_proofs_staff_read" on storage.objects for select to authenticated
  using (bucket_id = 'payment-proofs' and (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager')));

create or replace function public.attach_payment_proof(p_order_id uuid, p_path text)
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
  select id, user_id, payment_method, payment_status, status into o from public.orders where id = p_order_id for update;
  if not found or o.user_id is distinct from v_uid then
    raise exception 'Order not found';
  end if;
  if o.payment_method <> 'bank_transfer' then
    raise exception 'Payment proof is only needed for bank transfer orders';
  end if;
  if o.status in ('cancelled', 'refunded') or o.payment_status in ('paid', 'refunded') then
    raise exception 'This order no longer needs a payment proof';
  end if;
  -- The file must be inside the customer's own folder for this order.
  if p_path is null or p_path not like (v_uid::text || '/' || p_order_id::text || '/%') or p_path like '%..%' then
    raise exception 'Invalid file path';
  end if;
  update public.orders
    set payment_proof_path = p_path,
        payment_proof_uploaded_at = now(),
        payment_status = 'pending_verification'
    where id = p_order_id;
  return jsonb_build_object('ok', true, 'payment_status', 'pending_verification');
end;
$$;
revoke all on function public.attach_payment_proof(uuid, text) from public, anon;
grant execute on function public.attach_payment_proof(uuid, text) to authenticated;

-- ---------- 3.2 newsletter campaigns ----------
create table if not exists public.newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  body text not null,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  sent_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.newsletter_campaigns enable row level security;
grant select, insert on public.newsletter_campaigns to authenticated;
grant all on public.newsletter_campaigns to service_role;
drop policy if exists "newsletter_campaigns_staff" on public.newsletter_campaigns;
create policy "newsletter_campaigns_staff" on public.newsletter_campaigns for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

-- ---------- 3.3 contact messages ----------
alter table public.contact_messages
  add column if not exists archived_at timestamptz,
  add column if not exists replied_at timestamptz,
  add column if not exists reply_body text;
create index if not exists contact_messages_inbox_idx on public.contact_messages (archived_at, is_read, created_at desc);

-- ---------- 3.4 variants ----------
alter table public.product_variants
  add column if not exists price numeric(12,2) check (price is null or price >= 0),
  add column if not exists is_active boolean not null default true,
  add column if not exists weight_grams integer check (weight_grams is null or weight_grams >= 0);

-- ---------- 3.5 zone free-delivery threshold ----------
alter table public.shipping_zones
  add column if not exists free_shipping_threshold numeric(12,2) check (free_shipping_threshold is null or free_shipping_threshold >= 0);

-- ---------- pricing engine (replaces 20260923100000 version) ----------
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
  v_settings record;
  v_line_weight numeric;
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

  -- Payment methods can be switched on/off in store settings (3.1)
  select * into v_settings from public.store_settings where id = true;
  if (p_payment_method = 'cod' and not coalesce(v_settings.enable_cod, true))
     or (p_payment_method = 'bank_transfer' and not coalesce(v_settings.enable_bank_transfer, true))
     or (p_payment_method = 'jazzcash' and not coalesce(v_settings.enable_jazzcash, false))
     or (p_payment_method = 'easypaisa' and not coalesce(v_settings.enable_easypaisa, false)) then
    raise exception 'This payment method is not available';
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
      v_line_weight := coalesce(p.weight_grams, 0);
      if v_vid is not null then
        select id, name, price_modifier, price, is_active, weight_grams into v
        from public.product_variants where id = v_vid and product_id = v_pid;
        if not found or not v.is_active then
          raise exception '"%" option is no longer available', p.name;
        end if;
        -- A variant's own price wins; otherwise product price + modifier (3.4)
        v_unit := coalesce(v.price, v_unit + v.price_modifier);
        v_line_weight := coalesce(v.weight_grams, p.weight_grams, 0);
        v_name := p.name || ' — ' || v.name;
        v_need_v := jsonb_set(v_need_v, array[v_vid::text], to_jsonb(coalesce((v_need_v->>v_vid::text)::int, 0) + v_qty));
      else
        v_need_p := jsonb_set(v_need_p, array[v_pid::text], to_jsonb(coalesce((v_need_p->>v_pid::text)::int, 0) + v_qty));
      end if;
      v_weight := v_weight + v_line_weight * v_qty;

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
  -- Zone free-delivery threshold (3.5): applies to the discounted subtotal.
  if v_zone.free_shipping_threshold is not null and (v_subtotal - v_discount) >= v_zone.free_shipping_threshold then
    v_free_shipping := true;
  end if;
  if v_free_shipping then
    v_delivery := 0;
  end if;

  v_cod := case when p_payment_method = 'cod' then c_cod_fee else 0 end;

  v_tax_rate := coalesce(v_settings.tax_rate, 0);
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
    'free_shipping_threshold', v_zone.free_shipping_threshold,
    'eta_days', coalesce(v_zone.estimated_days, 5),
    'weight_grams', v_weight,
    'need_products', v_need_p,
    'need_variants', v_need_v
  );
end;
$$;


revoke all on function public._compute_order(jsonb, text, text, text) from public, anon, authenticated;

-- ---------- cart_lines (replaces 20260923110200 version) ----------
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
          select name, price_modifier, price, stock, is_active into v from public.product_variants where id = v_vid and product_id = v_pid;
          if found and v.is_active then
            v_name := p.name || ' — ' || v.name;
            v_unit := coalesce(v.price, v_unit + v.price_modifier);
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
