-- What the site shows for an organization in compact places (cards, lists).
-- Null shows the full name. Set it only where the short form is widely known
-- (NOAA, UNOLS); lesser-known acronyms (SIO, UAF) stay full names. short_name
-- remains the acronym used for search.
alter table public.organizations
  add column display_name text check (display_name = trim(display_name) and length(display_name) between 1 and 80);

update public.organizations o set display_name = d.display_name
from (values
  ('National Oceanic and Atmospheric Administration', 'NOAA'),
  ('University-National Oceanographic Laboratory System', 'UNOLS'),
  ('U.S. Geological Survey', 'USGS'),
  ('National Science Foundation', 'NSF'),
  ('U.S. Environmental Protection Agency', 'EPA'),
  ('Woods Hole Oceanographic Institution', 'WHOI'),
  ('Monterey Bay Aquarium Research Institute', 'MBARI'),
  ('Japan Agency for Marine-Earth Science and Technology', 'JAMSTEC'),
  ('GEOMAR Helmholtz Centre for Ocean Research Kiel', 'GEOMAR'),
  ('Royal Netherlands Institute for Sea Research', 'NIOZ'),
  ('National Institute of Water and Atmospheric Research', 'NIWA'),
  ('Centre National de la Recherche Scientifique', 'CNRS'),
  ('Spanish National Research Council', 'CSIC'),
  ('King Abdullah University of Science and Technology', 'KAUST'),
  ('United States Navy', 'U.S. Navy'),
  ('United States Coast Guard', 'U.S. Coast Guard'),
  ('Alfred Wegener Institute for Polar and Marine Research', 'Alfred Wegener Institute')
) as d(name, display_name)
where lower(o.name) = lower(d.name);
