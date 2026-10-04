-- Journal: day-wise personal notes / brain dump. Run after 013. Additive and
-- idempotent - safe to run more than once.
--
-- entry_date is the calendar day in the app's home timezone (decided by the
-- app, not the database), so a note written at 1am IST belongs to that IST day.

create table if not exists journal_entries (
  id          text primary key,
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  entry_date  date not null,
  content     text not null check (char_length(content) between 1 and 20000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists journal_entries_owner_date_idx on journal_entries(owner_id, entry_date);

alter table journal_entries enable row level security;
drop policy if exists "owner full access" on journal_entries;
create policy "owner full access" on journal_entries for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());
