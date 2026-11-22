-- Signed-in members may edit only their own display fields (ProfileEditForm).
-- verified, email, is_admin, ad-tracking and timestamps change only through
-- server routes using the service role. Row access is still own_profile_update.
revoke update on public.profiles from anon, authenticated;
grant update (first_name, last_name, institution, title, profile_url) on public.profiles to authenticated;
