# nextjs-dev-browser

An ephemeral, localhost-only browser window that auto-opens when `next dev`
starts, and wipes its cache/cookies/storage the moment it's closed —
completely separate from your everyday browser profile.

- 🔒 **Localhost-only navigation** — the window can't browse away to
  arbitrary sites; your app's own API calls (Supabase, your backend, etc.)
  are unaffected.
- 🧹 **Ephemeral by design** — closing the window discards everything;
  nothing persists to disk.
- 🖥️ **Opens maximized**, fills the screen.
- 🔔 **Reopen-friendly** — if you close it by accident, a terminal banner
  and desktop notification tell you the exact command to bring it back.
- 🚫 **Never ships to production** — it's dev-only tooling; nothing here
  runs during `next build` / `next start`.

## Install

One command, from the root of any existing (or new) Next.js project:

```bash
npx nextjs-dev-browser init
```

This alone (no separate `npm install` needed — `init` handles it):

1. Adds `nextjs-dev-browser` to `devDependencies` if it isn't already there
2. Runs `npm install`, which also triggers a one-time Chromium download
   for Playwright via this package's own `postinstall` hook
3. Adds the required scripts to `package.json`:
   ```json
   {
     "scripts": {
       "dev": "dev-browser dev",
       "dev:plain": "next dev",
       "browser": "dev-browser open"
     }
   }
   ```
4. Flags any leftover hand-copied `scripts/*.js` files from an older,
   pre-package setup, and removes them if you re-run with `--remove-legacy`

`init` is safe to re-run any time — it only ever fills in what's missing
and never overwrites a script you've already customized (it prints what
it skipped so you can wire it in by hand if you want it).

## Usage

```bash
npm run dev        # starts `next dev`, opens the browser once the server is ready
npm run browser     # reopen the browser without restarting the dev server
npm run dev:plain   # plain `next dev`, no browser
```

Custom port:

```bash
PORT=5173 npm run dev
npm run browser -- 5173
```

## Why

Regular browser profiles accumulate cache, cookies, and storage across
everything you do — email, social media, other projects. Clearing it to
get a clean test of your app affects all of that. This gives every
project (or every branch, every teammate) a throwaway profile that's
guaranteed clean on every session, without touching your daily driver.

## How it works

Built on [Playwright](https://playwright.dev/). Each session uses a
non-persistent browser context (Playwright's default — no `userDataDir`),
so all state lives only for the life of the process. Navigation requests
are checked against an allowlist (`localhost`, `127.0.0.1`, `::1`) and
blocked otherwise; subresource requests (fetch/XHR/websocket) are never
blocked, so your app's calls to external APIs work normally.

## Requirements

- Node.js >= 18
- A machine with a display (this launches a real, visible browser window
  — it won't work in a headless-only environment like a bare SSH session
  or most CI runners without a virtual display)

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | Port `next dev` runs on / the browser points at |
| `SKIP_PLAYWRIGHT_INSTALL` | unset | Set to `1` to skip the Chromium download on install; set to `0` inside CI to force it despite `CI=true` |

## License

MIT
