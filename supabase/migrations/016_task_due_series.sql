-- Deadlines on tasks, and a marker for tasks created by one "Repeat".
alter table tasks add column if not exists due_date  date;
alter table tasks add column if not exists series_id text;
create index if not exists tasks_due_idx on tasks(owner_id, due_date) where due_date is not null and done = false;
