-- Per-photo credits on listing submissions: array of {url, credit} matching
-- entries in vessel_submissions.photo_urls. Carried onto the vessel (with
-- URLs remapped to their post-approval storage paths) when approved.
alter table vessel_submissions
  add column if not exists photo_details jsonb;
