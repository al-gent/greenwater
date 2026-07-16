-- Photo credits, per photo. Array of {url, credit} where url matches an entry
-- in vessels.photo_urls. Restores the credit data that lived in the old
-- files[] jsonb (dropped in the doc_details migration); backfilled from
-- data/vessel_details/*.json via scripts/backfill_photo_credits.mjs.
alter table vessels
  add column if not exists photo_details jsonb;
