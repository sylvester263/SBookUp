-- =====================================================================
-- Bulk importer rebuild (IMPORT_AUDIT.md, fix plan step 3)
--
--  import_lookup_products / import_lookup_variants
--    Staff-only lookups sent as an RPC body (POST) instead of a long
--    ?slug=in.(...) URL, which broke for files with a few hundred rows.
--  import_products_batch / import_variants_batch
--    Write one batch (<= 200 rows) in ONE transaction. Every row is tried in
--    its own sub-transaction so all failures are collected; if any row failed
--    the whole batch is rolled back and the failed rows are returned in the
--    error DETAIL as JSON: [{"row":12,"code":"23505","constraint":"...","message":"..."}].
--    Only the keys present in a row's "set" object are written (a column that
--    is missing from the sheet never erases data). Attributes are merged.
--    Returns [{"row":..,"id":..,"action":"created"|"updated"}] only — never cost_price.
--
-- SECURITY DEFINER so staff can write cost_price (hidden from anon /
-- authenticated by the column grant in 20260923100200) without the service
-- role key. Each function checks the caller's staff role itself; anon and
-- PUBLIC cannot execute them. RLS and the cost_price grant are unchanged.
-- =====================================================================

create or replace function public._import_assert_staff()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null or not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager')) then
    raise exception 'Forbidden: staff only' using errcode = '42501';
  end if;
end; $$;
revoke all on function public._import_assert_staff() from public, anon, authenticated;

-- ISBNs are matched on digits / X only, so "978-969-35-0000-1" = "9789693500001".
create index if not exists products_isbn_norm_idx
  on public.products (upper(regexp_replace(isbn, '[^0-9Xx]', '', 'g')))
  where isbn is not null;

-- ---------------------------------------------------------------- lookups
-- p: {"skus": [...], "isbns": [... normalised ...], "slugs": [...]}
create or replace function public.import_lookup_products(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_skus text[] := array(select jsonb_array_elements_text(coalesce(p->'skus', '[]')));
  v_isbns text[] := array(select upper(jsonb_array_elements_text(coalesce(p->'isbns', '[]'))));
  v_slugs text[] := array(select jsonb_array_elements_text(coalesce(p->'slugs', '[]')));
begin
  perform public._import_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', pr.id, 'name', pr.name, 'slug', pr.slug, 'sku', pr.sku, 'isbn', pr.isbn,
      'price', pr.price, 'sale_price', pr.sale_price, 'sell_unit', pr.sell_unit,
      'pack_size', pr.pack_size, 'unit_label', pr.unit_label, 'attributes', pr.attributes,
      'images', to_jsonb(pr.images),
      'category_ids', coalesce((
        select jsonb_agg(pc.category_id order by pc.is_primary desc, pc.created_at, pc.category_id)
        from public.product_categories pc where pc.product_id = pr.id), '[]'::jsonb)
    ))
    from public.products pr
    where pr.sku = any(v_skus)
       or pr.slug = any(v_slugs)
       or (pr.isbn is not null and upper(regexp_replace(pr.isbn, '[^0-9Xx]', '', 'g')) = any(v_isbns))
  ), '[]'::jsonb);
end; $$;

-- p: {"product_ids": [...], "skus": [...]}  (variant SKUs are unique across ALL products)
create or replace function public.import_lookup_variants(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_ids uuid[] := array(select (jsonb_array_elements_text(coalesce(p->'product_ids', '[]')))::uuid);
  v_skus text[] := array(select jsonb_array_elements_text(coalesce(p->'skus', '[]')));
begin
  perform public._import_assert_staff();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', v.id, 'product_id', v.product_id, 'sku', v.sku, 'name', v.name,
      'option_values', v.option_values, 'price', v.price, 'compare_at_price', v.compare_at_price,
      'stock', v.stock, 'image_url', v.image_url, 'is_active', v.is_active
    ))
    from public.product_variants v
    where v.product_id = any(v_ids) or v.sku = any(v_skus)
  ), '[]'::jsonb);
end; $$;

-- ---------------------------------------------------------------- new options
-- {"author": ["Bano Qudsia"], ...} → appended to definitions that allow new options
-- (case-insensitive: an existing "Umera Ahmed" is never duplicated as "umera ahmed").
create or replace function public._import_add_options(p_new jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare k text; v text; d record; v_sort int;
begin
  for k in select jsonb_object_keys(coalesce(p_new, '{}'::jsonb)) loop
    select id, options into d from public.attribute_definitions where key = k and allow_new_options;
    if not found then continue; end if;
    for v in select distinct trim(x) from jsonb_array_elements_text(p_new->k) x where trim(x) <> '' loop
      if exists (select 1 from jsonb_array_elements(d.options) o where lower(o->>'value') = lower(v)) then continue; end if;
      select coalesce(max((o->>'sort')::int), 0) + 1 into v_sort from jsonb_array_elements(d.options) o;
      d.options := d.options || jsonb_build_array(jsonb_build_object('value', v, 'label', v, 'sort', v_sort));
    end loop;
    update public.attribute_definitions set options = d.options where id = d.id and options is distinct from d.options;
  end loop;
end; $$;
revoke all on function public._import_add_options(jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- products
-- p_rows: [{"row": 2, "id": uuid|null, "set": {...columns...},
--           "attributes_set": {...}, "attributes_unset": [...], "category_ids": [primary, ...]|null}]
create or replace function public.import_products_batch(p_rows jsonb, p_new_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; s jsonb; v_id uuid; v_cats uuid[]; v_action text;
  v_out jsonb := '[]'::jsonb; v_errors jsonb := '[]'::jsonb;
  v_con text; v_msg text; v_state text;
begin
  perform public._import_assert_staff();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'import_products_batch: send at most 200 rows per batch' using errcode = '22023';
  end if;
  perform public._import_add_options(p_new_options);

  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      s := coalesce(r->'set', '{}'::jsonb);
      v_id := nullif(r->>'id', '')::uuid;
      v_cats := case when jsonb_typeof(r->'category_ids') = 'array'
                     then array(select (jsonb_array_elements_text(r->'category_ids'))::uuid) end;

      if v_id is null then
        insert into public.products (
          name, slug, description, sku, isbn, brand, edition, price, sale_price, cost_price,
          stock_quantity, low_stock_threshold, weight_grams, sell_unit, pack_size, unit_label,
          is_active, is_featured, is_new_arrival, new_arrival_until, tags, attributes, category_id
        ) values (
          s->>'name', s->>'slug', s->>'description', s->>'sku', s->>'isbn', s->>'brand', s->>'edition',
          (s->>'price')::numeric, (s->>'sale_price')::numeric, (s->>'cost_price')::numeric,
          coalesce((s->>'stock_quantity')::int, 0), coalesce((s->>'low_stock_threshold')::int, 5),
          (s->>'weight_grams')::int, coalesce(s->>'sell_unit', 'item'), (s->>'pack_size')::int, s->>'unit_label',
          coalesce((s->>'is_active')::boolean, true), coalesce((s->>'is_featured')::boolean, false),
          coalesce((s->>'is_new_arrival')::boolean, false), (s->>'new_arrival_until')::date,
          coalesce(array(select jsonb_array_elements_text(s->'tags')), '{}'),
          coalesce(r->'attributes_set', '{}'::jsonb), v_cats[1]
        ) returning id into v_id;
        v_action := 'created';
      else
        update public.products p set
          name = case when s ? 'name' then s->>'name' else p.name end,
          slug = case when s ? 'slug' then s->>'slug' else p.slug end,
          description = case when s ? 'description' then s->>'description' else p.description end,
          sku = case when s ? 'sku' then s->>'sku' else p.sku end,
          isbn = case when s ? 'isbn' then s->>'isbn' else p.isbn end,
          brand = case when s ? 'brand' then s->>'brand' else p.brand end,
          edition = case when s ? 'edition' then s->>'edition' else p.edition end,
          price = case when s ? 'price' then (s->>'price')::numeric else p.price end,
          sale_price = case when s ? 'sale_price' then (s->>'sale_price')::numeric else p.sale_price end,
          cost_price = case when s ? 'cost_price' then (s->>'cost_price')::numeric else p.cost_price end,
          stock_quantity = case when s ? 'stock_quantity' then coalesce((s->>'stock_quantity')::int, 0) else p.stock_quantity end,
          low_stock_threshold = case when s ? 'low_stock_threshold' then coalesce((s->>'low_stock_threshold')::int, 5) else p.low_stock_threshold end,
          weight_grams = case when s ? 'weight_grams' then (s->>'weight_grams')::int else p.weight_grams end,
          sell_unit = case when s ? 'sell_unit' then coalesce(s->>'sell_unit', 'item') else p.sell_unit end,
          pack_size = case when s ? 'pack_size' then (s->>'pack_size')::int else p.pack_size end,
          unit_label = case when s ? 'unit_label' then s->>'unit_label' else p.unit_label end,
          is_active = case when s ? 'is_active' then coalesce((s->>'is_active')::boolean, p.is_active) else p.is_active end,
          is_featured = case when s ? 'is_featured' then coalesce((s->>'is_featured')::boolean, p.is_featured) else p.is_featured end,
          is_new_arrival = case when s ? 'is_new_arrival' then coalesce((s->>'is_new_arrival')::boolean, p.is_new_arrival) else p.is_new_arrival end,
          new_arrival_until = case when s ? 'new_arrival_until' then (s->>'new_arrival_until')::date else p.new_arrival_until end,
          tags = case when s ? 'tags' then coalesce(array(select jsonb_array_elements_text(s->'tags')), '{}') else p.tags end,
          attributes = (p.attributes || coalesce(r->'attributes_set', '{}'::jsonb))
                       - coalesce(array(select jsonb_array_elements_text(r->'attributes_unset')), '{}')
        where p.id = v_id;
        if not found then
          raise exception 'product % no longer exists', v_id using errcode = 'P0002';
        end if;
        -- Primary category: the products.category_id sync trigger moves the primary link.
        if v_cats is not null then
          update public.products set category_id = v_cats[1] where id = v_id and category_id is distinct from v_cats[1];
        end if;
        v_action := 'updated';
      end if;

      -- Extra categories (primary first in the list); categories not listed are removed.
      if v_cats is not null then
        insert into public.product_categories (product_id, category_id, is_primary)
        select v_id, c, false from unnest(v_cats[2:]) c
        on conflict (product_id, category_id) do nothing;
        delete from public.product_categories where product_id = v_id and category_id <> all(v_cats);
      end if;

      v_out := v_out || jsonb_build_object('row', r->'row', 'id', v_id, 'action', v_action);
    exception when others then
      get stacked diagnostics v_con = constraint_name, v_msg = message_text, v_state = returned_sqlstate;
      v_errors := v_errors || jsonb_build_object('row', r->'row', 'code', v_state, 'constraint', nullif(v_con, ''), 'message', v_msg);
    end;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception 'import_batch_failed' using errcode = 'P0001', detail = v_errors::text;
  end if;
  return v_out;
end; $$;

-- ---------------------------------------------------------------- variants
-- p_rows: [{"row": 2, "id": uuid|null, "product_id": uuid, "set": {name, sku, price,
--           compare_at_price, stock, is_active, image_url, option_values}}]
create or replace function public.import_variants_batch(p_rows jsonb, p_new_options jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  r jsonb; s jsonb; v_id uuid; v_action text;
  v_out jsonb := '[]'::jsonb; v_errors jsonb := '[]'::jsonb;
  v_con text; v_msg text; v_state text;
begin
  perform public._import_assert_staff();
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 200 then
    raise exception 'import_variants_batch: send at most 200 rows per batch' using errcode = '22023';
  end if;
  perform public._import_add_options(p_new_options);

  for r in select value from jsonb_array_elements(p_rows) loop
    begin
      s := coalesce(r->'set', '{}'::jsonb);
      v_id := nullif(r->>'id', '')::uuid;
      if v_id is null then
        insert into public.product_variants (product_id, name, sku, price, compare_at_price, stock, is_active, image_url, option_values)
        values (
          (r->>'product_id')::uuid, s->>'name', s->>'sku', (s->>'price')::numeric, (s->>'compare_at_price')::numeric,
          coalesce((s->>'stock')::int, 0), coalesce((s->>'is_active')::boolean, true), s->>'image_url',
          coalesce(s->'option_values', '{}'::jsonb)
        ) returning id into v_id;
        v_action := 'created';
      else
        update public.product_variants v set
          name = case when s ? 'name' then s->>'name' else v.name end,
          sku = case when s ? 'sku' then s->>'sku' else v.sku end,
          price = case when s ? 'price' then (s->>'price')::numeric else v.price end,
          compare_at_price = case when s ? 'compare_at_price' then (s->>'compare_at_price')::numeric else v.compare_at_price end,
          stock = case when s ? 'stock' then coalesce((s->>'stock')::int, 0) else v.stock end,
          is_active = case when s ? 'is_active' then coalesce((s->>'is_active')::boolean, v.is_active) else v.is_active end,
          image_url = case when s ? 'image_url' then s->>'image_url' else v.image_url end,
          option_values = case when s ? 'option_values' then s->'option_values' else v.option_values end
        where v.id = v_id and v.product_id = (r->>'product_id')::uuid;
        if not found then
          raise exception 'variant % no longer exists on this product', v_id using errcode = 'P0002';
        end if;
        v_action := 'updated';
      end if;
      v_out := v_out || jsonb_build_object('row', r->'row', 'id', v_id, 'action', v_action);
    exception when others then
      get stacked diagnostics v_con = constraint_name, v_msg = message_text, v_state = returned_sqlstate;
      v_errors := v_errors || jsonb_build_object('row', r->'row', 'code', v_state, 'constraint', nullif(v_con, ''), 'message', v_msg);
    end;
  end loop;

  if jsonb_array_length(v_errors) > 0 then
    raise exception 'import_batch_failed' using errcode = 'P0001', detail = v_errors::text;
  end if;
  return v_out;
end; $$;

revoke all on function public.import_lookup_products(jsonb) from public, anon;
revoke all on function public.import_lookup_variants(jsonb) from public, anon;
revoke all on function public.import_products_batch(jsonb, jsonb) from public, anon;
revoke all on function public.import_variants_batch(jsonb, jsonb) from public, anon;
grant execute on function public.import_lookup_products(jsonb) to authenticated, service_role;
grant execute on function public.import_lookup_variants(jsonb) to authenticated, service_role;
grant execute on function public.import_products_batch(jsonb, jsonb) to authenticated, service_role;
grant execute on function public.import_variants_batch(jsonb, jsonb) to authenticated, service_role;
