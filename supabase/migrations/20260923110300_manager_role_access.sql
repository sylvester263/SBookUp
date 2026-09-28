-- =====================================================================
-- Audit fix 2.6
-- Problem: schools, school_classes, school_bundles, school_bundle_items and
-- activity_logs (read) were admin-only in RLS, so managers got errors or
-- empty screens on pages the admin panel shows them.
-- Fix:
--  * staff (admin OR manager) manage the four school tables;
--  * staff can read the activity log (insert was already staff);
--  * store settings and shipping zones (the admin "Settings" page) become
--    ADMIN ONLY for writes (reads stay public: checkout needs them);
--  * user_roles stays admin-only (unchanged);
--  * nobody can UPDATE/DELETE activity log rows through the API (no policy).
-- =====================================================================

-- Schools
drop policy if exists "Admins manage schools" on public.schools;
drop policy if exists "Staff manage schools" on public.schools;
create policy "Staff manage schools" on public.schools for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

drop policy if exists "Admins manage classes" on public.school_classes;
drop policy if exists "Staff manage classes" on public.school_classes;
create policy "Staff manage classes" on public.school_classes for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

drop policy if exists "Admins manage bundles" on public.school_bundles;
drop policy if exists "Staff manage school bundles" on public.school_bundles;
create policy "Staff manage school bundles" on public.school_bundles for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

drop policy if exists "Admins manage bundle items" on public.school_bundle_items;
drop policy if exists "Staff manage school bundle items" on public.school_bundle_items;
create policy "Staff manage school bundle items" on public.school_bundle_items for all to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'))
  with check (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

-- Activity log: staff read
drop policy if exists "activity_admin_read" on public.activity_logs;
drop policy if exists "activity_staff_read" on public.activity_logs;
create policy "activity_staff_read" on public.activity_logs for select to authenticated
  using (public.has_role(auth.uid(), 'admin') or public.has_role(auth.uid(), 'manager'));

-- Store settings: admin-only writes.
-- Existing bug fixed here too: store_settings was only ever GRANTed SELECT
-- (migration 20260602214446), so the admin Settings "Save" failed with
-- "permission denied" for everyone. RLS below limits writes to admins.
grant insert, update on public.store_settings to authenticated;
drop policy if exists "store_settings_staff_write" on public.store_settings;
drop policy if exists "store_settings_admin_write" on public.store_settings;
create policy "store_settings_admin_write" on public.store_settings for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Shipping zones: admin-only writes (public read policy unchanged)
drop policy if exists "shipping_staff_write" on public.shipping_zones;
drop policy if exists "shipping_admin_write" on public.shipping_zones;
create policy "shipping_admin_write" on public.shipping_zones for all to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));
-- (Staff already read inactive zones through the existing "shipping_public_read" policy.)
