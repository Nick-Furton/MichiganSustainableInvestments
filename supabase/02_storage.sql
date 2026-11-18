-- =====================================================================================
-- Headshot storage (run this SECOND, after 01_core.sql). Safe to run more than once.
-- The bucket is public for READING (the website shows the pictures), but a signed-in @umich.edu
-- Google account can only add or delete files inside a folder named after their own user id, and
-- may hold at most 5 files there (an abuse cap). Admins can list and delete any file.
-- =====================================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('headshots', 'headshots', true, 1048576, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 1048576, allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'];

-- How many files the caller already has in their own folder. SECURITY INVOKER: it only sees what the
-- caller's own select policy lets them see, which is exactly their own folder.
create or replace function public.my_headshot_count() returns int
language sql stable security invoker set search_path = public, pg_temp as $$
  select count(*)::int from storage.objects
   where bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text;
$$;
-- Only signed-in people need this; take it away from anonymous visitors (it would only ever return 0 for them).
revoke all on function public.my_headshot_count() from public, anon;
grant execute on function public.my_headshot_count() to authenticated;

drop policy if exists headshots_own_insert on storage.objects;
create policy headshots_own_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text
              and public.can_have_profile() and public.my_headshot_count() < 5);

drop policy if exists headshots_own_select on storage.objects;
create policy headshots_own_select on storage.objects for select to authenticated
  using (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists headshots_own_update on storage.objects;
create policy headshots_own_update on storage.objects for update to authenticated
  using (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text and public.can_have_profile())
  with check (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text and public.can_have_profile());

drop policy if exists headshots_own_delete on storage.objects;
create policy headshots_own_delete on storage.objects for delete to authenticated
  using (bucket_id = 'headshots' and (storage.foldername(name))[1] = auth.uid()::text);

-- Admins may list and delete any headshot (to clean up after deleting a profile).
drop policy if exists headshots_admin_select on storage.objects;
create policy headshots_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'headshots' and public.is_admin());

drop policy if exists headshots_admin_delete on storage.objects;
create policy headshots_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'headshots' and public.is_admin());
