-- Adds 'teaching' and 'marketing' as project types.
--
-- Clients already had 'teaching' and 'marketing' as work_types (what you do
-- for them), but the Projects picker — and so the project_id dropdown on
-- Today, since a task logs time against a project, not a client directly —
-- only had 'institute' (one-off guest lectures / honorariums), with nothing
-- for a regular teaching job (school, institute classes, tuition) or for
-- digital marketing work. This closes that gap: create a project with type
-- 'teaching' or 'marketing' and it will appear in Today's project dropdown
-- like any other project.
--
-- Safe to run once against an existing database.

alter table projects drop constraint if exists projects_type_check;
alter table projects add constraint projects_type_check check (type in
  ('client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing'));

alter table projects drop constraint if exists projects_types_check;
alter table projects add constraint projects_types_check check (types <@ array[
  'client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing']::text[]);
