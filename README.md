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

---

## This pass: per-project targets, streaks, weekly digest, custom categories, editable target history

### Per-project targets
Each project's **Settings** tab now has its own weekly/monthly focused-hours
target — "Acme should get 15h/week" — independent of the workspace-wide
targets. Stored as a `targets` jsonb column on `projects`. A project only
shows up in the Dashboard's new "Project targets" section once at least one
of its two numbers is above 0. The actual-hours side of the progress bar
reuses the exact same avoid-double-counting reconciliation the category
buckets use (a timer and the planned block it ran against count once), just
keyed by project id instead of category — see `sumProjectMinutes()` /
`DaySpend.projectMinutes` in `src/features/dashboard/queries.ts`.

### Streaks
A card at the top of the Dashboard: current consecutive active-day streak,
and the longest streak in the last 400 days. "Active" reuses the exact same
forgiving `moved` definition as everything else (a finished task, a focus
session, or a meeting). If today hasn't produced anything yet, the current
streak is still counted through yesterday rather than reading as broken —
the day isn't over. Bounded to a 400-day rolling window rather than an
account's entire history, since that cost grows forever for a number that
stops being meaningful past a year or so anyway. See `getStreaks()`.

### Weekly digest
No cron job was added — there's nowhere to run one in this deployment yet.
Instead, the weekly digest is the 7th rule in the existing derived-alerts
system (`src/features/notifications/queries.ts`), the same mechanism that
already flags overdue invoices and stalled projects. Once a week has fully
ended, an alert appears: *"Last week's digest (2026-09-07 – 2026-09-13):
Focused 4.5h of 25h target · 6/14 tasks · 6/7 active days"*, comparing
against whatever targets actually applied that week. It's keyed by the
week's start date, so dismissing it is permanent for that week and next
Monday's digest is automatically a fresh, undismissed alert. A week with
literally nothing in it and no target set is skipped rather than notifying
about an empty week.

### Custom categories
Settings → **Categories** lets you define buckets like "Deep work", "Admin",
"Learning" as an alternative to the Dashboard's default project-type
buckets. Tag any task with one from a small select on its card (Today board
or timebox block) — a tagged task always wins over its project's type in the
24-hour pie. A focus session without its own tag inherits its linked task's
tag before falling back to the project's type, so tagging a task once shapes
every session logged against it too. Categories are entirely optional:
define none, and every task buckets by project type exactly as before this
existed.

### Editable historical targets
Every save under Settings → Targets & goals is now a **new dated version**
rather than an edit in place — `targets_history`, one row per
`(owner_id, effective_from)`. "What was my target back in June" is
answerable because the Dashboard's week/month/year progress each look up
`pickTargets(history, periodStart)` using their own start date, not "whatever
the targets are today". Saving the same `effective_from` twice overwrites
just that date's version (fixing a typo doesn't spam the history); changing
the date always creates a new one. Settings shows the full version list with
a "current" badge on whichever one is actually in effect.

`WorkspaceSettings.targets` still exists as a convenience — a read-time
snapshot of "whatever applies today" — for anything that just wants the
current numbers (the "no targets set" banner, default currency) without
caring that targets are versioned at all.

### Verifying
`npm run verify:dashboard` now also covers: category tags overriding project
type (and a session's own tag overriding its linked task's), streak
current/longest math including the "today hasn't happened yet" edge case,
`pickTargets()` resolving the correct historical version (this caught a real
bug — it originally trusted the caller to have pre-sorted the history array,
which silently returned the wrong version when they hadn't; it now sorts
defensively), per-project progress and its double-counting avoidance, and
the weekly digest's underlying figures.

**Note on running the verify suite together**: each `verify:*` script
assumes it's starting from a freshly seeded `data/db.local.json`
(`npm run db:seed:local`) — none of them reset the database themselves, by
design, so you can inspect what a script left behind after it runs. Running
several back-to-back without reseeding between them will surface stale data
as spurious failures; that's the harness, not the app.

### Schema changes
`projects.targets`, `settings.categories`, `tasks.category`,
`focus_sessions.category`, and the new `targets_history` table — all
additive, with copy-paste `alter table` / `create table` statements in the
migration block at the top of `supabase/schema.sql`, plus three recommended
indexes (`tasks(owner_id, scheduled_date)`, `focus_sessions(owner_id, date)`,
`invoices(owner_id, paid_at) where status = 'paid'`) now that the Dashboard
scans a full financial year on every visit.

### A note on `local-store.ts`
While testing this pass I found that `table()` would throw if a table key
was simply absent from a hand-built `LocalDB` object — which every table
added after initial launch (`targets_history` included) will be, for anyone
running against an old `data/db.local.json` that predates it. `table()` now
treats a missing table as an empty one rather than crashing, matching how
every other addition in this app has been designed to degrade.

---

## This pass: five new features — Daily Finance, Bug Bounty Pipeline, Reward Vault, Learning Tracker, Release Stats

Built from five skill specs and their reference mockups. All five are reachable
from a new **Personal** group in the sidebar, and each gets exactly one compact
number on the Dashboard's **Elsewhere** strip at the very bottom — a glance and
a link, never the main event, per the brief that these shouldn't distract from
the Dashboard itself.

### Adaptations made to fit the existing app
A few of the specs assumed shapes that didn't quite match what Meridian
already has. Rather than force a fit or silently diverge, here's exactly what
changed and why:

- **`ProjectType` gained `freelance` and `institute`.** The Daily Finance spec
  wants income categorised by a `client | freelance | institute | internal |
  other` project type; Meridian's real `ProjectType` is a different, richer
  list. Extended it the same additive way every other type was added — nothing
  removed, nothing renamed.
- **`ProjectStatus` gained `dropped`.** The Reward Vault needs to tell
  "finished, unlocks a reward" apart from "abandoned, releases the reward"
  without overloading `done` for both. `momentum.ts` and the stalled-project
  alert were both updated to exclude it, same as `done`.
- **No separate `ProjectPayment` entity.** Meridian already has real invoicing
  (`Invoice`, with `status`, `amount`, `paid_at`) that does everything a
  ProjectPayment would — including several payments per project, since a
  project can have several invoices. Marking an invoice paid **is** the income
  event; see `markInvoicePaid()` in `src/features/billing/actions.ts`.
- **Bug Bounty Pipeline is a new, separate table (`bounty_cases`), not a
  rename of the existing `bounty_submissions`.** The app already had a
  lighter, project-nested bounty log (a bounty-type project's own
  "Submissions" tab). Rather than risk breaking that working feature with a
  wide rename, the richer standalone pipeline the skill describes — no
  project, full payout lifecycle — lives in its own table, reachable at
  `/bounty-pipeline`.
- **The mockup's "Locked" pill was dropped as a distinct state.** The Reward
  Vault's own state-machine diagram defines six states
  (`in_progress → cooling_off → ready → purchased`, plus `released`/
  `expired`) and no rule anywhere describes what triggers a seventh "locked"
  state — the reference mockup even uses it inconsistently between two rows
  in the same situation. `in_progress` is the one state for "linked, not yet
  earned," shown throughout with the mockup's amber "In progress" pill.
- **A project's "progress" is approximated, not stored.** Projects have no
  native progress percentage. The Reward Vault's progress bar for a
  project-linked need uses milestones-done/total when the project has
  milestones, falls back to tasks-done/total, and falls back again to a
  status-based estimate if neither exists.
- **Release Stats' external calls are real but untestable from this build
  sandbox.** The npm (`api.npmjs.org`), PyPI (`pypi.org`) and GitHub
  (`api.github.com`) calls in `syncOnePackage()` are genuine, keyless public
  API calls that will work once deployed with normal internet access — this
  sandbox's own outbound network allowlist doesn't include those domains, so
  I could not exercise them end-to-end here. Every branch degrades to "keep
  the last known snapshot, mark it stale" on any failure rather than
  throwing or showing a false zero — verified by seeding a never-synced
  package and confirming it renders the stale state correctly. Chrome Web
  Store has no public, keyless API, so those cards are manual-entry only.

### Daily Finance (`/daily-finance`)
The rule that matters: **there is no way to type in income.** The expense
form (`logExpense`) only ever writes `type: 'expense'`; every `type: 'income'`
row is written by `postIncomeEntry()`, called only from another feature's own
action — `markInvoicePaid()` in billing, or `moveToPaid()` in the Bug Bounty
Pipeline. Both posting paths are idempotent per source event (a unique index
on `linked_invoice_id`/`linked_bounty_id`/`linked_need_id` backs this in
Postgres; the local store checks the same thing in code) — marking the same
invoice paid twice, or a double-click, never double-posts.

### Bug Bounty Pipeline (`/bounty-pipeline`)
A four-column kanban (Submitted → Triaged → Accepted → Paid, plus a collapsed
Rejected/Duplicate list). The payout figure shown changes meaning as a card
moves right — your own estimate, then the program's confirmed number, then
the real paid amount — never blended into one generic "amount" field.
Reaching Paid posts exactly one Daily Finance income entry.

### Reward Vault (`/reward-vault`)
The state machine: a Need unlocks only when its linked project is **both**
`done` and has a paid invoice (or the documented `earned_override`
substitute, for non-invoiced work — always requires a note, always logged).
Unlocking starts a cooldown, never a purchase directly; the cooldown ending
makes it `ready`, with its own expiry; sitting unpurchased past that expiry
auto-releases it. A dropped project releases its Need immediately regardless
of progress. Reconciliation (`reconcileNeeds()`) runs lazily on every page
read rather than on a schedule — there's no cron in this deployment — which
the spec explicitly allows. `status`, `unlocked_at` and `purchased_at` are
written only by that reconciliation function and the dedicated
`markPurchased()` action; no form anywhere sets them directly. A toast fires
exactly once per transition via a `notify_pending` flag that's set during
reconciliation and cleared the instant the client shows it.

Also linkable to a **Learning Tracker** course, not just a project — a
completed course satisfies the same unlock rule.

### Learning Tracker (`/learning-tracker`)
Status and progress are always derived from `completed_lessons`/
`total_lessons`, never set directly — editing lesson counts can't leave
status out of sync with them. Can optionally link a newly added course to an
existing released/expired Reward Vault Need from the same form.

### Release Stats (`/release-stats`)
Real npm/PyPI/GitHub API calls behind a manual "Sync now" — see the
adaptations section above for what that means in this build. A "family" like
several npm sub-packages under one umbrella name shows as one rolled-up card
with per-package figures underneath, each syncing independently so one
package's failure doesn't affect its siblings.

### Verifying
`npm run verify:new-features` — 39 checks covering the Reward Vault's full
state-machine walk (unlock → cooldown → ready → purchased, plus expiry and a
dropped-project release), spend-cap and one-active-need-per-source
validation, Bug Bounty payout-meaning-per-column, Daily Finance posting
idempotency, and Learning Tracker status/progress derivation.

Like the rest of this suite, it tests the query/logic layer directly rather
than calling `'use server'` actions — those call `getSessionEmail()`
(`next/headers`' `cookies()`) and `revalidatePath()`, both of which only work
inside a real Next.js request and throw in a plain script. Where an action
did pure-DB-mutation work worth testing directly (`postIncomeEntry`,
`postRewardVaultExpense`), that logic was split into `insertIncomeEntry()` /
`insertRewardVaultExpense()` in `daily-finance/queries.ts`, with the action
now just calling the pure version and then `revalidatePath()` — the same
separation the rest of this codebase already uses between `queries.ts`
(logic) and `actions.ts` (the Next.js/session glue around it).

### Schema changes
Seven new tables — `project_status_log`, `finance_entries`, `bounty_cases`,
`needs`, `courses`, `tracked_packages`, `metric_snapshots` — plus
`projects.earned_override`, the extended `type`/`status` check constraints,
and `settings.reward_vault`. All additive; copy-paste statements are in the
migration block at the top of `supabase/schema.sql`, and RLS is enabled with
an owner-only policy on every new table.
