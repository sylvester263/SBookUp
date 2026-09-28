
-- Public read for product-images and banner-images
create policy "public_read_product_images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'product-images');
create policy "public_read_banner_images" on storage.objects for select to anon, authenticated
  using (bucket_id = 'banner-images');
create policy "public_read_avatars" on storage.objects for select to anon, authenticated
  using (bucket_id = 'avatars');

-- Staff write product-images & banner-images
create policy "staff_write_product_images" on storage.objects for all to authenticated
  using (bucket_id = 'product-images' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')))
  with check (bucket_id = 'product-images' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')));
create policy "staff_write_banner_images" on storage.objects for all to authenticated
  using (bucket_id = 'banner-images' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')))
  with check (bucket_id = 'banner-images' and (public.has_role(auth.uid(),'admin') or public.has_role(auth.uid(),'manager')));

-- Owner-write avatars (folder = user id)
create policy "avatar_owner_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_owner_update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatar_owner_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
