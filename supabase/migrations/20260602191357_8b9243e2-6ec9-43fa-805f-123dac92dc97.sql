
-- Move pg_trgm out of public
create schema if not exists extensions;
alter extension pg_trgm set schema extensions;

-- Fix function search paths
create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end; $$;

create or replace function public.set_order_number()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.order_number is null or new.order_number = '' then
    new.order_number := 'JSN-' || to_char(now(),'YYYYMMDD') || '-' || lpad(nextval('public.order_number_seq')::text, 4, '0');
  end if;
  return new;
end; $$;

-- Lock down SECURITY DEFINER functions
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.has_role(uuid, public.app_role) from public, anon;
grant execute on function public.has_role(uuid, public.app_role) to authenticated;

-- Replace permissive newsletter insert
drop policy if exists "newsletters_public_insert" on public.newsletters;
create policy "newsletters_public_insert" on public.newsletters for insert to anon, authenticated
  with check (email is not null and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$');
