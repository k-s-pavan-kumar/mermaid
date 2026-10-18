-- ONE FILE TO RUN: everything the latest Meridian build needs on an existing database.
-- Paste into the Supabase SQL editor and run once. Every statement is idempotent.

-- (009_teaching_marketing_project_types)
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

alter table projects drop constraint if exists projects_type_check;
alter table projects add constraint projects_type_check check (type in
  ('client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing'));

alter table projects drop constraint if exists projects_types_check;
alter table projects add constraint projects_types_check check (types <@ array[
  'client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing']::text[]);

-- (017_goals_investment_categories)
-- Yearly goals (with the projects planned under them, month by month) and
-- investment categories. Run after 016. Safe to run more than once.
-- See src/features/goals/* and src/features/daily-finance/investment-categories.ts.

-- ---- Yearly goals ---------------------------------------------------------
create table if not exists goals (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  year        int  not null check (year between 2000 and 2100),
  title       text not null,
  description text,
  status      text not null default 'active' check (status in ('active','done','dropped')),
  created_at  timestamptz not null default now()
);
create index if not exists goals_owner_year_idx on goals(owner_id, year);
alter table goals enable row level security;
drop policy if exists "owner full access" on goals;
create policy "owner full access" on goals for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- A project planned under a goal, in a month of the goal's year ('YYYY-MM').
create table if not exists goal_projects (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  goal_id     uuid not null references goals(id) on delete cascade,
  project_id  uuid not null references projects(id) on delete cascade,
  month       text check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_at  timestamptz not null default now(),
  unique (goal_id, project_id)
);
create index if not exists goal_projects_owner_idx on goal_projects(owner_id, goal_id);
create index if not exists goal_projects_project_idx on goal_projects(project_id);
alter table goal_projects enable row level security;
drop policy if exists "owner full access" on goal_projects;
create policy "owner full access" on goal_projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---- Investment categories ------------------------------------------------
-- 'stocks', 'gold', 'silver', 'mutual_funds', 'fd_bonds', 'crypto',
-- 'real_estate', 'other' — or any custom lower-case label. Left null on
-- existing rows on purpose: the app guesses a category from the old
-- "invested in" text (e.g. "Gold" -> gold) when it reads a null, and you can
-- change it from the list, which then stores it for real.
alter table finance_investment_log add column if not exists category text;
create index if not exists finance_investment_log_cat_idx on finance_investment_log(owner_id, category);

-- (018_custom_client_work_types)
-- Custom "Type of work" tags on clients. The fixed list of work types is
-- replaced by free text (built-in keys like 'web' still work; anything else is
-- a tag the user added). The app trims, dedupes and caps tags at 12 per client.
alter table clients drop constraint if exists clients_work_types_check;
alter table clients add constraint clients_work_types_check
  check (cardinality(work_types) <= 12);

-- (019_tpn_audits)
-- TPN audit tracker: its own page, its own clients/quotes/invoices, kept apart
-- from the normal Clients and Billing data. Safe to run more than once.
create table if not exists audits (
  id             uuid primary key default uuid_generate_v4(),
  owner_id       uuid not null references auth.users(id) default auth.uid(),
  client_name    text not null,
  company        text,
  email          text,
  phone          text,
  scope          text,                         -- site / facility / what is being audited
  stage          text not null default 'lead'
                 check (stage in ('lead','scoping','quoted','accepted','in_progress','report','invoiced','paid','lost')),
  quote_amount   numeric,
  quote_sent_on  date,
  quote_ref      text,
  invoice_amount numeric,
  invoice_ref    text,
  invoice_sent_on date,
  paid_amount    numeric not null default 0,
  paid_on        date,
  audit_date     date,                         -- on-site / assessment date
  goal_id        uuid references goals(id) on delete set null,
  goal_month     text check (goal_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  notes          text,
  created_at     timestamptz not null default now()
);
create index if not exists audits_owner_idx on audits(owner_id, stage);
alter table audits enable row level security;
drop policy if exists "owner full access" on audits;
create policy "owner full access" on audits for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- (020_tags_and_fields)
-- Tags (one shared table) and Fields (a tag that gets its own page + yearly
-- targets). Run after 019. Safe to run more than once.
create table if not exists tags (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  name        text not null,
  color       text not null default '#5F3DEB',
  is_field    boolean not null default false,     -- true = has its own sidebar page and yearly targets
  special     text check (special in ('tpn')),    -- 'tpn' = the TPN audit field (its page is /tpn-audits)
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists tags_owner_name_idx on tags(owner_id, lower(name));
alter table tags enable row level security;
drop policy if exists "owner full access" on tags;
create policy "owner full access" on tags for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Goals belong to a field, and can carry a numeric yearly target.
alter table goals add column if not exists field_id uuid references tags(id) on delete set null;
alter table goals add column if not exists target_value numeric;
alter table goals add column if not exists unit text;
alter table goals add column if not exists progress_value numeric not null default 0;
create index if not exists goals_field_idx on goals(owner_id, field_id, year);

-- Projects can belong to a field too (shown on that field's page).
alter table projects add column if not exists field_id uuid references tags(id) on delete set null;
create index if not exists projects_field_idx on projects(owner_id, field_id);

