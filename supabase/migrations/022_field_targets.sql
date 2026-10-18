-- Yearly money targets per field, and the Bug Bounty field. Run after 021.
-- Safe to run more than once.
alter table tags drop constraint if exists tags_special_check;
alter table tags add constraint tags_special_check check (special in ('tpn','bounty'));

create table if not exists field_targets (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  field_id    uuid not null references tags(id) on delete cascade,
  year        int  not null check (year between 2000 and 2100),
  amount      numeric not null check (amount >= 0),
  created_at  timestamptz not null default now(),
  unique (field_id, year)
);
create index if not exists field_targets_owner_idx on field_targets(owner_id, year);
alter table field_targets enable row level security;
drop policy if exists "owner full access" on field_targets;
create policy "owner full access" on field_targets for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
