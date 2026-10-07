-- Daily Finance: the sister's share of an invoice (added by hand, per invoice)
-- and a plain investment log. Run after 014. Safe to run once.
-- See src/features/daily-finance/set-aside.ts.

-- New ledger source + the % a share was taken at.
alter table finance_entries drop constraint if exists finance_entries_source_check;
alter table finance_entries add constraint finance_entries_source_check
  check (source in ('manual', 'invoice_payment', 'bounty_payout', 'reward_vault', 'salary', 'obligation',
                    'invoice_split'));
alter table finance_entries add column if not exists split_pct numeric;  -- % of received the sister's share was set at

-- At most one sister's share per invoice.
create unique index if not exists finance_entries_split_once_idx
  on finance_entries(linked_invoice_id) where source = 'invoice_split';

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
