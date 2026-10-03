/**
 * Pure helpers for the SDK ingest endpoint: body validation and a small
 * in-memory rate limiter. No I/O, so they are unit-testable on their own.
 *
 * What is collected is deliberately minimal: an event NAME and a random
 * anonymous id. No properties, IPs, user agents or timestamps from the
 * client are stored — counts are bucketed by the server's own UTC day.
 */
export const MAX_BODY_BYTES = 64 * 1024;
export const MAX_EVENTS_PER_BATCH = 50;
export const MAX_EVENT_NAMES_PER_PRODUCT = 100;

const EVENT_RE = /^[a-z][a-z0-9_.:-]{0,63}$/;
const ANON_RE = /^[A-Za-z0-9_-]{8,64}$/;
const KEY_RE = /^mk_[A-Za-z0-9_-]{16,64}$/;

export interface CleanEvent { event: string; anon_id: string }
export interface ParsedBatch {
  key: string;
  events: CleanEvent[];
  /** Events dropped for a bad name / id. Reported back to the SDK. */
  rejected: number;
}

export type ParseResult = { ok: true; batch: ParsedBatch } | { ok: false; status: number; error: string };

export function parseIngestBody(raw: string): ParseResult {
  if (raw.length > MAX_BODY_BYTES) return { ok: false, status: 413, error: 'payload too large' };
  let body: any;
  try { body = JSON.parse(raw); } catch { return { ok: false, status: 400, error: 'body must be JSON' }; }
  if (!body || typeof body !== 'object') return { ok: false, status: 400, error: 'body must be a JSON object' };

  const key = typeof body.key === 'string' ? body.key : '';
  if (!KEY_RE.test(key)) return { ok: false, status: 401, error: 'missing or malformed key' };
  if (!Array.isArray(body.events) || body.events.length === 0) return { ok: false, status: 400, error: 'events must be a non-empty array' };
  if (body.events.length > MAX_EVENTS_PER_BATCH) return { ok: false, status: 413, error: `max ${MAX_EVENTS_PER_BATCH} events per batch` };

  const events: CleanEvent[] = [];
  let rejected = 0;
  for (const e of body.events) {
    const event = typeof e?.event === 'string' ? e.event : '';
    const anon = typeof e?.anon_id === 'string' ? e.anon_id : '';
    if (EVENT_RE.test(event) && ANON_RE.test(anon)) events.push({ event, anon_id: anon });
    else rejected++;
  }
  if (events.length === 0) return { ok: false, status: 400, error: 'no valid events (names: a-z 0-9 _ . : -, start with a letter; anon_id 8-64 chars)' };
  return { ok: true, batch: { key, events, rejected } };
}

/** Collapse a batch into the two things we store: per-event counts and the
 *  distinct set of anonymous users seen. */
export function summarizeBatch(events: CleanEvent[]): { counts: { event: string; n: number }[]; users: string[] } {
  const counts = new Map<string, number>();
  const users = new Set<string>();
  for (const e of events) { counts.set(e.event, (counts.get(e.event) ?? 0) + 1); users.add(e.anon_id); }
  return { counts: [...counts].map(([event, n]) => ({ event, n })), users: [...users] };
}

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

// ── rate limiting ────────────────────────────────────────────────────────
// In-memory fixed window. Enough to stop a runaway client or a leaked key
// hammering one server instance; serverless deployments run many instances,
// so treat this as a safety net, not a quota.
const hits = new Map<string, { n: number; reset: number }>();

export function rateLimit(bucket: string, limit: number, windowMs: number, now = Date.now()): { ok: boolean; retryAfterSec: number } {
  const h = hits.get(bucket);
  if (!h || now >= h.reset) {
    hits.set(bucket, { n: 1, reset: now + windowMs });
    if (hits.size > 5000) for (const [k, v] of hits) if (now >= v.reset) hits.delete(k);
    return { ok: true, retryAfterSec: 0 };
  }
  h.n++;
  return h.n <= limit ? { ok: true, retryAfterSec: 0 } : { ok: false, retryAfterSec: Math.max(1, Math.ceil((h.reset - now) / 1000)) };
}
export function _resetRateLimits(): void { hits.clear(); }
