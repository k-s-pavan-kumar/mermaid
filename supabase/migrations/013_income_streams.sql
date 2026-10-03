-- Daily Finance: income streams with yearly targets. Run after 012.

-- ---------------------------------------------------------------------------
-- Income streams (Daily Finance): named buckets with a yearly target. A stream
-- doesn't hold money — it owns income categories, and auto-posted income whose
-- category it owns counts toward its target. See daily-finance/streams.ts.
-- ---------------------------------------------------------------------------
create table if not exists income_streams (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  name        text not null,
  color       text not null default '#00A0A6',
  categories  jsonb not null default '[]'::jsonb,  -- income categories counted in this stream
  targets     jsonb not null default '{}'::jsonb,  -- {"2026": 600000}
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now(),
  unique (owner_id, name)
);
create index if not exists income_streams_owner_idx on income_streams(owner_id, sort_order);
alter table income_streams enable row level security;
drop policy if exists "owner full access" on income_streams;
create policy "owner full access" on income_streams for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
