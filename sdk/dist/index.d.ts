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
export declare function memoryStorage(): StorageAdapter;
export declare function localStorageAdapter(): StorageAdapter;
/** chrome.storage.local — survives MV3 service-worker restarts. */
export declare function chromeStorageAdapter(): StorageAdapter;
/** figma.clientStorage — per-user, persists across plugin runs. */
export declare function figmaStorageAdapter(): StorageAdapter;
export declare class Analytics {
    private readonly o;
    private queue;
    private anonId;
    private optedOut;
    private disabled;
    private timer;
    private flushing;
    private failures;
    /** Every track()/optOut() chains onto this, so flush() always sees events recorded before it was called. */
    private tail;
    constructor(opts: AnalyticsOptions);
    /** Count an event. Names: lowercase letters, digits, _ . : - (start with a letter, ≤64 chars). */
    track(event: string): void;
    /** Send everything queued now. Resolves when the attempt finishes. */
    flush(opts?: {
        beacon?: boolean;
    }): Promise<void>;
    /** Stop collecting (persisted) and drop anything unsent. For a privacy toggle in your UI. */
    optOut(): Promise<void>;
    optIn(): Promise<void>;
    private load;
    private persist;
    private schedule;
    private log;
    private doFlush;
    private drop;
}
/** Generic: browsers, web apps, Camera Kit web, Node. */
export declare function init(opts: AnalyticsOptions): Analytics;
/** Figma plugin main thread. Needs "networkAccess.allowedDomains" in manifest.json. */
export declare function initFigma(opts: Omit<AnalyticsOptions, 'storage'> & {
    storage?: StorageAdapter;
}): Analytics;
/** Chrome extension. In an MV3 service worker pass autoOpen:false and call track('open') yourself when the user actually opens the popup. */
export declare function initChrome(opts: Omit<AnalyticsOptions, 'storage'> & {
    storage?: StorageAdapter;
}): Analytics;
