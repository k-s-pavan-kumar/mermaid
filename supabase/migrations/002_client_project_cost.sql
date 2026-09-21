-- Clients now carry a TOTAL project cost (fixed price) instead of an hourly
-- rate. Renames clients.rate -> clients.project_cost. Idempotent.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'clients' and column_name = 'rate') then
    alter table clients rename column rate to project_cost;
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'clients' and column_name = 'project_cost') then
    alter table clients add column project_cost numeric;
  end if;
end $$;
