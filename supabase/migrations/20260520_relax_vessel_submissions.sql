-- Relax vessel_submissions schema to match the simplified listing form.
-- Form now only requires vessel_name, operator_name, email, main_activity.
-- Everything else (including port_city) is optional and may be null.

alter table vessel_submissions
  alter column port_city drop not null;
