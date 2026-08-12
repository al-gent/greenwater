-- Vessel data cleanup for conference-poster stats (2026-08-11)
-- Data-only: no schema changes, so scripts/schema.sql is unaffected.

-- 1. Walther Herwig III (id 598) length was 643.18 m — a digit-insertion typo.
--    Thünen Institute (owner) publishes LOA 63.15 m, draught 5.96 m; our stored
--    draft of 5.96 confirms the same record lineage.
update vessels set length = 63.15 where id = 598 and length = 643.18;

-- 2. Collapse country spelling variants onto the dominant form.
update vessels set country = 'USA' where lower(trim(country)) = 'united states';
update vessels set country = 'UK'  where lower(trim(country)) = 'united kingdom';

-- 3. "Columbia" -> "Colombia". Both rows are ARC-prefixed (Armada de la
--    República de Colombia) Colombian Navy vessels.
update vessels set country = 'Colombia' where lower(trim(country)) = 'columbia';

-- 4. NATO is not a country. Both CMRE vessels (Alliance id 98, Leonardo id 499)
--    have flown the Italian flag since the German flagging agreement lapsed on
--    2015-12-31; both are based in La Spezia. NATO ownership is preserved in the
--    affiliation column, so no information is lost.
update vessels set country = 'Italy' where lower(trim(country)) = 'nato';
