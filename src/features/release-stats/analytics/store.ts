import { readDb, writeDb } from '@/lib/data/local-store';
import type { TrackedPackage } from '../types';
import { MAX_EVENT_NAMES_PER_PRODUCT, summarizeBatch, utcDay, type CleanEvent } from './ingest-core';

export interface AnalyticsSummary {
  /** Distinct anonymous users with any event in the window. */
  active_users: number;
  /** Of those, how many were active on 2+ different days. */
  returning_users: number;
  /** % (0-100, 1 dp) of active users who returned; null when nobody is active. */
  return_rate: number | null;
  /** 'open' events in the window. */
  opens: number;
  /** All events in the window. */
  events: number;
  top_events: { event: string; n: number }[];
  last_event_at: string | null;
}

export const EMPTY_SUMMARY: AnalyticsSummary = {
  active_users: 0, returning_users: 0, return_rate: null, opens: 0, events: 0, top_events: [], last_event_at: null,
};

const WINDOW_DAYS = 30;
const useSupabase = () => process.env.DATA_PROVIDER === 'supabase';
const windowStart = (now = new Date()): string => utcDay(new Date(now.getTime() - (WINDOW_DAYS - 1) * 86_400_000));
const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

// ───────────────────────── record ─────────────────────────

export type RecordResult = { ok: true } | { ok: false; reason: 'unknown_key' };

export async function recordBatch(key: string, events: CleanEvent[], now = new Date()): Promise<RecordResult> {
  const day = utcDay(now);
  const { counts, users } = summarizeBatch(events);

  if (useSupabase()) {
    const { createAdminClient } = await import('@/lib/supabase/admin');
    const { data, error } = await (createAdminClient() as any).rpc('analytics_record', {
      p_key: key, p_day: day, p_events: counts, p_users: users,
    });
    if (error) throw new Error(`analytics_record failed: ${error.message}`);
    return data?.ok ? { ok: true } : { ok: false, reason: 'unknown_key' };
  }

  // Local JSON store: one read, one write per batch.
  const db = readDb();
  const pkg = (db.tracked_packages as TrackedPackage[]).find((p) => p.ingest_key === key);
  if (!pkg) return { ok: false, reason: 'unknown_key' };

  const daily = (db.analytics_daily ??= []) as { package_id: string; day: string; event: string; count: number }[];
  const people = (db.analytics_users ??= []) as { package_id: string; anon_id: string; first_day: string; last_day: string; active_days: number }[];

  const known = new Set(daily.filter((d) => d.package_id === pkg.id).map((d) => d.event));
  for (const { event, n } of counts) {
    const row = daily.find((d) => d.package_id === pkg.id && d.day === day && d.event === event);
    if (row) row.count += n;
    else if (known.has(event) || known.size < MAX_EVENT_NAMES_PER_PRODUCT) { daily.push({ package_id: pkg.id, day, event, count: n }); known.add(event); }
  }
  for (const anon of users) {
    const u = people.find((x) => x.package_id === pkg.id && x.anon_id === anon);
    if (!u) people.push({ package_id: pkg.id, anon_id: anon, first_day: day, last_day: day, active_days: 1 });
    else if (u.last_day < day) { u.active_days++; u.last_day = day; }
  }
  // Keep the dev file bounded: rollups older than 120 days / users idle 180 days.
  const keepDaily = utcDay(new Date(now.getTime() - 120 * 86_400_000));
  const keepUsers = utcDay(new Date(now.getTime() - 180 * 86_400_000));
  db.analytics_daily = daily.filter((d) => d.day >= keepDaily);
  db.analytics_users = people.filter((u) => u.last_day >= keepUsers);
  pkg.last_event_at = now.toISOString();
  writeDb(db);
  return { ok: true };
}

// ───────────────────────── summary ─────────────────────────

export async function getSummary(pkg: Pick<TrackedPackage, 'id' | 'last_event_at'>, now = new Date()): Promise<AnalyticsSummary> {
  const start = windowStart(now);

  if (useSupabase()) {
    const { createClient } = await import('@/lib/supabase/server');
    const { data, error } = await ((await createClient()) as any).rpc('analytics_summary', { p_package_id: pkg.id, p_start: start });
    if (error) throw new Error(`analytics_summary failed: ${error.message}`);
    const active = Number(data?.active_users ?? 0), ret = Number(data?.returning_users ?? 0);
    return {
      active_users: active, returning_users: ret, return_rate: pct(ret, active),
      opens: Number(data?.opens ?? 0), events: Number(data?.events ?? 0),
      top_events: (data?.top ?? []).map((t: any) => ({ event: String(t.event), n: Number(t.n) })),
      last_event_at: pkg.last_event_at,
    };
  }

  const db = readDb();
  const daily = ((db.analytics_daily ?? []) as { package_id: string; day: string; event: string; count: number }[])
    .filter((d) => d.package_id === pkg.id && d.day >= start);
  const people = ((db.analytics_users ?? []) as { package_id: string; last_day: string; active_days: number }[])
    .filter((u) => u.package_id === pkg.id && u.last_day >= start);

  const byEvent = new Map<string, number>();
  for (const d of daily) byEvent.set(d.event, (byEvent.get(d.event) ?? 0) + d.count);
  const returning = people.filter((u) => u.active_days >= 2).length;
  return {
    active_users: people.length,
    returning_users: returning,
    return_rate: pct(returning, people.length),
    opens: byEvent.get('open') ?? 0,
    events: [...byEvent.values()].reduce((a, b) => a + b, 0),
    top_events: [...byEvent].map(([event, n]) => ({ event, n })).sort((a, b) => b.n - a.n).slice(0, 6),
    last_event_at: pkg.last_event_at,
  };
}
