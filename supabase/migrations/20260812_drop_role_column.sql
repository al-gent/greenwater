-- Role → is_admin, step 2 of 2 (the destructive half).
--
-- ⚠ DO NOT APPLY until the is_admin code (this commit) is DEPLOYED to
-- production — the previously deployed build still selects profiles.role in
-- every admin gate and the navbar, and writes role/vessel_id on claim
-- approval. Applying early breaks the live site.
--
-- After this runs, "what kind of user are you" is no longer a column:
-- admin = is_admin, operator = vessel_operators membership, researcher =
-- the default state of any account.

alter table profiles drop column role;
alter table profiles drop column vessel_id;
