# Deployment

This is a static SPA (Vite build output in `dist/`) that talks directly to Supabase from the browser — there's no server component to deploy. Any static host works; instructions below cover Vercel and Netlify since config files for both are already in the repo.

## Before Deploying

1. Apply the schema: for a **brand-new empty project**, run `supabase/clinic_schema_v2_consolidated.sql` alone (schema + all migrations + RLS, all in one). For an **existing project already running `clinic_schema.sql`**, apply migrations `001` through `015` from `supabase/migrations/`, in numeric order (the consolidated file has no backfill logic for existing data, the migrations do). **If you're already running this project and seeing registration or profile-edit save failures, migration 006 alone is the one to re-run** — it's an idempotent repair of exactly those policies, safe to run even if you're not sure what's already applied. **Migrations 007 through 015 together add the normalized Medicine/Batch/Supplier/Receiving structure, improved movement tracking, the 8-state status system, batch QR codes, and the two dashboard aggregation functions** (with Archive support and supplier delete-protection) **that the Inventory page now actively reads and writes** — apply all nine before using Inventory after this update, or Medicine-category data will be missing entirely (Supply/Equipment are unaffected either way). **Migration 012 also fixes a real bug**: removing a Supply/Equipment item with any prior movement history would previously fail outright (a foreign-key violation) — if you're on an older copy of this schema, apply 012 before relying on the Remove action for those categories.

**New dependency** (Phase 9): this update adds the `qrcode` npm package (batch QR generation) — run `npm install` after pulling. Phase 10 adds no new npm dependencies (`chart.js` was already installed and used by Consultation's analytics). **Phase 11 adds `jspdf`, `jspdf-autotable`, and `xlsx`** (PDF/Excel report export) — run `npm install` after pulling. No new migration in Phase 11 — it's a pure application-layer addition on top of existing tables/columns. **Migration 016** (Phase 12 final review) fixes another instance of the same FK bug class Phase 7 found — `consultation_medications.inventory_id` could block deleting a Supply/Equipment item — plus three missing indexes found during a full FK audit.

**Known dependency vulnerability**: `xlsx` (SheetJS) has two published advisories (prototype pollution, ReDoS) with no fix currently available on the npm registry. Both are in the *parsing* code path (reading untrusted spreadsheet files) — this app only ever *writes* Excel files from data it already trusts (its own Supabase queries), never parses uploaded ones, so the practical exposure is low. Documented here for transparency, not silently ignored — reassess if a future feature ever adds spreadsheet *import*.
2. **Check your project's email confirmation setting** (Dashboard → Authentication → Providers → Email → "Confirm email"). Self-registration works either way, but behaves differently — see `KNOWN_ISSUES.md`'s Phase K notes.
3. That schema/migrations enable Row Level Security with role-scoped policies on every table — verify them against your real project before trusting it with real data (see the "A Note on RLS Testing" section in `KNOWN_ISSUES.md`). **Note in particular**: `emergency_alerts`, `notifications`, and `search_patients_public` intentionally accept anonymous (unauthenticated) access for the login-screen SOS button — see `KNOWN_ISSUES.md`'s "Pre-Login Emergency SOS Button" section before a real production launch.
4. Seed at least one admin account: insert a row into `users` (role `'admin'`) and create a matching Supabase Auth user (Dashboard → Authentication → Add User) with the same email.
5. **Deploy the `create-user` Edge Function** so Maintenance's "Add User" can provision real logins (optional but recommended — without it, Add User still works but only creates the database rows, not a working login):
   ```bash
   npm install -g supabase   # if you don't have the CLI
   supabase login
   supabase link --project-ref your-project-ref
   supabase functions deploy create-user
   ```
   Then set the secrets it needs (Dashboard → Edge Functions → create-user → Secrets, or via CLI):
   ```bash
   supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key   # Settings → API → service_role — never put this in .env.local or any client code
   supabase secrets set SUPABASE_ANON_KEY=your-anon-key
   ```
   Also confirm your project's email templates/SMTP are configured (Dashboard → Authentication → Email Templates) if you want the default `invite` mode to actually deliver emails — otherwise pass `mode: 'password'` from the client instead (see `usersService.provisionUser()`).
6. **Deploy the `chat-completion` Edge Function** so the chatbot's AI mode works (optional — without it, or without a Groq API key, the chatbot automatically falls back to the built-in rule-based engine, no broken experience either way):
   ```bash
   supabase functions deploy chat-completion
   supabase secrets set GROQ_API_KEY=your_groq_api_key   # free key at https://console.groq.com
   ```
7. Have your Supabase project URL and anon key ready (Dashboard → Settings → API).

## Vercel

```bash
npm install -g vercel   # if you don't have it
vercel login
vercel                  # first deploy, follow prompts (framework: Vite)
vercel --prod            # subsequent production deploys
```

Or via the Vercel dashboard: **New Project → Import this repo**. Vercel auto-detects Vite (`npm run build`, output `dist`). `vercel.json` in the repo root already configures the SPA rewrite (`/* → /index.html`) so client-side routes don't 404 on refresh, plus long-lived caching for hashed asset files.

**Environment variables** (Project Settings → Environment Variables):
```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```
Set for all environments (Production/Preview/Development) you plan to use. Redeploy after adding them — Vite bakes `VITE_*` vars in at build time, not runtime.

## Netlify

```bash
npm install -g netlify-cli   # if you don't have it
netlify login
netlify init                  # links this repo to a Netlify site
netlify deploy --prod
```

Or via the Netlify dashboard: **Add new site → Import an existing project**. `netlify.toml` in the repo root already sets the build command (`npm run build`), publish directory (`dist`), the SPA redirect rule, and asset caching.

**Environment variables** (Site configuration → Environment variables): same two `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` as above.

## Any Other Static Host

```bash
npm run build
# upload the contents of dist/ to your host
```

The only host-specific requirement is the SPA rewrite rule (send every path to `index.html` so React Router can handle it client-side) — check your host's docs for how to configure that if it's not Vercel/Netlify.

## Post-Deploy Smoke Test

Since this environment can't reach a live Supabase project, run this manually against your deployed URL:

1. `/login` loads and looks correct (fonts, styling).
2. Sign in with a seeded account → redirected to `/dashboard`.
3. Navigate to each nav item for your role — confirm no blank pages or console errors.
4. Try creating one record in each major module (a document request, an inventory item) and confirm it appears in Supabase's Table Editor.
5. Log out → confirm redirect to `/login` and that protected routes are no longer reachable.
6. Hard-refresh on a non-root route (e.g. `/inventory`) — confirm it loads correctly instead of 404ing (proves the SPA rewrite rule is active).

## Expiration Check Automation (pg_cron)

Migration 018 attempts to enable the `pg_cron` extension and schedule `run_expiration_check()` daily at 06:00 UTC. `pg_cron` availability depends on your Supabase plan/project settings — the migration is written to skip scheduling gracefully (via exception handling) rather than fail outright if the extension isn't available on your project.

To confirm whether it's actually running: **Dashboard → Database → Extensions** (check `pg_cron` is enabled) and **Database → Cron Jobs**, or run `SELECT * FROM cron.job;` in the SQL editor — you should see a job named `inventory-expiration-check`. If it's not there, either enable `pg_cron` from the Extensions page and re-run the `DO $$ ... $$` block from migration 018, or don't worry about it — the system still works correctly without it, since the same check also runs on every Inventory page load; you just lose the "stays current even if nobody opens the app that day" property.
