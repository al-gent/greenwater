-- Widen the submission-photo staging policies so applicants can also write
-- the browser-generated thumbnail (thumbs/submissions/<draft-id>/...).

drop policy if exists "Authenticated users can stage submission photos" on storage.objects;
create policy "Authenticated users can stage submission photos"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vessel-photos'
    and (
      (storage.foldername(name))[1] = 'submissions'
      or ((storage.foldername(name))[1] = 'thumbs' and (storage.foldername(name))[2] = 'submissions')
    )
  );

drop policy if exists "Users can delete their own staged submission photos" on storage.objects;
create policy "Users can delete their own staged submission photos"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'vessel-photos'
    and (
      (storage.foldername(name))[1] = 'submissions'
      or ((storage.foldername(name))[1] = 'thumbs' and (storage.foldername(name))[2] = 'submissions')
    )
    and owner = auth.uid()
  );
