# meridian-analytics

Tiny (~2 KB gzipped), zero-dependency, first-party analytics for things that ship inside someone else's app: **Figma plugins, Chrome extensions, Snapchat lenses (Camera Kit / Spectacles), web apps**. It sends anonymous event counts to your own Meridian CRM, which shows them under **Release Stats**.

Marketplaces don't give you this data: Figma exposes no plugin usage analytics, and the Chrome Web Store's publisher API is for managing items rather than reporting usage. So the numbers come from the SDK instead. "Opens" are labelled as opens — never as downloads.

## What is collected

| Sent | Not sent / not stored |
| --- | --- |
| an event **name** (`open`, `export_clicked`, …) | properties, text, file names, URLs |
| a random **anonymous id** (generated on first run, kept in the host's storage) | IP address, user agent, account or email |
| | client timestamps (the server buckets by its own UTC day) |

The server keeps only rollups: a per-day count per event name, and one row per anonymous id (first day, last day, number of active days). Raw events are never written down.

Tell users: say in your listing's privacy section that the product collects anonymous usage counts (the Chrome Web Store requires disclosing data collection). `analytics.optOut()` gives you a switch to put in your UI.

## Setup

1. In the CRM: **Release Stats → Track a product → Figma plugin / Chrome Web Store / Snapchat Lens / SaaS**, then **SDK setup** on the card. It creates a key, shows the endpoint, and updates live when your first event arrives.
2. Get the SDK into your project: `npm run build` here, then copy `dist/index.js` (or publish this folder to npm).
3. Paste the snippet from **SDK setup**.

The endpoint must be reachable from your users' machines — a CRM running on `localhost` only works for your own testing.

### Figma plugin
`manifest.json` needs the CRM's origin in `networkAccess.allowedDomains`. Call `initFigma()` in the main thread (it uses `figma.clientStorage` for the anonymous id). Call `await analytics.flush()` before `figma.closePlugin()` so the last events aren't lost. See `examples/figma/`.

### Chrome extension (MV3)
Add the `storage` permission and call `initChrome()` in the popup. In a service worker pass `autoOpen: false` — a worker waking up is not a user opening your extension. See `examples/chrome/`.

### Snapchat lenses
Only **Spectacles and Camera Kit** lenses can reach the network. A lens published to the Snapchat app cannot, so for those use Snap's own *Lens Insights* (My Lenses) and enter the numbers by hand in the CRM. For Camera Kit / Spectacles you can POST the same body the SDK sends (below), or pass your runtime's `fetch` to `init({ fetch })` — the latter is **untested inside Lens Studio**.

### Web apps / SaaS
`init({ key, endpoint })`, then `track('signup_completed')`.

## API

```ts
const analytics = init({ key, endpoint, storage?, autoOpen?: true, flushIntervalMs?: 5000, maxBatch?: 20, fetch?, debug? });

analytics.track('export_clicked'); // /^[a-z][a-z0-9_.:-]{0,63}$/
await analytics.flush();           // send now (call before a plugin/popup closes)
await analytics.optOut();          // stop + forget unsent events (persisted)
await analytics.optIn();
```

`track()` never throws and never blocks. Events are queued in the host's storage, batched, retried with backoff while offline or on 429/5xx, and dropped on a malformed-batch 4xx. A `401` (key rotated or wrong) makes the SDK warn once and stop for the session.

Reserved event: `open` — sent automatically on init; it feeds the **opens** number on the card.

## Wire format

```
POST <endpoint>
Content-Type: text/plain;charset=UTF-8     (a CORS "simple" request: no preflight; Figma iframes have origin "null")

{ "key": "mk_…", "events": [ { "event": "open", "anon_id": "<8–64 chars [A-Za-z0-9_-]>" } ] }

202 {"ok":true,"accepted":1,"rejected":0}   400 invalid · 401 unknown key · 413 too large (64 KB / 50 events) · 429 slow down
```

## What the CRM shows

- **Active users (30d)** — distinct anonymous ids with any event in the last 30 days
- **Opens (30d)** — count of `open` events (labelled *Plugin opens*, *Extension opens*, *Lens plays*, *Sessions*)
- **Return rate** — share of those users who were active on 2+ different days
- top event names, and when the last event arrived

Anonymous ids are per install, not per person: one person on two machines counts twice, and clearing storage creates a new id. Treat the numbers as usage trends, not exact headcounts.

## Tests

From the CRM root: `cd sdk && npm run build && cd .. && npm run verify:analytics` runs the SDK against the real ingest route (validation, CORS, rate limits, offline retry, opt-out, return-rate maths).
