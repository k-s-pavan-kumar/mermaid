# Going to production

The app runs on a local JSON file by default. This is the checklist to move
it to a real database. Work top to bottom — each step depends on the last.

---

## 1. Create the Supabase project and run the schema

1. Create a project at supabase.com, note the region closest to you.
2. Open **SQL Editor** and paste the entire contents of `supabase/schema.sql`,
   then run it. It creates every table plus Row Level Security policies that
   scope all rows to `auth.uid()`.
3. Verify in **Table Editor** that you see: `clients`, `projects`,
   `project_phases`, `quotes`, `invoices`, `bounty_submissions`,
   `project_metrics`, `milestones`, `notes`, `tasks`, `integrations`,
   `alert_states`.

## 2. Wire the credentials

From **Project Settings → API**, copy into `.env`:

```
DATA_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://<your-project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>
```

The service role key bypasses RLS. Never expose it to the browser, never
commit it, and never prefix it with `NEXT_PUBLIC_`.

## 3. Generate real database types

The repo ships a placeholder `Database` type so it compiles before a project
exists. Replace it with the real one:

```bash
npx supabase login
SUPABASE_PROJECT_ID=<your-project-ref> npm run supabase:types
```

This rewrites `src/types/database.types.ts`. After that you can remove the
`as any` casts in `src/lib/data/supabase-store.ts` and get real type safety
on every query — worth doing, the casts exist only because the placeholder
type has no table shapes.

## 4. Replace the dev auth — do not skip this

`src/lib/auth/local-auth.ts` compares one email/password pair from env vars
in plain text. That is acceptable for a tool running only on your own
machine. It is **not** acceptable on a public URL.

Swap it for Supabase Auth before deploying anywhere reachable:

- `supabase.auth.signInWithPassword()` (or a magic link) in the login route
- Replace `getSessionEmail()` in `src/lib/auth/session.ts` with
  `supabase.auth.getUser()`, returning the user's `id`
- Then change `owner_id` values from an email string to the Supabase user
  UUID, which is what `schema.sql` already expects (`references auth.users(id)`)

Nothing in `src/features/*` needs to change — everything reads the owner id
through `getSessionEmail()`.

## 5. Decide what happens to the vault

`src/lib/vault/local-vault.ts` reads and writes `.md` files on the local
filesystem. **This does not work on Vercel or any serverless host** — the
filesystem is ephemeral and per-invocation. Options:

- **Keep Meridian local** for the Notes feature (simplest; the vault lives
  on the same machine as Obsidian anyway).
- **Run on a VPS/container with a persistent volume** mounted at `vault/`,
  and point Obsidian at that path via a synced folder (iCloud/Dropbox/Syncthing).
- **Move note bodies into Postgres** and generate `.md` on demand for export.
  This gives up live Obsidian editing, so only do it if you stop using Obsidian.

Until one of these is chosen, deploy with Notes disabled rather than
silently losing writes.

## 6. Upstash (optional, for integrations)

Only needed once you're refreshing external metrics often enough to hit rate
limits. Create a Redis database at console.upstash.com and set:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

Then cache provider responses in `src/features/integrations/actions.ts` —
GitHub allows 60 unauthenticated requests/hour per IP, which a few projects
will exhaust quickly. Also set `GITHUB_TOKEN` to raise that to 5,000/hour.

---

## Before you flip the switch

- [ ] `supabase/schema.sql` run, all 12 tables present
- [ ] `.env` set with `DATA_PROVIDER=supabase`
- [ ] Real types generated, `as any` casts removed
- [ ] Supabase Auth replacing local-auth
- [ ] `owner_id` migrated from email → user UUID
- [ ] Vault strategy chosen (see step 5)
- [ ] `npm run build` passes
- [ ] Create one client and one project through the UI and confirm the rows
      land in the Supabase table editor

**Honest status:** `supabase-store.ts` implements the same interface as the
local store and compiles cleanly, but it has not been run against a live
Supabase instance — there were no credentials available during development.
Expect to shake out one or two small issues on first connect (most likely
around `owner_id` types once you switch to real auth UUIDs). Test with
throwaway data first.
