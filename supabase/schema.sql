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
--
--   -- Per-project targets ("Acme should get 15h/week"):
--   alter table projects add column targets jsonb not null default '{}'::jsonb;
--
--   -- Custom Dashboard categories ("deep work" / "admin" / "learning"),
--   -- and letting a task or focus session carry one directly:
--   alter table settings add column categories jsonb not null default '[]'::jsonb;
--   alter table tasks add column category text;
--   alter table focus_sessions add column category text;
--
--   -- Editable historical targets: every save becomes a new dated version
--   -- instead of overwriting settings.targets in place, so "what was my
--   -- target back in June" stays answerable. settings.targets is no longer
--   -- written to directly by the app (queries.ts computes it at read time
--   -- from this table) but the column itself is left in place, harmless.
--   create table targets_history (
--     id            text primary key,
--     owner_id      uuid not null references auth.users(id) default auth.uid(),
--     effective_from date not null,
--     targets       jsonb not null default '{}'::jsonb,
--     created_at    timestamptz not null default now(),
--     unique (owner_id, effective_from)
--   );
--   alter table targets_history enable row level security;
--   create policy "owner only" on targets_history for all
--     using (owner_id = auth.uid()) with check (owner_id = auth.uid());
--   create index targets_history_owner_effective_idx
--     on targets_history (owner_id, effective_from desc);
--
--   -- Recommended once the half-hour grid and Dashboard are both in regular
--   -- use — the Dashboard now scans a full financial year on every visit:
--   create index if not exists tasks_owner_scheduled_date_idx
--     on tasks (owner_id, scheduled_date);
--   create index if not exists focus_sessions_owner_date_idx
--     on focus_sessions (owner_id, date);
--   create index if not exists invoices_owner_paid_at_idx
--     on invoices (owner_id, paid_at) where status = 'paid';
--
--   -- Daily Finance, Bug Bounty Pipeline, Reward Vault, Learning Tracker,
--   -- Release Stats: seven new tables, each a plain `create table` — see the
--   -- corresponding statements further down in this file for the current,
--   -- authoritative shape of each (project_status_log, finance_entries,
--   -- bounty_cases, needs, courses, tracked_packages, metric_snapshots).
--   -- Run those `create table` / `create index` / RLS statements directly
--   -- against an existing database; they're additive and safe to run once.
--
--   alter table projects add column earned_override jsonb;
--   alter table projects drop constraint projects_status_check;
--   alter table projects add constraint projects_status_check
--     check (status in ('idea','ontrack','review','risk','done','dropped'));
--   alter table projects drop constraint projects_type_check;
--   alter table projects add constraint projects_type_check check (type in
--     ('client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute'));
--   alter table projects drop constraint projects_types_check;
--   alter table projects add constraint projects_types_check check (types <@ array[
--     'client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute']::text[]);
--
--   alter table settings add column reward_vault jsonb not null default '{}'::jsonb;
--
--   -- 'teaching' (school/institute classes, tuition) and 'marketing'
--   -- (digital marketing retainers) as project types, so this kind of work
--   -- can be picked in the Projects picker and then shows up as a project
--   -- to log time against on Today:
--   alter table projects drop constraint projects_type_check;
--   alter table projects add constraint projects_type_check check (type in
--     ('client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing'));
--   alter table projects drop constraint projects_types_check;
--   alter table projects add constraint projects_types_check check (types <@ array[
--     'client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing']::text[]);

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
                 check (work_types <@ array['web','mobile','design','security','teaching','consulting','maintenance','content','marketing']::text[]),
  project_cost numeric,                       -- agreed TOTAL project cost (fixed price), pre-fills the first invoice/quote line
  -- How they pay: one fixed project cost, or a monthly retainer (e.g. digital
  -- marketing). Each received month is a paid invoice carrying invoices.period.
  billing_type     text not null default 'project' check (billing_type in ('project','monthly')),
  monthly_fee      numeric,
  retainer_start   date,                        -- first month billed (the 1st of that month)
  retainer_due_day int check (retainer_due_day between 1 and 28),
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
                 ('client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing')),
  -- Full type set — a project is often several things at once (an
  -- open-source repo that's also a web app; client work that's also an
  -- assessment). Order matters: types[1] is the primary.
  types        text[] not null default '{}'
                 check (types <@ array['client','internal','opensource','mobile','game','web','content','assess','bounty','freelance','institute','teaching','marketing']::text[]),
  client_id    uuid references clients(id) on delete set null,
  -- 'dropped' is an explicit terminal state distinct from 'done', so the
  -- Reward Vault can tell "finished, unlocks rewards" apart from
  -- "abandoned, releases rewards" without overloading one status value.
  status       text not null default 'idea' check (status in
                 ('idea','ontrack','review','risk','done','dropped')),
  description  text,
  -- Per-project target ("Acme should get 15h/week"), separate from the
  -- workspace-wide targets. Empty jsonb means "no target set" — the project
  -- simply doesn't appear in the Dashboard's per-project section.
  targets      jsonb not null default '{}'::jsonb,
  -- The Reward Vault's substitute "paid" signal for a project with no real
  -- invoice (internal tools, plugins). Null means not set. Always written
  -- together with a required note and a project_status_log entry — see
  -- markProjectEarnedOverride() in src/features/projects/actions.ts.
  earned_override jsonb,
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
  period       text check (period ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),  -- 'YYYY-MM', monthly-retainer invoices only
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
  -- Tax the client deducted at source before paying (India: TDS). Kept on
  -- the invoice itself, editable any time — before or after it's marked
  -- paid — because it's usually only known once the payment lands and a
  -- Form 16A/26AS shows it, not at invoicing time. markInvoicePaid() nets
  -- it out of the amount actually posted as income; setInvoiceTds() keeps
  -- an already-posted entry in sync if it's edited afterwards.
  tds_amount   numeric not null default 0,
  check (project_id is not null or client_id is not null)
);

-- The Dashboard's year/month/week revenue figures filter paid invoices by
-- owner + paid_at.
create index invoices_owner_paid_at_idx on invoices(owner_id, paid_at) where status = 'paid';
-- One retainer invoice per client per month.
create unique index invoices_client_period_idx on invoices(client_id, period) where period is not null;
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
  -- Dashboard category tag ("deep work" / "admin" / "learning"), defined in
  -- Settings. Overrides the project's type in the 24-hour split when set;
  -- null falls back to the project's type exactly as before this existed.
  category         text,
  -- Minutes actually worked (not the planned block). Typed on the project's
  -- To-do tab and topped up by every timer session finished on the task;
  -- summed per project to get the project's hours and working rate.
  logged_minutes   int not null default 0 check (logged_minutes >= 0),
  done             boolean not null default false,
  -- The date this task was picked as that day's ONE thing. A date rather
  -- than a boolean so yesterday's choice doesn't silently become today's.
  focus_date       date,
  created_at       timestamptz not null default now()
);

create index tasks_schedule_idx on tasks(owner_id, scheduled_date, scheduled_hour);
create unique index tasks_one_thing_idx on tasks(owner_id, focus_date) where focus_date is not null;
-- The Dashboard scans a full financial year of tasks by owner + date on
-- every visit; this is that query's index.
create index tasks_owner_scheduled_date_idx on tasks(owner_id, scheduled_date);

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
  note             text,
  -- Direct category override for a session not tied to a task (or one that
  -- should be categorised differently from its task). Falls back to the
  -- linked task's category, then the project's type, when null.
  category         text
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
  -- Deprecated: the app no longer writes to this column directly. Kept so an
  -- existing row from before targets_history existed doesn't need a
  -- migration; queries.ts computes the "current" targets from
  -- targets_history at read time instead.
  targets    jsonb not null default '{}'::jsonb,
  -- User-defined Dashboard categories ("deep work" / "admin" / "learning"),
  -- as [{key, label, color}]. Empty by default: every task buckets by its
  -- project's type until one is defined.
  categories jsonb not null default '[]'::jsonb,
  -- Reward Vault friction windows (cooldown/expiry/spend caps) — see
  -- RewardVaultConfig in src/features/settings/types.ts. Empty jsonb falls
  -- back to DEFAULT_REWARD_VAULT at read time.
  reward_vault jsonb not null default '{}'::jsonb,
  code_root  text not null default '',             -- the only folder scaffolding may write to
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Targets history — every save is a new dated version, never an edit in
-- place, so "what was my target back in June" stays answerable even after
-- the numbers have changed since. The version whose effective_from is the
-- latest date not after a given day is the one that applied that day.
-- ---------------------------------------------------------------------------
create table targets_history (
  id              text primary key,
  owner_id        uuid not null references auth.users(id) default auth.uid(),
  effective_from  date not null,
  targets         jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  unique (owner_id, effective_from)
);

create index targets_history_owner_effective_idx
  on targets_history (owner_id, effective_from desc);

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
  -- Note body. Serverless hosts (Vercel) have no writable disk, so the body
  -- lives here; the .md vault file is an optional local mirror.
  content     text not null default '',
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
-- Project audit log — append-only. Never updated or deleted; see
-- src/features/projects/audit-log.ts, the only code that writes to it.
-- ---------------------------------------------------------------------------
create table project_status_log (
  id           text primary key,
  owner_id     uuid not null references auth.users(id) default auth.uid(),
  project_id   uuid not null references projects(id) on delete cascade,
  project_name text not null,             -- denormalised: survives the project being deleted
  field_changed text not null check (field_changed in ('status', 'earned')),
  from_value   text not null,
  to_value     text not null,
  changed_at   timestamptz not null default now(),
  note         text
);

create index project_status_log_owner_idx on project_status_log(owner_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- Daily Finance — the day-to-day cash ledger. Income rows are only ever
-- written by another feature's own action (an invoice marked paid, a bounty
-- reaching paid); see postIncomeEntry() in
-- src/features/daily-finance/actions.ts. There is no form anywhere that
-- lets a person type in income directly.
-- ---------------------------------------------------------------------------
create table finance_entries (
  id                 text primary key,
  owner_id           uuid not null references auth.users(id) default auth.uid(),
  date               date not null,
  type               text not null check (type in ('income', 'expense')),
  category           text not null,
  amount             numeric not null check (amount >= 0), -- always positive; sign comes from `type`
  note               text,
  source             text not null check (source in
                       ('manual', 'invoice_payment', 'bounty_payout', 'reward_vault', 'salary', 'obligation')),
  created_at         timestamptz not null default now(),
  linked_project_id  uuid references projects(id) on delete set null,
  linked_invoice_id  uuid references invoices(id) on delete set null,
  linked_bounty_id   text,  -- references bounty_cases(id); text because bounty_cases.id isn't a uuid
  linked_need_id     text,  -- references needs(id); same reason
  linked_obligation_id text, -- references finance_obligations(id); no FK since that table is created further below
  -- Tax already deducted at source on this income row (see invoices.tds_amount).
  tds_amount         numeric
);

create index finance_entries_owner_date_idx on finance_entries(owner_id, date desc);
-- Guards the idempotency check in postIncomeEntry()/postRewardVaultExpense():
-- at most one auto-posted entry per source event.
create unique index finance_entries_invoice_once_idx on finance_entries(linked_invoice_id) where linked_invoice_id is not null;
create unique index finance_entries_bounty_once_idx on finance_entries(linked_bounty_id) where linked_bounty_id is not null;
create unique index finance_entries_need_once_idx on finance_entries(linked_need_id) where linked_need_id is not null;

-- ---------------------------------------------------------------------------
-- Custom expense categories & label→category matching rules (Daily Finance)
-- ---------------------------------------------------------------------------
create table finance_categories (
  id         text primary key,
  owner_id   uuid not null references auth.users(id) default auth.uid(),
  name       text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table finance_category_rules (
  id         text primary key,
  owner_id   uuid not null references auth.users(id) default auth.uid(),
  keyword    text not null,
  category   text not null,
  created_at timestamptz not null default now()
);
create index finance_category_rules_owner_idx on finance_category_rules(owner_id);

-- ---------------------------------------------------------------------------
-- Dues (Daily Finance) — recurring or one-off amounts owed either way:
-- college fee, clearing a loan, paying a friend back, or a friend owing the
-- person money. See FinanceObligation in daily-finance/types.ts.
-- ---------------------------------------------------------------------------
create table finance_obligations (
  id             text primary key,
  owner_id       uuid not null references auth.users(id) default auth.uid(),
  label          text not null,
  category       text not null,
  direction      text not null check (direction in ('payable', 'receivable')),
  cadence        text not null check (cadence in ('monthly', 'one_time')),
  default_amount numeric,
  due_date       date,
  taken_date     date,
  note           text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index finance_obligations_owner_idx on finance_obligations(owner_id, active);

-- ---------------------------------------------------------------------------
-- Day log (Today page): sleep / travel / office blocks. date + start_minute is
-- when a block starts; duration_minutes may run past midnight.
-- ---------------------------------------------------------------------------
create table day_blocks (
  id               text primary key,
  owner_id         uuid not null references auth.users(id) default auth.uid(),
  date             date not null,
  kind             text not null check (kind in ('sleep', 'travel', 'office')),
  start_minute     int  not null check (start_minute between 0 and 1439),
  duration_minutes int  not null check (duration_minutes between 1 and 1440),
  note             text,
  created_at       timestamptz not null default now()
);
create index day_blocks_owner_date_idx on day_blocks(owner_id, date);

-- ---------------------------------------------------------------------------
-- Bug Bounty Pipeline — a standalone kanban, deliberately not shaped like a
-- Project (no client, no invoice). Distinct from the older, lighter
-- `bounty_submissions` still used on a bounty-type project's own
-- Submissions tab; this is the richer, owner-level pipeline with its own
-- payout lifecycle.
-- ---------------------------------------------------------------------------
create table bounty_cases (
  id                text primary key,
  owner_id          uuid not null references auth.users(id) default auth.uid(),
  title             text not null,
  program_name      text not null,
  severity          text not null check (severity in ('critical', 'high', 'medium', 'low')),
  status            text not null default 'submitted'
                      check (status in ('submitted', 'triaged', 'accepted', 'paid', 'rejected', 'duplicate')),
  currency          text not null default 'INR',
  estimated_payout  numeric,
  confirmed_payout  numeric,
  paid_amount       numeric,
  submitted_at      date not null,
  triaged_at        date,
  accepted_at       date,
  paid_at           date,
  created_at        timestamptz not null default now()
);

create index bounty_cases_owner_status_idx on bounty_cases(owner_id, status);

-- ---------------------------------------------------------------------------
-- Reward Vault — Needs and their state machine. `status`, `unlocked_at` and
-- `purchased_at` are written only by reconcileNeeds()/markPurchased() in
-- src/features/reward-vault/{queries,actions}.ts — never by a direct edit
-- from the UI.
-- ---------------------------------------------------------------------------
create table needs (
  id                text primary key,
  owner_id          uuid not null references auth.users(id) default auth.uid(),
  name              text not null,
  category          text not null,
  emoji_icon        text not null default '🎁',
  price             numeric not null check (price > 0),
  source_type       text not null check (source_type in ('project', 'course')),
  linked_source_id  text,  -- a projects(id) uuid or a courses(id) text, depending on source_type
  status            text not null default 'in_progress'
                      check (status in ('in_progress', 'cooling_off', 'ready', 'purchased', 'released', 'expired')),
  progress_pct      integer not null default 0 check (progress_pct between 0 and 100),
  unlocked_at       timestamptz,
  cooldown_ends_at  timestamptz,
  purchased_at      date,
  expires_at        timestamptz,
  created_at        timestamptz not null default now(),
  linked_at         timestamptz not null default now(),
  notify_pending    text check (notify_pending in ('cooldown_started', 'ready'))
);

create index needs_owner_status_idx on needs(owner_id, status);
-- Rule 4: at most one *active* (in_progress/cooling_off) need per source.
-- Enforced here, not just in application code, so a race between two
-- requests can't create two.
create unique index needs_one_active_per_source_idx
  on needs(owner_id, source_type, linked_source_id)
  where status in ('in_progress', 'cooling_off') and linked_source_id is not null;

-- ---------------------------------------------------------------------------
-- Learning Tracker
-- ---------------------------------------------------------------------------
create table courses (
  id                 text primary key,
  owner_id           uuid not null references auth.users(id) default auth.uid(),
  title              text not null,
  provider           text not null,
  topic_tags         jsonb not null default '[]'::jsonb,
  total_lessons      integer not null check (total_lessons > 0),
  completed_lessons  integer not null default 0 check (completed_lessons >= 0),
  completed_at       date,
  created_at         timestamptz not null default now()
);

create index courses_owner_idx on courses(owner_id);

-- ---------------------------------------------------------------------------
-- Release Stats — packages tracked, and the snapshot history behind each
-- card's sparkline and week-over-week delta.
-- ---------------------------------------------------------------------------
create table tracked_packages (
  id                    text primary key,
  owner_id              uuid not null references auth.users(id) default auth.uid(),
  name                  text not null,
  description           text not null default '',
  emoji_icon            text not null default '📦',
  platform              text not null check (platform in ('npm', 'pypi', 'github', 'chrome_web_store')),
  platform_identifier   text not null,
  family                text,
  created_at            timestamptz not null default now()
);

create table metric_snapshots (
  id             text primary key,
  owner_id       uuid not null references auth.users(id) default auth.uid(),
  package_id     text not null references tracked_packages(id) on delete cascade,
  captured_at    timestamptz not null default now(),
  stars          integer,
  downloads_30d  integer,
  installs       integer,
  rating         numeric,
  review_count   integer,
  fetch_ok       boolean not null default true
);

create index metric_snapshots_package_idx on metric_snapshots(package_id, captured_at desc);

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
alter table targets_history enable row level security;
alter table project_status_log enable row level security;
alter table finance_entries enable row level security;
alter table finance_categories enable row level security;
alter table finance_category_rules enable row level security;
alter table finance_obligations enable row level security;
alter table day_blocks enable row level security;
alter table bounty_cases enable row level security;
alter table needs enable row level security;
alter table courses enable row level security;
alter table tracked_packages enable row level security;
alter table metric_snapshots enable row level security;
alter table meetings enable row level security;
alter table focus_sessions enable row level security;
alter table settings enable row level security;

create policy "owner full access" on quotes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on invoices for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on meetings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on focus_sessions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on settings for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on clients for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on projects for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on notes for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on tasks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on integrations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on alert_states for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on targets_history for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on project_status_log for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on finance_entries for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on finance_categories for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on finance_category_rules for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on finance_obligations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on day_blocks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on bounty_cases for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on needs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on courses for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on tracked_packages for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on metric_snapshots for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Child tables scope through their project's owner
create policy "owner via project" on project_phases for all
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