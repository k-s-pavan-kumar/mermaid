# Meridian — starter scaffold

## Run it locally (no Supabase/Upstash account needed yet)

```bash
npm install
cp .env.example .env     # set SESSION_SECRET / LOCAL_AUTH_EMAIL / LOCAL_AUTH_PASSWORD
npm run db:seed:local    # resets data/db.local.json to empty
npm run dev
```

Visit http://localhost:3000/login, sign in with the credentials from `.env`,
then use Clients/Projects/Today from the UI.

**A note on testing Server Actions:** the create/update/delete forms
(`createClient`, `createProject`, `addInvoice`, etc.) are React Server
Actions. They only work correctly through a real browser or `fetch` from
one — Next.js's action-dispatch protocol (an action-id handshake) isn't
something `curl` can reliably fake in dev mode. `npm run verify:logic` is a
separate, non-HTTP smoke test that exercises the actual business logic
(inserts, the project-detail joins, earnings math, cascade delete) directly
against `local-store.ts` — run it any time to sanity-check that layer
without needing a browser:

```bash
npm run verify:logic
```

## Why a local file first

`DATA_PROVIDER=local` (the default — see `.env.example`) points every
feature query at `src/lib/data/local-store.ts`, a small file-backed store
exposing an async `table()` interface (`all/find/where/insert/update/remove`,
each returning a `Promise`) — async even for local file reads, specifically
so `src/lib/data/supabase-store.ts` can implement the exact same interface
against real Postgres. That means:

- You can build and click through every feature today with zero cloud setup.
- The schema in `supabase/schema.sql` is already the target shape — the
  local JSON file's collections match its tables one-to-one.
- Moving to Supabase later means running `supabase/schema.sql` against a
  real project and flipping `DATA_PROVIDER=supabase` in `.env` —
  `src/lib/data/supabase-store.ts` already implements the same `table()`
  interface against Postgres. It hasn't been tested against a live
  Supabase project (no credentials were available to test with while
  building this), so verify it against a real project before depending
  on it — feature code in `src/features/*` doesn't change either way.

The one thing to know: the local store writes to disk, so it only works in
a long-running `next dev`/`next start` process, not on serverless/edge. That's
fine for local testing and becomes moot once you're on Supabase.

## Modular layout

```
src/
  app/            — routes only; each page pulls from src/features/*
    login/, api/auth/    — local session-cookie auth
    today/               — brain dump + drag-to-schedule timebox
    clients/             — list, add, edit
    projects/            — list, filter by type, create; [id] — full detail
    notes/               — vault-folder list + preview pane
  components/
    AppNav.tsx      — shared nav, shown only when logged in
  features/
    today/          — types.ts, queries.ts, actions.ts, components/
    clients/        — types.ts, queries.ts, actions.ts, components/
    projects/       — types.ts, queries.ts, actions.ts (phases, quotes,
                      invoices, bounty submissions, milestones, metrics)
    notes/          — types.ts, queries.ts, actions.ts (writes real .md
                      files via lib/vault, not just DB rows)
    integrations/   — types.ts, registry.ts, actions.ts, providers/
                      (github.ts, pypi.ts, npm.ts) — pluggable, see below
    billing/        — types.ts, actions.ts (quotes, invoices, mark-paid);
                      read side stays in projects/queries.ts since a
                      project's billing is always read as part of its detail
  lib/
    auth/           — local session cookie + credential check (dev-only)
    data/           — the swappable local/Supabase data layer
    vault/          — writes/reads real .md files to vault/ at project root
    supabase/       — browser + server Supabase clients (ready, not wired to UI yet)
scripts/
  verify-logic.ts               — smoke test for clients/projects data layer
  verify-notes-integrations.ts  — smoke test for vault writing + real
                                   PyPI/npm API calls
```

Each folder under `src/features/` is self-contained: its own types, its own
query functions, its own server actions, its own components. Adding a new
area of the product means adding a new folder here, not touching existing
ones.

## Connecting other tools

`integrations` (table in `supabase/schema.sql`, folder in
`src/features/integrations/`) is the pluggable pattern for anything
external. Each provider in `src/features/integrations/providers/` is one
function: `(config) => Promise<FetchedMetric[]>`. `registry.ts` maps a
provider key to that function; `refreshIntegration()` calls it and writes
the results into `project_metrics` — no schema change needed to add the
next one. GitHub, PyPI, and npm are wired and tested against real APIs
today. Adding Chrome Web Store, HackerOne, or YouTube next means one new
file in `providers/`, one line in `registry.ts`, one line in
`PROVIDER_LABEL`/`PROVIDER_CONFIG_FIELD` in `types.ts`.

## The vault (Obsidian sync)

Notes created through `/notes` are written as real `.md` files to `vault/`
at the project root (frontmatter + body + `[[wikilinks]]` to any linked
project/client), not just database rows — `src/lib/vault/local-vault.ts`
does the writing. Point Obsidian at that folder (File → Open Vault) and its
graph view renders the links on its own; Meridian never draws the graph
itself. The `notes` table is metadata only (title, path, tags) so Meridian
can list/search without owning the file content.

## Next steps

1. Add more integration providers (`src/features/integrations/providers/`)
   — Chrome Web Store, HackerOne, YouTube, App Store — following the same
   shape as `github.ts`/`pypi.ts`/`npm.ts`. GitHub's public API is rate
   limited per IP (60/hr unauthenticated) — set `GITHUB_TOKEN` in `.env`
   once you're using it for real, or you'll hit 403s under normal use.
2. Data layer and visual design are both done for now — `table()` is async
   and has two working implementations (`local-store.ts`, `supabase-store.ts`),
   and `globals.css` matches the approved mockup's palette/type. What's left
   there is polish, not architecture: richer layouts, more of the mockup's
   card treatments ported over page by page.
3. When ready to go live: create the Supabase project, run
   `supabase/schema.sql` against it, set `DATA_PROVIDER=supabase` in `.env`,
   swap local auth for Supabase Auth, and set up Upstash Redis for metrics
   caching + rate limiting. `supabase-store.ts` is implemented against the
   same interface local-store.ts uses, but hasn't been tested against a real
   Supabase project — there were no credentials available to test with here.
   Test it against a real project before relying on it.

## Recent changes (this pass)

**Today is a real day view now.** `Today` is still scoped to one day, but a
day with nothing on it no longer hides a backlog:

- A **month calendar** (`Calendar` button in the day nav) marks every day
  that carries scheduled work — red for past days with open tasks, green
  for days you cleared. Click any day to jump there. It opens by itself
  when something is overdue.
- The overdue banner gained **Move all to today**, so clearing a backlog
  isn't one click per task.
- "Today" is computed in the **home timezone** (`src/lib/tz/today.ts`,
  `NEXT_PUBLIC_HOME_TZ`, default `Asia/Kolkata`) instead of UTC. The old
  `toISOString().slice(0,10)` reported yesterday between midnight and
  5:30am IST — the Today board opened on the wrong day and tasks captured
  in that window were filed under the previous date. Overdue notification
  rules use the same boundary.

**Projects**

- Types are **multi-select**: a project can be Open Source *and* a Web App.
  `type` stays as the primary (first selection) so existing reads and the
  Postgres index are untouched; the full set lives in `types`. Filters
  match any type, and the billing/submissions tabs appear if *any* type
  calls for them.
- New **Open Source** type.
- **Phases are editable after creation** — colour, label, width, order —
  with the preview bar updating live as you change them, plus delete.
- **Delete** from the project list as well as from the project's own
  Settings tab. Deleting cascades to phases, quotes, invoices, milestones,
  metrics and submissions, but **detaches tasks instead of destroying
  them**, so completed work doesn't vanish from Today's history.
- New **Settings** tab for editing name, types, client link and description.
- The client dropdown reads `— Not billed to a client —` and explains
  itself: it links the project to a row in *Clients* for timezone and
  billing, and is unrelated to the type. "No client (internal)" conflated
  the two, which is why internal/open-source projects looked like they
  needed a client.

**Every button reports what it's doing.** `SubmitButton` (form submits,
via `useFormStatus`) and `ActionButton` (onClick server actions) disable
themselves, show a spinner and a verb — "Saving…", "Deleting…" — so no
action looks like a dead click, and nothing can be double-fired.

### Migrating an existing Supabase database

`supabase/schema.sql` now has a `types text[]` column and `opensource` in
the type constraint. The migration statements for an existing database are
in the comment at the top of that file.

## This pass: Meri, money, and the client workspace

### Look and feel
The palette now comes from the Meri sticker set — violet primary, bubblegum,
lagoon teal, starfish gold, deep-sea navy ink. Surfaces stay light and
paper-like on purpose: the saturated colours carry state and accent, not
backgrounds, so an eight-hour session doesn't become a purple wall. The
sticker sheet is sliced into `public/mascot/*.png` and used where a blank
screen would otherwise just be blank — empty brain dump, empty day, overdue
banner, focus timer, assistant.

### Meri, the assistant (⌘J)
A dock on the right that can *do* things, not just talk. It calls any
OpenAI-compatible chat-completions endpoint (Groq by default) with tools
wired to the same server actions the UI uses:

- `get_day_summary` — "what does today look like"
- `create_task`, `create_project`, `create_client`, `schedule_meeting`
- `create_billing_doc` — "invoice SRRD Labs for 8 Figma sessions at ₹1,500"
- `list_projects`, `list_clients`, `list_billing`

Set `GROQ_API_KEY` in `.env` to switch it on; without it, the panel says so
and everything else works unchanged. The key is read server-side only, the
tool loop is capped at five turns, tools always run as the logged-in owner
(never an id the model supplies), and anything it creates is a **draft** you
edit — there is no separate AI write path that could drift from the UI's.

### Billing, quotations and PDFs
`/billing` is a real billing surface:

- **Line items** — "22.5 hours × ₹2,000", "8 sessions × ₹1,500" — with a live
  total, plus tax %, notes and issue/due dates.
- **Income streams** (freelance, teaching, product, bounty) so the dashboard
  answers whether teaching is pulling its weight against client work, which
  one lumped earnings figure never could.
- Documents can hang off a **project or a client directly** — teaching income
  has a payer but usually no project, and inventing a dummy one is how
  invoices end up in a spreadsheet instead.
- **Numbers generate themselves** per prefix per year (INV-2026-001), derived
  from what's stored rather than a counter, so deleting a document can't
  desync it.
- **Quote → invoice in one click**, carrying every line across.
- **PDF export with no PDF library**: the document is laid out in print CSS,
  so the browser's own Save-as-PDF gives a clean, selectable, A4-paginated
  file. No server renderer, no font packaging, and "print and post it" works.

Fill in Settings → Billing profile once (letterhead, GSTIN, payment details,
default tax) and it appears on every document.

### Clients are workspaces now
`/clients/[id]` replaced the old edit form with tabs: **Overview, Work,
Meetings, Billing, Notes, Share, Details**. Everything about one client in
one place — their projects, the open tasks across those projects, meetings
with agenda/minutes/follow-up (and one click to turn a follow-up into a real
task), their invoices and quotes, their notes.

- **Work types are multi-select** (web, mobile, design, security, teaching,
  consulting, maintenance, content) — the single dropdown was wrong within a
  month of any real relationship.
- An **agreed rate** per client pre-fills invoice lines.
- **Share link** (`/portal/<token>`): a read-only page the client can open
  with no account, showing their projects, upcoming meetings and issued
  invoices. The token *is* the credential, so it's long, rotatable (rotating
  is the revoke button) and the page exposes no action at all — there is
  nothing for a leaked link to change. This is deliberately not client
  logins; real accounts need an auth provider, and a read-only link covers
  most of what clients actually ask for.

### Week calendar
`/calendar` is the week view from your reference: day columns, hour rows,
coloured blocks. Tasks and meetings share the grid, so client calls and focus
blocks compete for the same visible space. Drag anything from the
**Unscheduled** rail onto a slot to schedule it; click a block to tick it off.
Today still answers "what now"; this answers "is Thursday already full before
I promise a call".

### Clock widgets
The strip is configurable in Settings: add any zone, label it (a city or a
client's name), reorder it, pick the home base. Zones outside 9am–7pm local
are dimmed and a `+1d` marker shows when they've already rolled over — the
two things you actually want to know before pinging someone.

### Scaffold a project on disk
Project → Settings → **Scaffold on disk** creates the folder and a runnable
skeleton (Next.js + TS, Node CLI, Python, or static). Two rules are enforced
rather than trusted: it only ever writes inside the **code root** you set in
Settings (blank code root disables the feature entirely — there is no
"current directory" default, because a path bug in that design overwrites
whatever you were standing in), and it refuses any folder that already has
files in it. It needs a real writable disk, so it works under `next dev` on
your machine and not on a serverless host.

### Migrating an existing Supabase database
`supabase/schema.sql` gained `meetings` and `settings` tables, new client
columns (`phone`, `address`, `work_types`, `rate`, `status`, `portal_token`)
and reworked `quotes`/`invoices` (`owner_id`, nullable `project_id`,
`client_id`, `stream`, `items` jsonb, `tax_pct`, `notes`). On `local` it's
automatic. On Supabase, apply those as `alter table` statements before
switching over.

## This pass: skills, momentum, and a 24-hour day

### Fixes first
- **The day grid is 24 hours** (00:00 → 23:00), not 8am–9pm. Anything scheduled
  early or late used to be invisible on the grid even though it existed. Night
  hours are dimmed, and the grid opens scrolled to your first block (or the
  current hour) so a full day doesn't cost a scroll.
- **Today's Next/Prev buttons work.** They parsed the date as local midnight
  then formatted with `toISOString()`, which is UTC — so in IST "tomorrow"
  came back as today and the button did nothing. All day arithmetic is UTC-based now.
- **Mascot art re-cut**: each sprite is now isolated to its largest connected
  shape (no stray fragments from the neighbouring sticker) and padded to a
  square, and a global `img { max-width:100%; height:auto }` stops any fixed
  width/height pair from squashing one.
- **Login page redesigned** with the mascot, the brand, and what the app is
  actually for on a split screen.

### Skills — an extensible AI toolbox
`src/features/assistant/skills/` is a folder of self-contained skills.
Adding one is: drop a file, export it, add a line to `index.ts`. Every
surface renders its own buttons from the registry, so a new skill appears in
the UI without touching a single page.

Shipped today:

| Skill | What you get | Lands as |
|---|---|---|
| Project & handover document | 17 sections: architecture, annotated folder structure, stack table with *why*, data model, ADR-style decisions, ops runbook, handover checklist | a note + `.md` in the vault |
| API endpoint reference | Every route/action: auth, params, responses, errors, curl | note |
| Write an SOP | Messy description → a checklist you can follow on a bad day | note |
| Break it into 15-minute steps | One scary task → 5–12 startable steps | **real tasks in your brain dump** |
| Why am I stuck here? | One blocker, one next action, one thing to cut | answer in place |
| Book / chapter plan | Chapter map + session-by-session word targets + stall insurance | note |
| Weekly review | What moved, what stalled, three commitments | note |
| Shut down the day | Finished / carry over / drop / open this first | answer in place |
| Draft a client update | Status email from the real record | answer in place |
| Prep the next meeting | Agenda from open work and last minutes | answer in place |

Long documents are generated **section by section**, not in one call. That
isn't an optimisation: a single completion can't produce twenty pages before
hitting the output ceiling, and quality collapses well before the limit. Each
section call carries the project's real record plus the outline and the
headings already written, so the parts agree without the model holding the
whole document at once. A handover doc is ~17 calls and takes a minute or two.

Everything lands through the same tables the UI writes to — a generated
document is an ordinary note you can edit, rename or delete, and generated
steps are ordinary tasks.

### For the start-everything, finish-nothing problem
- **One thing.** Pin exactly one task per day, above everything else. Not a
  priority field — one. Twelve "important" tasks is the same as no list when
  deciding what to open is itself the hard part. Tapping it again clears it.
- **Momentum, not scores.** A day counts as *moved* if anything was
  completed, any focus block ran, or any meeting happened. Streaks that break
  on one quiet day punish exactly the person this is for.
- **Focus timer that records what it was for.** Name the thing before
  starting, and stopping early still logs the minutes you did — half a
  session recorded beats a whole session lost.
- **Stalled projects surface themselves** on Today after 14 quiet days, with
  a link straight to "Why am I stuck here?". Shelving one on purpose counts
  as a decision; you just can't make it about something you've stopped seeing.

### Month view with real day-by-day data
`/calendar?view=month` colours each day by what actually happened — completed
tasks, focus minutes and meetings together. Focus minutes count as much as
ticked boxes on purpose: a day deep in one hard problem shows nothing on a
checklist, and rendering that as an empty day is how you end up believing you
did nothing all week. Click any day to open that week.

### Scaffolding, with your dev browser
Project creation can now create the folder in the same step (checkbox on the
new-project form, once a code root is set in Settings) — "I decided to build
this" and "the repo exists" being two separate acts is where a project stalls
before it starts.

Next.js scaffolds can wire in your **nextjs-dev-browser** package: scripts
become `dev` → `dev-browser dev`, `dev:plain` → `next dev`, `browser` →
`dev-browser open`, with a README section explaining it. The package is
vendored at `vendor/nextjs-dev-browser` and Meridian itself now uses it — run
`npm install` and `npm run dev` opens the ephemeral localhost browser
(`npm run dev:plain` if you'd rather it didn't). If you publish it to npm,
change the devDependency from the `file:` path to a version range.

### New tables
`focus_sessions` (local store and `supabase/schema.sql`), plus `focus_date`
on tasks for the one-thing pick.

---

## This pass: Dashboard, targets, and a half-hour grid

### The logout button showed a UUID
Not a display bug so much as two different ideas sharing one function.
`getSessionEmail()` returns an *owner id* — under `DATA_PROVIDER=supabase`
that is the Auth user's UUID, which is exactly what `owner_id` columns and
RLS's `auth.uid()` compare against. Correct for queries, wrong to show a
person.

There is now a separate `getSessionDisplayName()` in `src/lib/auth/session.ts`
used **only** for the label in the sidebar and `AppNav`. It returns the Auth
user's email under Supabase (falling back through `user_metadata.email`,
`full_name`, then phone, since an OAuth- or phone-only identity legitimately
has no email) and the login email under local. Nothing else changed: making
`getSessionEmail()` itself return an email would have silently broken every
`owner_id` comparison and your row-level security policies.

### Half-hour timebox
The Today grid is 48 half-hour slots instead of 24 hourly rows. Every slot is
its own drop target, so 9:30 is as easy to hit as 9:00, and dragging a block's
bottom edge resizes in 30-minute steps with a live `1h 30m` read-out. An hour
still reads as the same 46px band it always did — the `:30` divider is drawn
lighter so the finer grid doesn't make the day harder to scan. Blocks show
their own time range, and a 30-minute block collapses to a single line rather
than clipping.

This is **additive at the schema level**, which is the important part: two new
nullable columns, `tasks.scheduled_minute` (0 or 30) and
`tasks.duration_minutes` (30-minute steps). A null minute means `:00` and a
null `duration_minutes` falls back to `duration_hours * 60` — which is
precisely how every row written under the old whole-hour model already
behaves, so nothing needs backfilling and existing blocks land exactly where
they always did. `duration_hours` is still written (rounded up) alongside
`duration_minutes` so older readers and the original whole-hour CHECK
constraint keep working.

All reads go through `src/features/today/time.ts` — `startMinutes()`,
`durationMinutes()`, `fmtRange()` — so no call site has to know which of the
two shapes a given row is in. The week calendar keeps hourly *cells* (seven
columns of half-hour rows is unreadable) but offsets and sizes blocks by their
real minutes, and dropping on the bottom half of a cell gives you `:30`.

### Dashboard
A new `/dashboard`, paired with Today through a switch in the topbar
(`g d`, and a sidebar entry). Login still lands on Today; the Dashboard is the
step back you take when you want it.

- **Financial year** — paid vs. your goal, with a pace notch showing where
  you'd be if the year earned evenly. Honours a non-January financial year
  (`fiscal_year_start_month`, defaulting to April), because getting that wrong
  silently mis-scopes every "this year so far" figure. Only money actually
  **paid** counts; invoiced-but-unpaid sits beside it, never folded in.
- **Week and month targets** — focused hours, tasks completed, active days,
  revenue, each with the same pace notch.
- **Where the 24 hours go** — a donut over today, an average day this week, or
  an average day this month.
- **Month by month** — twelve stacked bars on one shared scale, so a longer bar
  really is a busier month, plus a per-day strip for the current month.

Charts are plain SVG in `src/features/dashboard/components/Charts.tsx`. No
charting library was added: a donut is an arc and a stacked bar is a row of
spans, and a dependency to draw two shapes is a poor trade.

#### How the 24-hour split is counted
The one genuinely tricky decision. A block on the timebox and a focus session
against that same project are usually the *same* hour of your life recorded
twice — once as an intention, once as an outcome. So per category:

```
minutes = focus minutes + max(0, planned block minutes − focus minutes)
```

A timer that ran counts as itself; a planned block contributes only whatever
it claimed *beyond* what the timer already covered. Meetings are counted
separately because they are genuinely additional time. If overlapping records
somehow claim more than 24 hours, they are scaled back proportionally rather
than producing a pie that sums to more than a day. Whatever is left becomes
**unaccounted** rather than being quietly dropped — a day where you tracked
three hours should look like a day where you tracked three hours.

Nothing here asks you to log anything new. Every figure is derived from focus
sessions, scheduled blocks, meetings and invoices the rest of the app already
writes.

### Targets
Set in **Settings → Targets & goals**, stored in the existing `settings` jsonb
row (so adding a target is never a migration). Every number defaults to `0`,
meaning "not tracking this" — that target simply disappears from the Dashboard
instead of showing a meaningless 0-of-0 bar. A fresh install therefore shows
the real picture of where time and money went without inventing goals you
never set.

### Verifying
`npm run verify:dashboard` covers the pieces that are easy to get quietly
wrong: that old whole-hour rows still land in the same place, that resizes
snap and clamp correctly, that a focus session and its timebox block are not
double-counted, that every day sums to exactly 24 hours, and that financial
years, leap Februaries and `paid_at`-dated revenue all behave.

### Schema changes
`tasks.scheduled_minute`, `tasks.duration_minutes`, `settings.targets` — all
additive, with copy-paste `alter table` statements in the migration block at
the top of `supabase/schema.sql`.
