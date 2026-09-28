-- =====================================================================
-- Audit fix 2.1
-- Problem: profiles only had "select own" / "update own" / "insert own"
-- policies, so the admin Customers page showed only the signed-in admin,
-- "Active customers" was 1, and reviewer / Activity Log names were blank.
-- Fix: staff (admin or manager) can READ all profiles. Customers still
-- see and edit only their own profile; staff get no extra write access.
-- =====================================================================

drop policy if exists "profiles_staff_read" on public.profiles;
create policy "profiles_staff_read" on public.profiles
  for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));
