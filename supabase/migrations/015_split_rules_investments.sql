-- Daily Finance: set-aside rules (e.g. 10% of every invoice payment to a
-- sister) and a plain investment log. Run after 014. Safe to run once.
-- See src/features/daily-finance/set-aside.ts.

-- New ledger source + the columns that tie a set-aside back to its payment.
alter table finance_entries drop constraint if exists finance_entries_source_check;
alter table finance_entries add constraint finance_entries_source_check
  check (source in ('manual', 'invoice_payment', 'bounty_payout', 'reward_vault', 'salary', 'obligation',
                    'invoice_split'));
alter table finance_entries add column if not exists linked_payment_id    text;     -- the invoice-payment row a split came from
alter table finance_entries add column if not exists linked_split_rule_id text;     -- finance_split_rules(id)
alter table finance_entries add column if not exists split_pct            numeric;  -- the rule's % when it posted

-- One set-aside per (payment, rule): the idempotency guard in applySplitsForPayment().
create unique index if not exists finance_entries_split_once_idx
  on finance_entries(linked_payment_id, linked_split_rule_id) where source = 'invoice_split';

create table if not exists finance_split_rules (
  id         text primary key,
  owner_id   uuid not null references auth.users(id) default auth.uid(),
  label      text not null,
  pct        numeric not null check (pct > 0 and pct <= 100),
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists finance_split_rules_owner_idx on finance_split_rules(owner_id);
alter table finance_split_rules enable row level security;
drop policy if exists "owner full access" on finance_split_rules;
create policy "owner full access" on finance_split_rules for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Investment log: amount, what it went into, date. Standalone — not linked to
-- invoices and never posts to finance_entries.
create table if not exists finance_investment_log (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  amount      numeric not null check (amount > 0),
  invested_in text not null,
  date        date not null,
  created_at  timestamptz not null default now()
);
create index if not exists finance_investment_log_owner_idx on finance_investment_log(owner_id, date);
alter table finance_investment_log enable row level security;
drop policy if exists "owner full access" on finance_investment_log;
create policy "owner full access" on finance_investment_log for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
