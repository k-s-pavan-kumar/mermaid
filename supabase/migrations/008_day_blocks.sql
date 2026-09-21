-- Sleep / travel / office blocks for the Today page's day log. Additive and
-- idempotent — safe to run once against an existing database.
--
-- `date` + `start_minute` = when the block starts; `duration_minutes` may run
-- past midnight (a 23:30 sleep that lasts 420 minutes ends the next morning).

create table if not exists day_blocks (
  id               text primary key,
  owner_id         uuid not null references auth.users(id) default auth.uid(),
  date             date not null,
  kind             text not null check (kind in ('sleep', 'travel', 'office')),
  start_minute     int  not null check (start_minute between 0 and 1439),
  duration_minutes int  not null check (duration_minutes between 1 and 1440),
  note             text,
  created_at       timestamptz not null default now()
);
create index if not exists day_blocks_owner_date_idx on day_blocks(owner_id, date);

alter table day_blocks enable row level security;
drop policy if exists "owner full access" on day_blocks;
create policy "owner full access" on day_blocks for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
