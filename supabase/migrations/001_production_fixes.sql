-- Meridian — production fixes. Safe to run on a database that already has the
-- original schema.sql applied. Idempotent: running it twice changes nothing.
--
-- 1. quotes / invoices: the old policy required a project, so any document
--    raised against a client only (project_id null) was rejected by RLS.
-- 2. meetings / focus_sessions / settings had NO row level security, meaning
--    anyone holding the public anon key could read or write them.
-- 3. notes.content: note bodies are stored in Postgres because Vercel has no
--    writable disk for the Obsidian vault folder.

alter table notes add column if not exists content text not null default '';

-- 1 ---------------------------------------------------------------------------
drop policy if exists "owner via project" on quotes;
drop policy if exists "owner via project" on invoices;
drop policy if exists "owner full access" on quotes;
drop policy if exists "owner full access" on invoices;
create policy "owner full access" on quotes   for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on invoices for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- 2 ---------------------------------------------------------------------------
alter table meetings       enable row level security;
alter table focus_sessions enable row level security;
alter table settings       enable row level security;

drop policy if exists "owner full access" on meetings;
drop policy if exists "owner full access" on focus_sessions;
drop policy if exists "owner full access" on settings;
create policy "owner full access" on meetings       for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on focus_sessions for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy "owner full access" on settings       for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
