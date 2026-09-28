-- =====================================================================
-- Homepage 2.3: "Shop Deals" (/shop?on_sale=true)
--  * product_on_sale(product): on sale when the sale price is below the
--    regular price, or an active variant sells below its compare-at ("was")
--    price.
--  * catalog_search: new `only = 'on_sale'` scope, and each item carries
--    variant_was_max (for the struck-through price on variant product cards).
--    Everything else is unchanged from 20260927100000_catalog_storefront.sql.
-- Requires 20260928100000_variant_compare_at_price.sql.
-- =====================================================================

create or replace function public.product_on_sale(pr public.products)
returns boolean language sql stable set search_path = public as $$
  select (pr.sale_price is not null and pr.sale_price < pr.price)
      or exists (
        select 1 from public.product_variants v
        where v.product_id = pr.id and v.is_active
          and v.compare_at_price is not null
          and v.compare_at_price > coalesce(v.price, public.product_effective_price(pr) + v.price_modifier)
      );
$$;
revoke all on function public.product_on_sale(public.products) from public, anon, authenticated;

-- SECURITY DEFINER: it works on whole product rows (incl. cost_price, which the
-- public can't read) but only ever returns public fields of ACTIVE products in
-- ACTIVE categories, and only active in-stock variant options.
create or replace function public.catalog_search(p jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cat_id uuid;
  v_cat_slug text;
  v_cat_name text;
  v_scope uuid[];
  v_types uuid[];                 -- selected Type categories (with their descendants)
  v_type_parent uuid;             -- whose children form the Type filter (null = top level)
  v_q text := nullif(trim(coalesce(p->>'q', '')), '');
  v_like text;
  v_isbn text;
  v_min numeric := nullif(p->>'min_price', '')::numeric;
  v_max numeric := nullif(p->>'max_price', '')::numeric;
  v_sort text := coalesce(nullif(p->>'sort', ''), 'new_arrivals');
  v_only text := nullif(p->>'only', '');
  v_page int := greatest(1, coalesce(nullif(p->>'page', '')::int, 1));
  v_per int := least(60, greatest(1, coalesce(nullif(p->>'per_page', '')::int, 24)));
  v_filters jsonb := case when jsonb_typeof(p->'filters') = 'object' then p->'filters' else '{}'::jsonb end;
  v_attrs jsonb := '[]'::jsonb;
  v_base uuid[];
  v_final uuid[];
  v_total int;
  v_items jsonb;
  v_price jsonb;
  v_types_facet jsonb;
  v_facets jsonb := '[]'::jsonb;
  a jsonb;
  v_facet jsonb;
begin
  -- Category scope
  if nullif(p->>'category', '') is not null then
    select id, name, slug into v_cat_id, v_cat_name, v_cat_slug from public.categories where slug = p->>'category' and is_active;
    if v_cat_id is null then
      return jsonb_build_object('not_found', true);
    end if;
    v_scope := array(select public.category_descendants(v_cat_id));
    v_type_parent := v_cat_id;
    -- This category's filters = own + inherited filterable attributes
    select coalesce(jsonb_agg(jsonb_build_object(
             'key', d.key, 'label', d.label, 'type', d.type, 'unit', d.unit, 'help_text', d.help_text,
             'options', d.options, 'is_variant_axis', s.is_variant_axis, 'sort', s.sort_order)
           order by s.sort_order, d.label), '[]'::jsonb)
      into v_attrs
    from public.category_attribute_set(v_cat_id) s
    join public.attribute_definitions d on d.id = s.attribute_id
    where d.is_filterable and d.is_active and d.type in ('select', 'multiselect', 'number');
  end if;

  -- Type filter: direct children of the category, or the top-level categories on /shop
  if jsonb_typeof(p->'types') = 'array' and jsonb_array_length(p->'types') > 0 then
    v_types := array(
      select public.category_descendants(c.id) from public.categories c
      where c.is_active and c.slug in (select jsonb_array_elements_text(p->'types'))
        and c.parent_id is not distinct from v_type_parent
    );
    if cardinality(v_types) = 0 then v_types := null; end if; -- unknown types are ignored
  end if;

  -- Search text (name, description, SKU, ISBN, any attribute value such as author / publisher)
  if v_q is not null then
    v_like := '%' || replace(replace(replace(v_q, '\', '\\'), '%', '\%'), '_', '\_') || '%';
    v_isbn := regexp_replace(v_q, '[^0-9Xx]', '', 'g');
  end if;

  -- Base set: active products in scope that match the search text
  v_base := array(
    select pr.id from public.products pr
    where pr.is_active
      and (v_scope is null or exists (select 1 from public.product_categories pc where pc.product_id = pr.id and pc.category_id = any (v_scope)))
      and (v_q is null
           or pr.name ilike v_like or pr.description ilike v_like or pr.sku ilike v_like or pr.isbn ilike v_like
           or pr.attributes::text ilike v_like
           or (length(v_isbn) >= 10 and regexp_replace(coalesce(pr.isbn, ''), '[^0-9Xx]', '', 'g') = v_isbn))
      and (v_only is null
           or (v_only = 'new_arrivals' and ((pr.is_new_arrival and (pr.new_arrival_until is null or pr.new_arrival_until >= current_date))
                                            or pr.created_at >= now() - interval '30 days'))
           or (v_only = 'best_sellers' and pr.sales_count > 0)
           or (v_only = 'on_sale' and public.product_on_sale(pr)))
  );

  -- Final set: every filter applied
  v_final := array(
    select pr.id from public.products pr
    where pr.id = any (v_base)
      and (v_types is null or exists (select 1 from public.product_categories pc where pc.product_id = pr.id and pc.category_id = any (v_types)))
      and (v_min is null or public.product_effective_price(pr) >= v_min)
      and (v_max is null or public.product_effective_price(pr) <= v_max)
      and public._catalog_attr_match(pr, v_attrs, v_filters, null)
      and public._catalog_axis_match(pr.id, v_attrs, v_filters, null)
  );
  v_total := coalesce(array_length(v_final, 1), 0);

  -- Page of items
  select coalesce(jsonb_agg(x.item order by x.ord), '[]'::jsonb) into v_items
  from (
    select row_number() over (order by
        case when v_sort = 'new_arrivals' then (pr.is_new_arrival and (pr.new_arrival_until is null or pr.new_arrival_until >= current_date)) end desc nulls last,
        case when v_sort = 'best_sellers' then pr.sales_count end desc nulls last,
        case when v_sort = 'price_asc' then public.product_effective_price(pr) end asc nulls last,
        case when v_sort = 'price_desc' then public.product_effective_price(pr) end desc nulls last,
        case when v_sort = 'name' then lower(pr.name) end asc nulls last,
        pr.created_at desc, pr.id) as ord,
      jsonb_build_object(
        'id', pr.id, 'name', pr.name, 'slug', pr.slug, 'price', pr.price, 'sale_price', pr.sale_price,
        'images', pr.images, 'author', pr.author, 'brand', pr.brand, 'isbn', pr.isbn, 'is_featured', pr.is_featured,
        'stock_quantity', pr.stock_quantity, 'sell_unit', pr.sell_unit, 'pack_size', pr.pack_size, 'unit_label', pr.unit_label,
        'is_new', (pr.is_new_arrival and (pr.new_arrival_until is null or pr.new_arrival_until >= current_date)),
        'variant_count', vs.n, 'variant_min', vs.min_price, 'variant_max', vs.max_price, 'variant_in_stock', vs.in_stock,
        'variant_was_max', vs.was_max
      ) as item
    from public.products pr
    left join lateral (
      select count(*)::int as n,
             min(coalesce(v.price, public.product_effective_price(pr) + v.price_modifier)) as min_price,
             max(coalesce(v.price, public.product_effective_price(pr) + v.price_modifier)) as max_price,
             bool_or(v.stock > 0) as in_stock,
             -- Highest "was" price that is above the variant's selling price (display only)
             max(v.compare_at_price) filter (where v.compare_at_price > coalesce(v.price, public.product_effective_price(pr) + v.price_modifier)) as was_max
      from public.product_variants v where v.product_id = pr.id and v.is_active
    ) vs on true
    where pr.id = any (v_final)
    order by 1
    offset (v_page - 1) * v_per limit v_per
  ) x;

  -- Price range of the results ignoring the price filter (for the slider)
  select jsonb_build_object('min', min(public.product_effective_price(pr)), 'max', max(public.product_effective_price(pr))) into v_price
  from public.products pr
  where pr.id = any (v_base)
    and (v_types is null or exists (select 1 from public.product_categories pc where pc.product_id = pr.id and pc.category_id = any (v_types)))
    and public._catalog_attr_match(pr, v_attrs, v_filters, null)
    and public._catalog_axis_match(pr.id, v_attrs, v_filters, null);

  -- Type facet (counts ignore the Type filter itself)
  select coalesce(jsonb_agg(jsonb_build_object('value', t.slug, 'label', t.name, 'count', t.n) order by t.display_order, t.name), '[]'::jsonb)
    into v_types_facet
  from (
    select c.slug, c.name, c.display_order,
           (select count(distinct pr.id) from public.products pr
            join public.product_categories pc on pc.product_id = pr.id
            where pr.id = any (v_base)
              and pc.category_id in (select public.category_descendants(c.id))
              and (v_min is null or public.product_effective_price(pr) >= v_min)
              and (v_max is null or public.product_effective_price(pr) <= v_max)
              and public._catalog_attr_match(pr, v_attrs, v_filters, null)
              and public._catalog_axis_match(pr.id, v_attrs, v_filters, null))::int as n
    from public.categories c
    where c.is_active and c.parent_id is not distinct from v_type_parent
      and (v_type_parent is not null or c.show_in_nav)
  ) t where t.n > 0;

  -- Attribute facets: each counted with every OTHER filter applied
  for a in select * from jsonb_array_elements(v_attrs) loop
    with scope as (
      select pr.* from public.products pr
      where pr.id = any (v_base)
        and (v_types is null or exists (select 1 from public.product_categories pc where pc.product_id = pr.id and pc.category_id = any (v_types)))
        and (v_min is null or public.product_effective_price(pr) >= v_min)
        and (v_max is null or public.product_effective_price(pr) <= v_max)
        and public._catalog_attr_match(pr, v_attrs, v_filters, case when (a->>'is_variant_axis')::boolean then null else a->>'key' end)
        and public._catalog_axis_match(pr.id, v_attrs, v_filters, case when (a->>'is_variant_axis')::boolean then a->>'key' else null end)
    ), vals as (
      select s.id, x.v from scope s
      cross join lateral (
        select jsonb_array_elements_text(s.attributes -> (a->>'key')) as v
        where not (a->>'is_variant_axis')::boolean and jsonb_typeof(s.attributes -> (a->>'key')) = 'array'
        union all
        select s.attributes ->> (a->>'key')
        where not (a->>'is_variant_axis')::boolean and jsonb_typeof(s.attributes -> (a->>'key')) in ('string', 'number')
        union all
        select distinct v.option_values ->> (a->>'key') from public.product_variants v
        where (a->>'is_variant_axis')::boolean and v.product_id = s.id and v.is_active and v.stock > 0
          and v.option_values ? (a->>'key')
      ) x
    ), counts as (
      select v, count(distinct id)::int as n from vals where v is not null group by v
    )
    select jsonb_build_object(
      'key', a->>'key', 'label', a->>'label', 'type', a->>'type', 'unit', a->'unit', 'help_text', a->'help_text',
      'is_variant_axis', (a->>'is_variant_axis')::boolean,
      'options', coalesce((
        select jsonb_agg(jsonb_build_object('value', c.v, 'label', coalesce(oo.opt->>'label', c.v), 'count', c.n)
                         order by coalesce((oo.opt->>'sort')::int, 100000), case when a->>'type' = 'number' then lpad(c.v, 12, '0') else lower(c.v) end)
        from counts c
        left join lateral (select e as opt from jsonb_array_elements(a->'options') e where e->>'value' = c.v limit 1) oo on true
      ), '[]'::jsonb)
    ) into v_facet;
    if jsonb_array_length(v_facet->'options') > 0 then
      v_facets := v_facets || v_facet;
    end if;
  end loop;

  return jsonb_build_object(
    'category', case when v_cat_id is null then null else jsonb_build_object('id', v_cat_id, 'slug', v_cat_slug, 'name', v_cat_name) end,
    'items', v_items,
    'total', v_total,
    'page', v_page,
    'per_page', v_per,
    'price', coalesce(v_price, jsonb_build_object('min', null, 'max', null)),
    'types', coalesce(v_types_facet, '[]'::jsonb),
    'facets', v_facets,
    -- Keys this category actually supports (the page drops any other filter from the URL)
    'filter_keys', coalesce((select jsonb_agg(x->>'key') from jsonb_array_elements(v_attrs) x), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.catalog_search(jsonb) from public;
grant execute on function public.catalog_search(jsonb) to anon, authenticated, service_role;
-- Helpers are internal to catalog_search.
revoke all on function public.product_effective_price(public.products) from public, anon, authenticated;
revoke all on function public._catalog_attr_match(public.products, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public._catalog_axis_match(uuid, jsonb, jsonb, text) from public, anon, authenticated;
