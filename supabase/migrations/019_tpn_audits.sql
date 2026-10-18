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
