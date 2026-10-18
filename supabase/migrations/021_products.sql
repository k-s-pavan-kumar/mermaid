-- Products: one SaaS and the app, book, game and marketing built around it.
-- Run after 020. Safe to run more than once.
create table if not exists products (
  id          uuid primary key default uuid_generate_v4(),
  owner_id    uuid not null references auth.users(id) default auth.uid(),
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);
alter table products enable row level security;
drop policy if exists "owner full access" on products;
create policy "owner full access" on products for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

alter table projects add column if not exists product_id uuid references products(id) on delete set null;
alter table projects add column if not exists product_role text
  check (product_role in ('saas','app','book','game','marketing','other'));
create index if not exists projects_product_idx on projects(owner_id, product_id);

alter table goals add column if not exists product_id uuid references products(id) on delete set null;
create index if not exists goals_product_idx on goals(owner_id, product_id, year);
