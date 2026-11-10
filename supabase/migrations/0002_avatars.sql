-- Public avatar images. Each user may only write inside their own folder: avatars/<user id>/...
insert into storage.buckets (id, name, public) values ('avatars', 'avatars', true);

create policy "upload own avatar" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "replace own avatar" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "delete own avatar" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
