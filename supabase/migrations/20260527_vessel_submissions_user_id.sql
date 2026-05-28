-- Associate vessel_submissions with the submitting user so we can auto-link
-- them as the vessel's operator on admin approval.

alter table vessel_submissions
  add column if not exists user_id uuid references auth.users on delete set null;

-- Tighten RLS: submissions now require authentication, and a row's user_id
-- must match the session user. The /api/vessel-submissions route uses the
-- service role (supabaseAdmin) to insert, so this policy is defence-in-depth
-- against direct anon-key writes.
drop policy if exists "insert_submissions" on vessel_submissions;

create policy "insert_submissions"
  on vessel_submissions for insert to authenticated
  with check (auth.uid() = user_id);
