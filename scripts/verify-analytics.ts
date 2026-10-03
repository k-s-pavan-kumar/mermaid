/**
 * End-to-end check of the SDK pipeline against a throw-away local DB:
 *   SDK (built dist) → POST /api/ingest (real route handler) → rollups → summary
 * Run:  npm run verify:analytics   (build the SDK first: cd sdk && npm run build)
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let failed = 0;
function ok(cond: boolean, label: string, extra = '') {
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}${cond ? '' : `  ${extra}`}`);
  if (!cond) failed++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  // The local store resolves its DB path from cwd at import time → chdir first.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'meridian-analytics-'));
  fs.mkdirSync(path.join(tmp, 'data'));
  const KEY = 'mk_verifykey_0123456789abcd';
  const emptyDb: Record<string, unknown[]> = {};
  for (const t of ['clients','projects','project_phases','quotes','invoices','bounty_submissions','project_metrics','milestones','notes','tasks','integrations','alert_states','meetings','settings','focus_sessions','targets_history','finance_entries','finance_categories','finance_category_rules','finance_obligations','bounty_cases','needs','courses','metric_snapshots','project_status_log','day_blocks']) emptyDb[t] = [];
  emptyDb.tracked_packages = [{ id: 'pkg_f', owner_id: 'me@x.com', name: 'Figma thing', platform: 'figma_plugin', ingest_key: KEY, last_event_at: null }];
  fs.writeFileSync(path.join(tmp, 'data', 'db.local.json'), JSON.stringify(emptyDb));
  process.chdir(tmp);
  process.env.DATA_PROVIDER = 'local';

  const { POST, OPTIONS } = await import('../src/app/api/ingest/route');
  const { getSummary, recordBatch } = await import('../src/features/release-stats/analytics/store');
  const core = await import('../src/features/release-stats/analytics/ingest-core');
  const sdk: any = await import('../sdk/dist/index.js');
  const pkg = { id: 'pkg_f', last_event_at: null as string | null };
  const refreshPkg = () => { const db = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'db.local.json'), 'utf8')); pkg.last_event_at = db.tracked_packages[0].last_event_at; };

  // Route the SDK's fetch straight into the route handler.
  const calls: { status: number }[] = [];
  let online = true;
  const routedFetch = async (url: string, init: RequestInit) => {
    if (!online) throw new Error('offline');
    const res = await POST(new Request(url, { ...init, headers: { ...(init.headers as Record<string, string>), 'x-forwarded-for': '203.0.113.9' } }));
    calls.push({ status: res.status });
    return res;
  };
  const mem = () => { const m = new Map<string, string>(); return { get: (k: string) => m.get(k) ?? null, set: (k: string, v: string) => { m.set(k, v); } }; };

  // 1 ── SDK → route → rollups
  const a = sdk.init({ key: KEY, endpoint: 'http://crm.test/api/ingest', storage: mem(), fetch: routedFetch, flushIntervalMs: 10 });
  a.track('export_clicked'); a.track('export_clicked'); a.track('template_created');
  await a.flush(); await sleep(30); await a.flush();
  refreshPkg();
  let s = await getSummary(pkg);
  ok(s.opens === 1, 'autoOpen sent exactly one "open"', JSON.stringify(s));
  ok(s.events === 4, 'all 4 events counted (open + 2 export + 1 template)', JSON.stringify(s));
  ok(s.active_users === 1, 'one anonymous user');
  ok(s.top_events[0]?.event === 'export_clicked' && s.top_events[0]?.n === 2, 'top event ranked by count');
  ok(!!pkg.last_event_at, 'last_event_at recorded on the product');

  // 2 ── a second device, same day → 2 users, nobody "returning" yet
  const b = sdk.init({ key: KEY, endpoint: 'http://crm.test/api/ingest', storage: mem(), fetch: routedFetch });
  await b.flush();
  s = await getSummary(pkg);
  ok(s.active_users === 2 && s.return_rate === 0, 'second device → 2 users, return rate 0%', JSON.stringify(s));

  // 3 ── returning user: same anon id seen on a later day (explicit clock)
  const ids = JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'db.local.json'), 'utf8')).analytics_users.map((u: any) => u.anon_id);
  const tomorrow = new Date(Date.now() + 86_400_000);
  await recordBatch(KEY, [{ event: 'open', anon_id: ids[0] }], tomorrow);
  s = await getSummary(pkg, tomorrow);
  ok(s.returning_users === 1 && s.return_rate === 50, 'user seen on 2 days → 50% return rate', JSON.stringify(s));
  await recordBatch(KEY, [{ event: 'open', anon_id: ids[0] }], tomorrow);
  s = await getSummary(pkg, tomorrow);
  ok(s.returning_users === 1, 'repeat events on the same day do not inflate returning users');
  const later = new Date(Date.now() + 40 * 86_400_000);
  s = await getSummary(pkg, later);
  ok(s.active_users === 0 && s.opens === 0, '30-day window drops old activity');

  // 4 ── security / validation
  const raw = (body: string, headers: Record<string, string> = {}) => POST(new Request('http://crm.test/api/ingest', { method: 'POST', body, headers }));
  let r = await raw(JSON.stringify({ key: 'mk_doesnotexist_0123456789', events: [{ event: 'open', anon_id: 'abcdefgh12' }] }));
  ok(r.status === 401, 'unknown key → 401');
  r = await raw('not json'); ok(r.status === 400, 'garbage body → 400');
  r = await raw(JSON.stringify({ key: KEY, events: [{ event: 'Bad Name!', anon_id: 'abcdefgh12' }] })); ok(r.status === 400, 'only-invalid events → 400');
  r = await raw(JSON.stringify({ key: KEY, events: [{ event: 'open', anon_id: 'abcdefgh12' }, { event: 'NOPE', anon_id: 'abcdefgh12' }] }));
  const j: any = await r.json(); ok(r.status === 202 && j.accepted === 1 && j.rejected === 1, 'mixed batch → 202, 1 accepted, 1 rejected', JSON.stringify(j));
  r = await raw(JSON.stringify({ key: KEY, events: Array.from({ length: 51 }, () => ({ event: 'open', anon_id: 'abcdefgh12' })) })); ok(r.status === 413, '51 events → 413');
  r = await raw('x'.repeat(core.MAX_BODY_BYTES + 1)); ok(r.status === 413, 'oversize body → 413');
  r = await raw(JSON.stringify({ key: KEY, events: [{ event: 'open', anon_id: 'abcdefgh12' }] }), { 'content-type': 'text/plain;charset=UTF-8' });
  ok(r.status === 202, 'text/plain body accepted (the no-preflight path the SDK uses)');
  ok(r.headers.get('access-control-allow-origin') === '*', 'POST response carries CORS header (Figma iframes have a null origin)');
  const pre = await OPTIONS(); ok(pre.status === 204 && pre.headers.get('access-control-allow-methods')?.includes('POST') === true, 'OPTIONS preflight answered');
  // props are never stored
  ok(!JSON.stringify(JSON.parse(fs.readFileSync(path.join(tmp, 'data', 'db.local.json'), 'utf8')).analytics_daily).includes('props'), 'no property data is persisted');

  // 5 ── rate limiting
  core._resetRateLimits();
  let limited = 0;
  for (let i = 0; i < 305; i++) { const x = await raw(JSON.stringify({ key: KEY, events: [{ event: 'open', anon_id: 'abcdefgh12' }] })); if (x.status === 429) limited++; }
  ok(limited >= 4, `per-key rate limit kicks in (${limited} of 305 limited)`);
  core._resetRateLimits();

  // 6 ── SDK resilience
  online = false;
  const c = sdk.init({ key: KEY, endpoint: 'http://crm.test/api/ingest', storage: mem(), fetch: routedFetch, autoOpen: false, flushIntervalMs: 10 });
  c.track('while_offline'); await sleep(20); await c.flush();
  const before = (await getSummary(pkg)).events;
  online = true; await sleep(50); await c.flush();
  const after = (await getSummary(pkg)).events;
  ok(after === before + 1, 'events queued while offline are delivered after reconnect', `before ${before} after ${after}`);

  const store = mem();
  const d = sdk.init({ key: KEY, endpoint: 'http://crm.test/api/ingest', storage: store, fetch: routedFetch, autoOpen: false });
  await d.optOut(); d.track('after_opt_out'); await d.flush();
  ok(!JSON.stringify(await getSummary(pkg)).includes('after_opt_out'), 'opt-out stops collection');

  const warn = console.warn; let warned = false; console.warn = () => { warned = true; };
  const e = sdk.init({ key: 'mk_wrongwrongwrong_0123', endpoint: 'http://crm.test/api/ingest', storage: mem(), fetch: routedFetch });
  await e.flush(); console.warn = warn;
  ok(warned, 'rotated/wrong key → SDK warns once and stops sending');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failed ? `\n${failed} check(s) FAILED` : '\nall analytics checks passed');
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
