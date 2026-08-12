-- Two storage-policy fixes.
--
-- 1. claim-documents had NO insert policy at all — storage RLS default-denies,
--    so every claim-document upload ever attempted failed ("File upload
--    failed" in ClaimModal; all existing claims have empty document_url).
--    ClaimModal uploads to claims/<timestamp>-<rand>.<ext>.
create policy "Authenticated users can upload claim documents"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'claim-documents'
  and (storage.foldername(name))[1] = 'claims'
);

-- 2. vessel-docs / vessel-photos uploads were gated on profiles.role IN
--    ('operator','admin'). Operator-ness is vessel_operators membership now —
--    newly approved operators keep role='scientist' and would be denied.
--    Same looseness as before (any operator could upload to any vessel path);
--    per-vessel tightening can come later.
drop policy "Operators and admins can upload vessel docs" on storage.objects;
create policy "Operators and admins can upload vessel docs"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-docs'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
);

drop policy "Operators and admins can upload vessel photos" on storage.objects;
create policy "Operators and admins can upload vessel photos"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'vessel-photos'
  and (
    exists (select 1 from vessel_operators where user_id = auth.uid())
    or exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  )
);
