/**
 * meridian-analytics — anonymous, first-party event counting.
 *
 * Collected: an event NAME and a random anonymous id, nothing else. No
 * properties, no IP/UA storage on the server, no cross-product identity.
 * Everything you send shows up in your Meridian CRM under Release Stats.
 *
 * Works in: Figma plugins (main thread or UI), Chrome extensions (MV3 service
 * worker / popup / content script), Camera Kit & Spectacles lenses, and any
 * browser or Node app. Zero dependencies.
 */

export interface StorageAdapter {
  get(key: string): Promise<string | null> | string | null;
  set(key: string, value: string): Promise<void> | void;
}

export interface AnalyticsOptions {
  /** Ingest key from Release Stats → SDK setup. Public & write-only. */
  key: string;
  /** Full ingest URL, e.g. https://crm.example.com/api/ingest */
  endpoint: string;
  /** Where the anonymous id + unsent queue live. Defaults to localStorage, else memory. */
  storage?: StorageAdapter;
  /** Send an 'open' event on init (plugin launched / popup opened / lens played). Default true. */
  autoOpen?: boolean;
  /** Max wait before a batch is sent. Default 5000 ms. */
  flushIntervalMs?: number;
  /** Events per request (server max is 50). Default 20. */
  maxBatch?: number;
  /** Override fetch (tests, or runtimes with their own). */
  fetch?: typeof fetch;
  /** Log what's happening to the console. */
  debug?: boolean;
}

const VERSION = '0.1.0';
const ID_KEY = 'meridian_anon_id';
const QUEUE_KEY = 'meridian_queue';
const OPTOUT_KEY = 'meridian_opt_out';
const MAX_QUEUE = 200;
const EVENT_RE = /^[a-z][a-z0-9_.:-]{0,63}$/;

interface QueuedEvent { event: string; anon_id: string }

// ───────────────────────── storage adapters ─────────────────────────

export function memoryStorage(): StorageAdapter {
  const m = new Map<string, string>();
  return { get: (k) => m.get(k) ?? null, set: (k, v) => { m.set(k, v); } };
}

export function localStorageAdapter(): StorageAdapter {
  return {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* quota / blocked */ } },
  };
}

/** chrome.storage.local — survives MV3 service-worker restarts. */
export function chromeStorageAdapter(): StorageAdapter {
  const area = (globalThis as any).chrome?.storage?.local;
  if (!area) throw new Error('meridian-analytics: chrome.storage.local is unavailable (add the "storage" permission)');
  return {
    get: async (k) => { const r = await area.get(k); return (r?.[k] as string | undefined) ?? null; },
    set: async (k, v) => { await area.set({ [k]: v }); },
  };
}

/** figma.clientStorage — per-user, persists across plugin runs. */
export function figmaStorageAdapter(): StorageAdapter {
  const cs = (globalThis as any).figma?.clientStorage;
  if (!cs) throw new Error('meridian-analytics: figma.clientStorage is unavailable here — call this from the plugin main thread');
  return {
    get: async (k) => { const v = await cs.getAsync(k); return typeof v === 'string' ? v : null; },
    set: async (k, v) => { await cs.setAsync(k, v); },
  };
}

function defaultStorage(): StorageAdapter {
  try { if (typeof localStorage !== 'undefined') { localStorage.getItem('x'); return localStorageAdapter(); } } catch { /* fall through */ }
  return memoryStorage();
}

// ───────────────────────── client ─────────────────────────

function randomId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/-/g, '');
  if (c?.getRandomValues) { const b = new Uint8Array(16); c.getRandomValues(b); return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(''); }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

export class Analytics {
  private readonly o: Required<Pick<AnalyticsOptions, 'key' | 'endpoint' | 'flushIntervalMs' | 'maxBatch' | 'debug'>> & { storage: StorageAdapter; fetchImpl: typeof fetch | undefined };
  private queue: QueuedEvent[] = [];
  private anonId: string | null = null;
  private optedOut = false;
  private disabled = false;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private flushing: Promise<void> | null = null;
  private failures = 0;
  /** Every track()/optOut() chains onto this, so flush() always sees events recorded before it was called. */
  private tail: Promise<void>;

  constructor(opts: AnalyticsOptions) {
    if (!opts.key || !opts.endpoint) throw new Error('meridian-analytics: `key` and `endpoint` are required');
    this.o = {
      key: opts.key, endpoint: opts.endpoint,
      flushIntervalMs: opts.flushIntervalMs ?? 5000,
      maxBatch: Math.min(opts.maxBatch ?? 20, 50),
      debug: !!opts.debug,
      storage: opts.storage ?? defaultStorage(),
      fetchImpl: opts.fetch,
    };
    this.tail = this.load().then(() => { if (opts.autoOpen === false && this.queue.length) this.schedule(); });
    if (opts.autoOpen !== false) this.track('open');
    // Browser pages: send what's left when the tab/popup is hidden.
    const doc = (globalThis as any).document;
    if (doc?.addEventListener) doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'hidden') void this.flush({ beacon: true }); });
  }

  /** Count an event. Names: lowercase letters, digits, _ . : - (start with a letter, ≤64 chars). */
  track(event: string): void {
    if (!EVENT_RE.test(event)) { this.log(`ignored invalid event name "${event}"`); return; }
    this.tail = this.tail.then(async () => {
      if (this.optedOut || this.disabled || !this.anonId) return;
      this.queue.push({ event, anon_id: this.anonId });
      if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
      await this.persist();
      if (this.queue.length >= this.o.maxBatch) void this.flush(); else this.schedule();
    }).catch(() => { /* analytics must never throw into the host app */ });
  }

  /** Send everything queued now. Resolves when the attempt finishes. */
  async flush(opts: { beacon?: boolean } = {}): Promise<void> {
    await this.tail;
    if (this.flushing) return this.flushing;
    this.flushing = this.doFlush(!!opts.beacon).finally(() => { this.flushing = null; });
    return this.flushing;
  }

  /** Stop collecting (persisted) and drop anything unsent. For a privacy toggle in your UI. */
  async optOut(): Promise<void> {
    await this.tail; // let the initial load finish first, or it would overwrite this flag
    this.optedOut = true; this.queue = [];
    await this.o.storage.set(OPTOUT_KEY, '1'); await this.persist();
  }
  async optIn(): Promise<void> { await this.tail; this.optedOut = false; await this.o.storage.set(OPTOUT_KEY, '0'); }

  // ── internals ──
  private async load(): Promise<void> {
    const s = this.o.storage;
    this.optedOut = (await s.get(OPTOUT_KEY)) === '1';
    let id = await s.get(ID_KEY);
    if (!id || id.length < 8) { id = randomId(); await s.set(ID_KEY, id); }
    this.anonId = id;
    try { const q = JSON.parse((await s.get(QUEUE_KEY)) ?? '[]'); if (Array.isArray(q)) this.queue = q.slice(-MAX_QUEUE); } catch { this.queue = []; }
  }
  private async persist(): Promise<void> { try { await this.o.storage.set(QUEUE_KEY, JSON.stringify(this.queue)); } catch { /* best effort */ } }
  private schedule(): void {
    if (this.timer) return;
    const wait = Math.min(this.o.flushIntervalMs * Math.pow(2, this.failures), 5 * 60_000);
    this.timer = setTimeout(() => { this.timer = undefined; void this.flush(); }, wait);
  }
  private log(m: string): void { if (this.o.debug) console.log(`[meridian-analytics] ${m}`); }

  private async doFlush(beacon: boolean): Promise<void> {
    if (this.disabled || this.optedOut || this.queue.length === 0) return;
    const batch = this.queue.slice(0, this.o.maxBatch);
    const body = JSON.stringify({ key: this.o.key, sdk: `meridian-analytics/${VERSION}`, events: batch });

    if (beacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      // text/plain keeps this a CORS "simple" request — no preflight on page unload.
      if (navigator.sendBeacon(this.o.endpoint, new Blob([body], { type: 'text/plain' }))) { await this.drop(batch.length); return; }
    }
    const f = this.o.fetchImpl ?? (globalThis as any).fetch;
    if (!f) { this.log('no fetch available — events stay queued'); return; }
    try {
      const res: Response = await f(this.o.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body });
      if (res.status >= 200 && res.status < 300) { this.failures = 0; await this.drop(batch.length); this.log(`sent ${batch.length}`); if (this.queue.length) this.schedule(); return; }
      if (res.status === 401) { this.disabled = true; this.queue = []; await this.persist(); console.warn('[meridian-analytics] ingest key rejected (rotated or wrong) — analytics disabled for this session'); return; }
      if (res.status === 429 || res.status >= 500) throw new Error(`server said ${res.status}`);
      // other 4xx: the batch is malformed — retrying can't help, so drop it
      this.log(`dropped batch (HTTP ${res.status})`); await this.drop(batch.length);
    } catch (e) {
      this.failures = Math.min(this.failures + 1, 6);
      this.log(`send failed, will retry: ${e instanceof Error ? e.message : e}`);
      this.schedule();
    }
  }
  private async drop(n: number): Promise<void> { this.queue.splice(0, n); await this.persist(); }
}

// ───────────────────────── helpers per platform ─────────────────────────

/** Generic: browsers, web apps, Camera Kit web, Node. */
export function init(opts: AnalyticsOptions): Analytics { return new Analytics(opts); }

/** Figma plugin main thread. Needs "networkAccess.allowedDomains" in manifest.json. */
export function initFigma(opts: Omit<AnalyticsOptions, 'storage'> & { storage?: StorageAdapter }): Analytics {
  return new Analytics({ ...opts, storage: opts.storage ?? figmaStorageAdapter() });
}

/** Chrome extension. In an MV3 service worker pass autoOpen:false and call track('open') yourself when the user actually opens the popup. */
export function initChrome(opts: Omit<AnalyticsOptions, 'storage'> & { storage?: StorageAdapter }): Analytics {
  return new Analytics({ ...opts, storage: opts.storage ?? chromeStorageAdapter() });
}
