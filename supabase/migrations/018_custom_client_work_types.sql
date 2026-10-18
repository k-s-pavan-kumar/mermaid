-- Custom "Type of work" tags on clients. The fixed list of work types is
-- replaced by free text (built-in keys like 'web' still work; anything else is
-- a tag the user added). The app trims, dedupes and caps tags at 12 per client.
alter table clients drop constraint if exists clients_work_types_check;
alter table clients add constraint clients_work_types_check
  check (cardinality(work_types) <= 12);
