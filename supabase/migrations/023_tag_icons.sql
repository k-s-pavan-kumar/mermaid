-- A chosen icon for each tag / field (shown in the sidebar). Run after 022.
-- Safe to run more than once. Left null on existing rows: the app picks a
-- sensible default from the name until you choose one.
alter table tags add column if not exists icon text;
