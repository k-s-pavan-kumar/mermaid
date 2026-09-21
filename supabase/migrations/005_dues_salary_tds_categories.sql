-- Dues (payables/receivables), salary income, TDS tracking, and custom
-- expense categories / label-matching rules for Daily Finance. Additive and
-- idempotent — safe to run once against an existing database.

alter table invoices add column if not exists tds_amount numeric not null default 0;

create table if not exists finance_obligations (
  id             text primary key,
  owner_id       uuid not null references auth.users(id) default auth.uid(),
  label          text not null,
  category       text not null,
  direction      text not null check (direction in ('payable', 'receivable')),
  cadence        text not null check (cadence in ('monthly', 'one_time')),
  default_amount numeric,
  note           text,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);
create index if not exists finance_obligations_owner_idx on finance_obligations(owner_id, active);

create table if not exists finance_categories (
  id         text primary key,
  owner_id   uuid not null references auth.users(id) default auth.uid(),
  name       text not null,
  created_at timestamptz not null default now(),
  unique (owner_id, name)
);

create table if not exists finance_category_rules (
  id         text primary key,
  owner_id   uuid not null references auth.users(id) default auth.uid(),
  keyword    text not null,
  category   text not null,
  created_at timestamptz not null default now()
);
create index if not exists finance_category_rules_owner_idx on finance_category_rules(owner_id);

alter table finance_entries add column if not exists linked_obligation_id text;
alter table finance_entries add column if not exists tds_amount numeric;

alter table finance_entries drop constraint if exists finance_entries_source_check;
alter table finance_entries add constraint finance_entries_source_check
  check (source in ('manual', 'invoice_payment', 'bounty_payout', 'reward_vault', 'salary', 'obligation'));

alter table finance_obligations enable row level security;
alter table finance_categories enable row level security;
alter table finance_category_rules enable row level security;

drop policy if exists "owner full access" on finance_obligations;
create policy "owner full access" on finance_obligations for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner full access" on finance_categories;
create policy "owner full access" on finance_categories for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists "owner full access" on finance_category_rules;
create policy "owner full access" on finance_category_rules for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
