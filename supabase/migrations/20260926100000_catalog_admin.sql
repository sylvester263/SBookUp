-- =====================================================================
-- Catalog Phase C: admin helpers
-- attribute_option_usage(key): how many products / variants use each value
-- of an attribute. The Attributes screen uses it to warn before an option
-- that products still use is removed. Staff only.
-- =====================================================================

create or replace function public.attribute_option_usage(p_key text)
returns table (value text, products integer, variants integer)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- SECURITY DEFINER: current_user is the owner here, so check the caller's JWT.
  -- Signed-in callers must be staff; the service role (no user) is allowed and
  -- anonymous callers have no EXECUTE grant.
  if auth.uid() is not null
     and not (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager')) then
    raise exception 'Staff only' using errcode = '42501';
  end if;
  return query
  select s.v, (count(*) filter (where s.src = 'p'))::int, (count(*) filter (where s.src = 'v'))::int
  from (
    select 'p' as src, x.v
    from public.products p
    cross join lateral (
      select jsonb_array_elements_text(p.attributes -> p_key) as v
      where jsonb_typeof(p.attributes -> p_key) = 'array'
      union all
      select p.attributes ->> p_key
      where jsonb_typeof(p.attributes -> p_key) in ('string', 'number')
    ) x
    where p.attributes ? p_key
    union all
    select 'v', pv.option_values ->> p_key
    from public.product_variants pv
    where pv.option_values ? p_key
  ) s
  where s.v is not null
  group by s.v;
end;
$$;
revoke all on function public.attribute_option_usage(text) from public, anon;
grant execute on function public.attribute_option_usage(text) to authenticated, service_role;
