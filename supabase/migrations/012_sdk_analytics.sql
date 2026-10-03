-- Release Stats: first-party SDK analytics (Figma / Chrome / Snap lens / SaaS).
-- Run after 011.
alter table tracked_packages add column if not exists ingest_key    text unique;
alter table tracked_packages add column if not exists last_event_at timestamptz;

alter table metric_snapshots add column if not exists opens_30d   integer;
alter table metric_snapshots add column if not exists return_rate numeric;
alter table metric_snapshots drop constraint if exists metric_snapshots_source_check;
alter table metric_snapshots add constraint metric_snapshots_source_check check (source in ('auto', 'manual', 'sdk'));

-- ---------------------------------------------------------------------------
-- SDK analytics — first-party events from Figma plugins, Chrome extensions,
-- Snapchat Camera Kit / Spectacles lenses and SaaS apps, sent to
-- /api/ingest by the Meridian SDK. ONLY rollups are stored: a per-day count
-- per event name, and one row per anonymous user. No raw events, properties,
-- IP addresses or client timestamps are kept.
-- ---------------------------------------------------------------------------
create table if not exists analytics_daily (
  package_id  text   not null references tracked_packages(id) on delete cascade,
  owner_id    uuid   not null,
  day         date   not null,
  event       text   not null,
  count       bigint not null default 0,
  primary key (package_id, day, event)
);

create table if not exists analytics_users (
  package_id   text not null references tracked_packages(id) on delete cascade,
  owner_id     uuid not null,
  anon_id      text not null,
  first_day    date not null,
  last_day     date not null,
  active_days  integer not null default 1,
  primary key (package_id, anon_id)
);
create index if not exists analytics_users_last_idx on analytics_users(package_id, last_day);

alter table analytics_daily enable row level security;
alter table analytics_users enable row level security;
drop policy if exists "owner can read" on analytics_daily;
drop policy if exists "owner can read" on analytics_users;
create policy "owner can read" on analytics_daily for select using (owner_id = auth.uid());
create policy "owner can read" on analytics_users for select using (owner_id = auth.uid());

-- Called ONLY by the ingest route with the service-role key. p_events is
-- [{"event": "open", "n": 3}], p_users is ["anonid1", ...] — both already
-- aggregated per request. Atomic increments, so concurrent batches are safe.
create or replace function analytics_record(p_key text, p_day date, p_events jsonb, p_users jsonb)
returns jsonb language plpgsql as $$
declare
  v_pkg tracked_packages%rowtype;
  v_names integer;
  e jsonb;
  u text;
begin
  select * into v_pkg from tracked_packages where ingest_key = p_key;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'unknown_key');
  end if;

  for e in select * from jsonb_array_elements(p_events) loop
    -- Cap distinct event names per product so a buggy client can't create unbounded rows.
    select count(distinct event) into v_names from analytics_daily where package_id = v_pkg.id;
    if v_names < 100 or exists (select 1 from analytics_daily where package_id = v_pkg.id and event = e->>'event') then
      insert into analytics_daily (package_id, owner_id, day, event, count)
      values (v_pkg.id, v_pkg.owner_id, p_day, e->>'event', (e->>'n')::bigint)
      on conflict (package_id, day, event) do update set count = analytics_daily.count + excluded.count;
    end if;
  end loop;

  for u in select jsonb_array_elements_text(p_users) loop
    insert into analytics_users (package_id, owner_id, anon_id, first_day, last_day, active_days)
    values (v_pkg.id, v_pkg.owner_id, u, p_day, p_day, 1)
    on conflict (package_id, anon_id) do update set
      active_days = analytics_users.active_days + case when analytics_users.last_day < excluded.last_day then 1 else 0 end,
      last_day    = greatest(analytics_users.last_day, excluded.last_day);
  end loop;

  update tracked_packages set last_event_at = now() where id = v_pkg.id;
  return jsonb_build_object('ok', true);
end $$;

-- Runs as the caller, so row level security scopes it to the signed-in owner.
create or replace function analytics_summary(p_package_id text, p_start date)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'active_users',    (select count(*) from analytics_users where package_id = p_package_id and last_day >= p_start),
    'returning_users', (select count(*) from analytics_users where package_id = p_package_id and last_day >= p_start and active_days >= 2),
    'opens',           coalesce((select sum(count) from analytics_daily where package_id = p_package_id and day >= p_start and event = 'open'), 0),
    'events',          coalesce((select sum(count) from analytics_daily where package_id = p_package_id and day >= p_start), 0),
    'top',             coalesce((select jsonb_agg(jsonb_build_object('event', event, 'n', n) order by n desc)
                                 from (select event, sum(count) as n from analytics_daily
                                       where package_id = p_package_id and day >= p_start
                                       group by event order by n desc limit 6) t), '[]'::jsonb)
  );
$$;

revoke all on function analytics_record(text, date, jsonb, jsonb) from public, anon, authenticated;
grant execute on function analytics_record(text, date, jsonb, jsonb) to service_role;
