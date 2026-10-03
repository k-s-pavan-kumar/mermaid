import { MAX_BODY_BYTES, parseIngestBody, rateLimit } from '@/features/release-stats/analytics/ingest-core';
import { recordBatch } from '@/features/release-stats/analytics/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// The SDK runs inside Figma plugin iframes (origin "null"), Chrome extension
// pages and arbitrary web apps, so CORS has to be open. That is safe here:
// the endpoint only accepts writes, and the credential is the ingest key.
// The SDK sends Content-Type: text/plain so browsers skip the preflight.
const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

function reply(status: number, body: Record<string, unknown> | null, extra: Record<string, string> = {}): Response {
  return new Response(body ? JSON.stringify(body) : null, {
    status,
    headers: { ...CORS, ...(body ? { 'Content-Type': 'application/json' } : {}), 'Cache-Control': 'no-store', ...extra },
  });
}

export async function OPTIONS(): Promise<Response> {
  return reply(204, null);
}

export async function POST(req: Request): Promise<Response> {
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'unknown';
  const ipLimit = rateLimit(`ip:${ip}`, 600, 60_000);
  if (!ipLimit.ok) return reply(429, { ok: false, error: 'rate limited' }, { 'Retry-After': String(ipLimit.retryAfterSec) });

  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) return reply(413, { ok: false, error: 'payload too large' });

  const parsed = parseIngestBody(await req.text());
  if (!parsed.ok) return reply(parsed.status, { ok: false, error: parsed.error });
  const { key, events, rejected } = parsed.batch;

  const keyLimit = rateLimit(`key:${key}`, 300, 60_000);
  if (!keyLimit.ok) return reply(429, { ok: false, error: 'rate limited' }, { 'Retry-After': String(keyLimit.retryAfterSec) });

  try {
    const res = await recordBatch(key, events);
    if (!res.ok) return reply(401, { ok: false, error: 'unknown key' });
  } catch (e) {
    console.error('[ingest] failed to record batch', e);
    return reply(500, { ok: false, error: 'could not record events' });
  }
  return reply(202, { ok: true, accepted: events.length, rejected });
}
