
do $$
begin
  if not exists (select 1 from pg_type t where t.typname = 'review_status') then
    create type public.review_status as enum ('pending','approved','rejected');
  end if;
end $$;

alter table public.reviews
  add column if not exists status public.review_status not null default 'pending',
  add column if not exists reject_reason text,
  add column if not exists moderated_at timestamptz,
  add column if not exists moderated_by uuid;

-- Backfill from is_approved
update public.reviews set status = 'approved' where is_approved = true and status = 'pending';

-- Replace public read policy to use status
drop policy if exists reviews_public_read_approved on public.reviews;
create policy reviews_public_read_approved on public.reviews
  for select to anon, authenticated
  using (status = 'approved');

create index if not exists reviews_status_idx on public.reviews(status);
