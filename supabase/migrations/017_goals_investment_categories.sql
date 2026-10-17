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
