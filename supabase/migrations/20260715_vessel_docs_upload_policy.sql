-- Direct PDF uploads from the edit form (2026-07-15): browser -> storage,
-- then /api/vessels/docs verifies the bytes and attaches to doc_details.
create policy "Operators and admins can upload vessel docs"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'vessel-docs'
    and exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role in ('operator', 'admin')
    )
  );
