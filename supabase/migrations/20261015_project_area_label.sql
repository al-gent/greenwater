-- A name for the project's area, to show where the map isn't rendered ("Monterey Bay",
-- "Gulf of Alaska shelf"). Filled from the place search on the form; editable.
alter table projects add column if not exists area_label text;
