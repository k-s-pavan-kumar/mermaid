-- Custom "type of work" tags on clients. Run after 014. Idempotent.
--
-- clients.work_types used to be restricted to the nine built-in keys, which made
-- it impossible to save a tag the user typed themselves (SEO, Photography, ...).
-- The app now validates and cleans tags (length, characters, duplicates), so the
-- database only needs a sanity cap on how many a client can have.

alter table clients drop constraint if exists clients_work_types_check;
alter table clients add constraint clients_work_types_check
  check (cardinality(work_types) <= 20);
