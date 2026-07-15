-- Photos in the list-your-vessel flow (2026-07-14)
-- At apply time no vessel row exists yet, so photos are staged in the same
-- public bucket under submissions/<draft-id>/ and their URLs stored on the
-- submission; approval copies photo_urls onto the new vessel row.

alter table vessel_submissions add column if not exists photo_urls text[];

-- The existing upload policy is operators/admins only; applicants are
-- ordinary authenticated users, so allow them to stage under submissions/.
create policy "Authenticated users can stage submission photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vessel-photos'
    and (storage.foldername(name))[1] = 'submissions'
  );

create policy "Users can delete their own staged submission photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vessel-photos'
    and (storage.foldername(name))[1] = 'submissions'
    and owner = auth.uid()
  );
