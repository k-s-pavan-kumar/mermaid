-- Costs per field/product, TDS match checks, launch dates, audit checklists &
-- billing link, recurring invoices, and non-flat monthly target shapes.
-- Run after 023. Safe to run more than once.

-- Business costs, so a field/product can show profit and not just revenue.
create table if not exists field_costs (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  field_id    uuid references tags(id) on delete set null,
  product_id  uuid references products(id) on delete set null,
  date        date not null,
  amount      numeric not null check (amount >= 0),
  label       text not null,
  created_at  timestamptz not null default now()
);
create index if not exists field_costs_owner_idx on field_costs(owner_id, date);
alter table field_costs enable row level security;
drop policy if exists "owner full access" on field_costs;
create policy "owner full access" on field_costs for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- "Matched against Form 26AS" tick per client per financial year.
create table if not exists tds_checks (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  client_id   uuid not null references clients(id) on delete cascade,
  fy          int  not null,                       -- financial year start, e.g. 2026 = Apr 2026 – Mar 2027
  matched     boolean not null default false,
  created_at  timestamptz not null default now(),
  unique (owner_id, client_id, fy)
);
alter table tds_checks enable row level security;
drop policy if exists "owner full access" on tds_checks;
create policy "owner full access" on tds_checks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table products add column if not exists launch_date date;

alter table audits add column if not exists checklist jsonb;
alter table audits add column if not exists billing_invoice_id uuid references invoices(id) on delete set null;

alter table invoices add column if not exists recurring boolean not null default false;

alter table field_targets add column if not exists weights jsonb;   -- 12 non-negative numbers; null = even
