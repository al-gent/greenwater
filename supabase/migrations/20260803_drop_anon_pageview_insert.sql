-- Close the unfiltered page_views write path (2026-08-03).
-- The CMS site now tracks via POST /api/analytics/pageview (bot-filtered,
-- service-role insert); the CF worker /pageview endpoint is removed. Nothing
-- legitimate writes page_views as anon anymore — but the SG bot fleet still
-- does, daily. Dropping the policy 403s them at the door.

drop policy if exists "anon_insert_page_views" on page_views;
