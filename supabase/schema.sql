-- Meridian — core schema
-- Design intent: every project "type" (client work, internal tool, mobile app,
-- game, web app, content, assessment, bug bounty...) shares the same projects
-- table and status model. Type-specific data (billing, bounty submissions,
-- metrics/milestones) lives in its own table and simply stays empty for types
-- that don't use it — so adding a ninth project type never means a migration
-- to this file, only a new row in the `type`/`types` check constraints.
--
-- Migrating an existing database:
--   alter table projects add column types text[] not null default '{}';
--   update projects set types = array[type] where types = '{}';
--   alter table projects drop constraint projects_type_check;
--   alter table projects add constraint projects_type_check check (type in
--     ('client','internal','opensource','mobile','game','web','content','assess','bounty'));
--
--   -- Half-hour timebox grid (both columns are additive; existing rows keep
--   -- their exact current placement because null minute == :00 and null
--   -- duration_minutes falls back to duration_hours * 60):
--   alter table tasks add column scheduled_minute int
--     check (scheduled_minute in (0, 30));
--   alter table tasks add column duration_minutes int
--     check (duration_minutes between 30 and 480 and duration_minutes % 30 = 0);
--   update tasks set duration_minutes = duration_hours * 60
--     where duration_minutes is null;
--
--   -- Weekly / monthly / yearly targets shown on the Dashboard:
--   alter table settings add column targets jsonb not null default '{}'::jsonb;

create extension if not exists "uuid-ossp";

-- ---------------------------------------------------------------------------
-- Clients
-- ---------------------------------------------------------------------------
create table clients (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  name         text not null,
  company      text,
  email        text,
  phone        text,
  address      text,                          -- printed on their invoices
  timezone     text not null default 'UTC',   -- IANA tz, e.g. 'America/New_York'
  -- What you do for them. Multi-valued because one client is rarely one
  -- kind of work: a web build becomes a retainer and books a training day.
  work_types   text[] not null default '{}'
                 check (work_types <@ array['web','mobile','design','security','teaching','consulting','maintenance','content']::text[]),
  rate         numeric,                       -- agreed rate, pre-fills invoice lines
  status       text not null default 'active'
                 check (status in ('lead','active','paused','past')),
  notes        text,
  -- Read-only client portal. The token IS the credential, so it is long,
  -- rotatable, and scoped to exactly one client.
  portal_token text unique,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects — the universal tracker
-- ---------------------------------------------------------------------------
create table projects (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  name         text not null,
  -- Primary type: always types[1]. Kept as its own column so the index and
  -- every single-type read keep working.
  type         text not null check (type in
                 ('client','internal','opensource','mobile','game','web','content','assess','bounty')),
  -- Full type set — a project is often several things at once (an
  -- open-source repo that's also a web app; client work that's also an
  -- assessment). Order matters: types[1] is the primary.
  types        text[] not null default '{}'
                 check (types <@ array['client','internal','opensource','mobile','game','web','content','assess','bounty']::text[]),
  client_id    uuid references clients(id) on delete set null,
  status       text not null default 'idea' check (status in
                 ('idea','ontrack','review','risk','done')),
  description  text,
  created_at   timestamptz not null default now()
);

create index projects_type_idx on projects(type);
create index projects_types_idx on projects using gin (types);
create index clients_work_types_idx on clients using gin (work_types);
create index projects_client_idx on projects(client_id);

-- Timeline phases shown on the Overview tab
create table project_phases (
  id          uuid primary key default uuid_generate_v4(),
  project_id  uuid not null references projects(id) on delete cascade,
  label       text not null,
  color       text default '#1F5C4E',
  sort_order  int not null default 0,
  width_pct   numeric not null default 0 check (width_pct >= 0 and width_pct <= 100)
);

-- ---------------------------------------------------------------------------
-- Billing — quotes & invoices (client-type projects; harmless if unused elsewhere)
-- ---------------------------------------------------------------------------
-- Both documents can hang off a project OR a client directly: teaching
-- income has a payer but often no project, and inventing a dummy project
-- just to raise an invoice is how invoices end up in a spreadsheet instead.
create table quotes (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  project_id   uuid references projects(id) on delete cascade,
  client_id    uuid references clients(id) on delete set null,
  stream       text not null default 'freelance' check (stream in
                 ('freelance','teaching','product','bounty','other')),
  number       text not null,
  description  text,
  -- Line items live inline; they are never queried apart from their document.
  items        jsonb not null default '[]'::jsonb,
  amount       numeric not null,              -- subtotal, denormalised
  tax_pct      numeric not null default 0,
  currency     text not null default 'INR',
  notes        text,
  status       text not null default 'draft' check (status in
                 ('draft','sent','accepted','declined')),
  issued_at    date,
  valid_until  date,
  created_at   timestamptz not null default now(),
  check (project_id is not null or client_id is not null)
);

create table invoices (
  id           uuid primary key default uuid_generate_v4(),
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  project_id   uuid references projects(id) on delete cascade,
  client_id    uuid references clients(id) on delete set null,
  quote_id     uuid references quotes(id) on delete set null,
  stream       text not null default 'freelance' check (stream in
                 ('freelance','teaching','product','bounty','other')),
  number       text not null,
  description  text,
  items        jsonb not null default '[]'::jsonb,
  amount       numeric not null,
  tax_pct      numeric not null default 0,
  currency     text not null default 'INR',
  notes        text,
  status       text not null default 'draft' check (status in
                 ('draft','pending','paid','overdue')),
  issued_at    date,
  due_at       date,
  paid_at      date,
  created_at   timestamptz not null default now(),
  check (project_id is not null or client_id is not null)
);

-- ---------------------------------------------------------------------------
-- Meetings — client calls, kept next to the client rather than in a calendar
-- app, so the agenda, the minutes and the follow-up live with the work.
-- ---------------------------------------------------------------------------
create table meetings (
  id            uuid primary key default uuid_generate_v4(),
  owner_id      uuid not null references auth.users(id) default auth.uid(),
  client_id     uuid references clients(id) on delete cascade,
  project_id    uuid references projects(id) on delete set null,
  title         text not null,
  starts_at     timestamptz not null,   -- a point in time: your clients aren't in IST
  duration_mins int not null default 30,
  location      text,
  attendees     text,
  notes         text,                   -- agenda before, minutes after
  follow_up     text,                   -- one-click convertible into a task
  created_at    timestamptz not null default now()
);

create index meetings_client_idx on meetings(client_id);
create index meetings_starts_idx on meetings(starts_at);

-- ---------------------------------------------------------------------------
-- Tasks — brain dump + timebox live in one table.
-- scheduled_date/scheduled_hour both null  = sitting in the brain dump.
-- both set                                  = placed on the Today timebox.
-- Defined here (before focus_sessions) because focus_sessions.task_id
-- references tasks(id) and Postgres processes CREATE TABLE in file order.
-- ---------------------------------------------------------------------------
create table tasks (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references auth.users(id) default auth.uid(),
  project_id       uuid references projects(id) on delete set null,
  title            text not null,
  dump_date        date not null default current_date,
  scheduled_date   date,
  scheduled_hour   int check (scheduled_hour between 0 and 23),
  -- Half-hour grid. Null means :00, which is exactly how every row written
  -- before half-hour slots existed already behaves, so there is nothing to
  -- backfill.
  scheduled_minute int check (scheduled_minute in (0, 30)),
  -- Legacy whole-hour length. Still written (rounded up) so any reader that
  -- predates duration_minutes keeps working.
  duration_hours   int not null default 1 check (duration_hours between 1 and 8),
  -- Real length in minutes, in 30-minute steps. Takes precedence over
  -- duration_hours wherever both are present.
  duration_minutes int check (duration_minutes between 30 and 480 and duration_minutes % 30 = 0),
  done             boolean not null default false,
  -- The date this task was picked as that day's ONE thing. A date rather
  -- than a boolean so yesterday's choice doesn't silently become today's.
  focus_date       date,
  created_at       timestamptz not null default now()
);

create index tasks_schedule_idx on tasks(owner_id, scheduled_date, scheduled_hour);
create unique index tasks_one_thing_idx on tasks(owner_id, focus_date) where focus_date is not null;

-- ---------------------------------------------------------------------------
-- Focus sessions — recorded because "where did the day go" is unanswerable
-- from a task list alone: a day can be full of real work and show nothing
-- ticked off. Stopping a timer early still writes a row.
-- ---------------------------------------------------------------------------
create table focus_sessions (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references auth.users(id) default auth.uid(),
  task_id          uuid references tasks(id) on delete set null,
  project_id       uuid references projects(id) on delete set null,
  date             date not null,          -- home-timezone day, for roll-ups
  started_at       timestamptz not null default now(),
  minutes          int not null,           -- planned length
  completed_minutes int not null,          -- what actually happened
  note             text
);

create index focus_sessions_date_idx on focus_sessions(owner_id, date);

-- ---------------------------------------------------------------------------
-- Workspace settings — one row per owner. Everything the chrome and the
-- generated documents need. Stored as jsonb so a new preference is never a
-- migration.
-- ---------------------------------------------------------------------------
create table settings (
  id         text primary key,
  owner_id   uuid not null references auth.users(id) default auth.uid() unique,
  clocks     jsonb not null default '[]'::jsonb,   -- customisable clock widgets
  business   jsonb not null default '{}'::jsonb,   -- invoice letterhead + payment details
  -- Weekly / monthly / yearly goals powering the Dashboard. jsonb for the
  -- same reason as the rest of this row: adding a target is never a migration.
  targets    jsonb not null default '{}'::jsonb,
  code_root  text not null default '',             -- the only folder scaffolding may write to
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Bug bounty submissions (bounty-type projects)
-- ---------------------------------------------------------------------------
create table bounty_submissions (
  id                   uuid primary key default uuid_generate_v4(),
  project_id           uuid not null references projects(id) on delete cascade,
  program              text not null,
  severity             text check (severity in ('low','medium','high','critical')),
  status               text not null default 'submitted' check (status in
                         ('submitted','triaged','accepted','duplicate','rejected')),
  payout               numeric,
  currency             text not null default 'INR',
  disclosure_deadline  date,
  created_at           timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Generic metrics — powers the Milestones tab for ANY project type.
-- Stored as text so a new integration (npm, PyPI, GitHub, Chrome Web Store,
-- HackerOne, YouTube, App Store...) never needs a schema change: it just
-- writes rows with its own `source`/`label`.
-- ---------------------------------------------------------------------------
create table project_metrics (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid not null references projects(id) on delete cascade,
  source       text not null,   -- 'github' | 'pypi' | 'npm' | 'chrome_web_store' | 'hackerone' | 'manual' | ...
  label        text not null,   -- 'stars' | 'downloads' | 'installs' | 'subscribers' | ...
  value        text not null,
  delta        text,
  captured_at  timestamptz not null default now()
);

create index project_metrics_project_idx on project_metrics(project_id, source, label, captured_at desc);

create table milestones (
  id           uuid primary key default uuid_generate_v4(),
  project_id   uuid not null references projects(id) on delete cascade,
  label        text not null,
  occurred_on  date,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Notes — metadata mirror of the Obsidian vault. The .md content itself
-- lives in the vault; this row is what lets Meridian list/link/search notes
-- without owning the file.
-- ---------------------------------------------------------------------------
create table notes (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  project_id  uuid references projects(id) on delete set null,
  client_id   uuid references clients(id) on delete set null,
  title       text not null,
  vault_path  text not null,      -- relative path inside the Obsidian vault, e.g. "SOPs/Client onboarding.md"
  tags        text[] not null default '{}',
  synced_at   timestamptz,
  created_at  timestamptz not null default now()
);

create unique index notes_vault_path_owner_idx on notes(owner_id, vault_path);

-- ---------------------------------------------------------------------------
-- Integrations — the connector registry. One row per external tool this
-- project (or the workspace generally) is wired to. `config` is intentionally
-- schemaless (jsonb) since every provider needs different fields.
-- ---------------------------------------------------------------------------
create table integrations (
  id               uuid primary key default uuid_generate_v4(),
  owner_id         uuid not null references auth.users(id) default auth.uid(),
  project_id       uuid references projects(id) on delete cascade,
  provider         text not null,   -- 'github' | 'pypi' | 'npm' | 'chrome_web_store' | 'hackerone' | 'obsidian' | ...
  config           jsonb not null default '{}',
  last_synced_at   timestamptz,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Alert state — notifications themselves are DERIVED from the tables above
-- (see src/features/notifications/queries.ts), so nothing stores an alert's
-- text. Only the user's interaction with each alert is persisted here, keyed
-- by a deterministic alert_key so repeat actions upsert instead of piling up.
-- ---------------------------------------------------------------------------
create table alert_states (
  id             text primary key,        -- "<owner_id>:<alert_key>"
  owner_id       uuid not null references auth.users(id) default auth.uid(),
  alert_key      text not null,
  read           boolean not null default false,
  dismissed      boolean not null default false,
  snoozed_until  timestamptz,
  updated_at     timestamptz not null default now()
);

create index alert_states_owner_idx on alert_states(owner_id);

-- ---------------------------------------------------------------------------
-- Row Level Security — single-tenant today, ready for a team later.
-- Everything scopes to owner_id, either directly or via its parent project.
-- ---------------------------------------------------------------------------
alter table clients enable row level security;
alter table projects enable row level security;
alter table project_phases enable row level security;
alter table quotes enable row level security;
alter table invoices enable row level security;
alter table bounty_submissions enable row level security;
alter table project_metrics enable row level security;
alter table milestones enable row level security;
alter table notes enable row level security;
alter table tasks enable row level security;
alter table integrations enable row level security;
alter table alert_states enable row level security;

create policy "owner full access" on clients for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on notes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on tasks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on integrations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on alert_states for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables scope through their project's owner
create policy "owner via project" on project_phases for all
  using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "owner via project" on quotes for all
  using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "owner via project" on invoices for all
  using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "owner via project" on bounty_submissions for all
  using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "owner via project" on project_metrics for all
  using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));

create policy "owner via project" on milestones for all
  using (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from projects p where p.id = project_id and p.owner_id = auth.uid()));