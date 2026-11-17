-- =====================================================================================
-- Headshot storage (run this SECOND, after 01_core.sql). Safe to run more than once.
-- The bucket is public for READING (the website shows the pictures), but a signed-in member
-- can only add or delete files inside a folder named after their own user id.
-- =====================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('headshots', 'headshots', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

drop policy if exists headshots_own_insert on storage.objects;
create policy headshots_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());

drop policy if exists headshots_own_select on storage.objects;
create policy headshots_own_select on storage.objects for select to authenticated
  using (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists headshots_own_update on storage.objects;
create policy headshots_own_update on storage.objects for update to authenticated
  using (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member())
  with check (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text and public.is_member());

drop policy if exists headshots_own_delete on storage.objects;
create policy headshots_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text);
