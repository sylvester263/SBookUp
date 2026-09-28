-- =====================================================================
-- Audit fix 1.4
-- Problem: the reviews INSERT/UPDATE policies only checked user_id, so a
-- customer could save their own review as status='approved',
-- is_approved=true and is_verified_purchase=true through the Supabase API.
-- Fix: a BEFORE INSERT OR UPDATE trigger. For non-staff callers it:
--  * forces status = 'pending' on insert and clears moderation fields;
--  * on update, keeps the moderation fields as they were, and resets the
--    review to 'pending' if the rating/title/body changed;
--  * stops the review being moved to another product or user;
--  * works out is_verified_purchase on the server: true only if the user has
--    a DELIVERED order containing the product (directly or inside a bundle).
-- For everyone, is_approved is kept in sync with status.
-- One review per user per product is already enforced by
-- the existing unique (product_id, user_id) constraint.
-- =====================================================================

create or replace function public.user_has_delivered_product(_user_id uuid, _product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.orders o
    join public.order_items oi on oi.order_id = o.id
    where o.user_id = _user_id
      and o.status = 'delivered'
      and (
        oi.product_id = _product_id
        or exists (select 1 from public.bundle_items bi
                   where bi.bundle_id = oi.bundle_id and bi.product_id = _product_id)
        or exists (select 1 from public.school_bundle_items sbi
                   where sbi.bundle_id = oi.school_bundle_id and sbi.product_id = _product_id)
      )
  );
$$;
revoke all on function public.user_has_delivered_product(uuid, uuid) from public, anon, authenticated;

-- Caller-scoped version used by the trigger: only ever checks the signed-in
-- user's own orders, so it reveals nothing about other customers.
create or replace function public.i_have_delivered_product(_product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null and public.user_has_delivered_product(auth.uid(), _product_id);
$$;
revoke all on function public.i_have_delivered_product(uuid) from public, anon;
grant execute on function public.i_have_delivered_product(uuid) to authenticated;

create or replace function public.guard_review_writes()
returns trigger
language plpgsql
security invoker            -- invoker so current_user is the real API caller
set search_path = public
as $$
declare
  v_staff boolean;
begin
  v_staff := current_user not in ('anon', 'authenticated')
             or public.has_role(auth.uid(), 'admin')
             or public.has_role(auth.uid(), 'manager');

  if not v_staff then
    if tg_op = 'INSERT' then
      new.status := 'pending';
      new.reject_reason := null;
      new.moderated_at := null;
      new.moderated_by := null;
    else
      new.product_id := old.product_id;
      new.user_id := old.user_id;
      new.created_at := old.created_at;
      if (new.rating, new.title, new.body) is distinct from (old.rating, old.title, old.body) then
        new.status := 'pending';
        new.reject_reason := null;
        new.moderated_at := null;
        new.moderated_by := null;
      else
        new.status := old.status;
        new.reject_reason := old.reject_reason;
        new.moderated_at := old.moderated_at;
        new.moderated_by := old.moderated_by;
      end if;
    end if;
    -- RLS already forces new.user_id = auth.uid() for non-staff callers.
    new.is_verified_purchase := public.i_have_delivered_product(new.product_id);
  end if;

  new.is_approved := (new.status = 'approved');
  return new;
end;
$$;
drop trigger if exists trg_reviews_guard_writes on public.reviews;
create trigger trg_reviews_guard_writes
  before insert or update on public.reviews
  for each row execute function public.guard_review_writes();

-- One-time clean-up of existing rows (this runs as the migration owner, so it
-- takes the "staff" path above and only re-syncs is_approved):
update public.reviews set is_approved = (status = 'approved')
where is_approved is distinct from (status = 'approved');

-- Recompute the verified-purchase badge for every existing review.
update public.reviews r
set is_verified_purchase = public.user_has_delivered_product(r.user_id, r.product_id)
where r.is_verified_purchase is distinct from public.user_has_delivered_product(r.user_id, r.product_id);
