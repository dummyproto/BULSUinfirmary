# Clinic Services System (React + Supabase)

A React/Vite rewrite of a vanilla-JS clinic management prototype, backed by Supabase (Postgres + Auth). Migrated in phases from a localStorage-based prototype to a fully Supabase-connected application — see `KNOWN_ISSUES.md` for the current state of schema-vs-UI gaps found along the way.

## Stack

- **React 19** + **Vite** (path aliases: `@`, `@components`, `@features`, `@layouts`, `@context`, `@hooks`, `@services`, `@lib`, `@routes`, `@styles`)
- **React Router v6** — route-level code splitting via `React.lazy`
- **Supabase** (`@supabase/supabase-js`) — Postgres + Auth, no ORM
- **Groq (Llama 3.3 70B)** — powers MediBot's AI replies via the `chat-completion` Edge Function; falls back to a built-in rule-based engine automatically if no `GROQ_API_KEY` is configured — see `KNOWN_ISSUES.md`
- **Chart.js** (Consultation analytics), **jsQR** (Inventory QR scanning) — both lazy-loaded with their pages
- Plain CSS (`src/styles/legacy.css`) — ported design system, no CSS framework

## Getting Started

```bash
npm install
cp .env.example .env.local   # fill in your Supabase project URL + anon key
npm run dev                  # http://localhost:5173
```

Apply `clinic_schema.sql` to your Supabase project if you haven't already, then apply migrations `001` through `018` from `supabase/migrations/`, in numeric order — they close every schema-vs-UI gap found during the React migration, add Row Level Security to every table, add the QR-login lookup function, enable self-registration, enable the pre-login Emergency SOS button, add persistent chatbot conversation storage, repair/re-affirm the registration and profile-edit RLS policies, add the normalized Medicine/Batch/Supplier structure, add Archive Batch support, tighten supplier delete-protection, add Receiving Records, improve inventory movement tracking, expand inventory status to 8 automatically-derived states, add per-batch QR code generation/scanning, add server-side aggregation functions for the Inventory Dashboard, and add the full inventory notification/alert system (dedicated notification table, automatic low-stock/expiration/event alerts, and a daily `pg_cron`-scheduled expiration check where available). See `KNOWN_ISSUES.md` for what's still open after that.

**Starting a brand new, empty Supabase project instead?** Run `supabase/clinic_schema_v2_consolidated.sql` alone — it's `clinic_schema.sql` + the migration merged into one file with RLS already included, so there's nothing else to apply. Don't run it against a project that already has `clinic_schema.sql` applied with real data — it has no backfill logic, unlike the migration.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start the dev server with HMR |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | ESLint (flat config, `eslint.config.js`) |

## Environment Variables

Set in `.env.local` (never committed — see `.gitignore`'s `*.local` rule):

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Both are safe to expose in client code **once Row Level Security is enabled on every table** — see `KNOWN_ISSUES.md`.

**Never add `SUPABASE_SERVICE_ROLE_KEY` here or anywhere prefixed `VITE_`** — Vite bakes every `VITE_*` variable directly into the shipped JS bundle, so it would be readable by anyone visiting the site. The service-role key only ever belongs in the `create-user` Edge Function's secrets (see `DEPLOYMENT.md`), set via `supabase secrets set`, never in this app's `.env` files.

## Project Structure

See `PROJECT_STRUCTURE.md` for the full annotated tree.

## Deployment

See `DEPLOYMENT.md`.
