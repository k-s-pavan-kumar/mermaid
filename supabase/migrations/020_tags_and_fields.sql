-- Tags (one shared table) and Fields (a tag that gets its own page + yearly
-- targets). Run after 019. Safe to run more than once.
create table if not exists tags (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  name        text not null,
  color       text not null default '#5F3DEB',
  is_field    boolean not null default false,     -- true = has its own sidebar page and yearly targets
  special     text check (special in ('tpn')),    -- 'tpn' = the TPN audit field (its page is /tpn-audits)
  sort_order  int not null default 0,
  created_at  timestamptz not null default now()
);
create unique index if not exists tags_owner_name_idx on tags(owner_id, lower(name));
alter table tags enable row level security;
drop policy if exists "owner full access" on tags;
create policy "owner full access" on tags for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- Goals belong to a field, and can carry a numeric yearly target.
alter table goals add column if not exists field_id uuid references tags(id) on delete set null;
alter table goals add column if not exists target_value numeric;
alter table goals add column if not exists unit text;
alter table goals add column if not exists progress_value numeric not null default 0;
create index if not exists goals_field_idx on goals(owner_id, field_id, year);

-- Projects can belong to a field too (shown on that field's page).
alter table projects add column if not exists field_id uuid references tags(id) on delete set null;
create index if not exists projects_field_idx on projects(owner_id, field_id);
