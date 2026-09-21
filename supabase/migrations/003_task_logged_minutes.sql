-- Hours worked per task, so each project can show hours and a working rate
-- (money ÷ hours). Idempotent: the backfill runs only when the column is
-- first created, so re-running never double-counts.
do $$
begin
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'tasks' and column_name = 'logged_minutes') then
    alter table tasks add column logged_minutes int not null default 0 check (logged_minutes >= 0);

    -- Credit past timer sessions to the task they were run on.
    update tasks t
       set logged_minutes = s.total
      from (select task_id, sum(completed_minutes)::int as total
              from focus_sessions where task_id is not null group by task_id) s
     where s.task_id = t.id;
  end if;
end $$;
