# Deploying Meridian (Vercel + Supabase)

## 1. Database

**New Supabase project:** SQL Editor → paste all of `supabase/schema.sql` → Run.

**Already ran the old schema?** SQL Editor → paste `supabase/migrations/001_production_fixes.sql` → Run.
Then run `supabase/migrations/002_client_project_cost.sql` (renames the client
hourly `rate` column to `project_cost`). Then `supabase/migrations/003_task_logged_minutes.sql` (hours worked per task, and it credits
your past timer sessions to their tasks). Finally `supabase/migrations/004_monthly_retainer.sql` (monthly retainer clients and per-month
payment tracking). All four are safe to run more than once.
The first fixes: quotes/invoices being rejected when
raised against a client with no project, three tables that had no row-level
security, and adds `notes.content`.

## 2. Create your login (once)

Supabase → Authentication → Users → **Add user** (email + password, tick
"Auto Confirm"). Then Authentication → Sign In / Providers → turn **off**
"Allow new users to sign up" so nobody else can register on your URL.

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Name | Value |
|---|---|
| `DATA_PROVIDER` | `supabase` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | same page, `anon` key |
| `SUPABASE_SERVICE_ROLE_KEY` | same page, `service_role` key. **Secret.** Needed only for the public client portal. |
| `NEXT_PUBLIC_HOME_TZ` | e.g. `Asia/Kolkata` |
| `GROQ_API_KEY` | optional, for Meri |
| `GITHUB_TOKEN` | optional, raises GitHub rate limit |

Redeploy after changing variables.

## 4. Notes and the Obsidian vault

On Vercel there is no writable disk, so note bodies are stored in the
database (`notes.content`). "Sync vault" and Obsidian sync only work when you
run Meridian on your own machine. Project scaffolding (`code_root`) likewise
only works locally.

## 5. Smoke test after deploy

Log in → create a client → create a project → add a task on Today → create a
quote for that client with no project → add a note. Then open the client's
portal link in a private window.

## Debugging a 500

The browser only shows a digest. Vercel → your project → **Logs** → search the
digest (or filter Status 500) to see the real error message.
