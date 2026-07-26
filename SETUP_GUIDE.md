# Getting Started — Connect Everything and Run It

Step-by-step, in order. Do them in this order — later steps depend on earlier ones.

---

## 1. Prerequisites

- Node.js 18+ and npm installed (`node -v`, `npm -v` to check)
- A free Supabase account: https://supabase.com

---

## 2. Create the Supabase Project

1. Go to https://supabase.com/dashboard → **New Project**.
2. Pick an org, name it (e.g. `clinic-system`), set a database password (save it somewhere), pick a region close to you.
3. Wait ~2 minutes for provisioning.

---

## 3. Apply the Database Schema

1. In your new project, open **SQL Editor** (left sidebar).
2. Click **New query**.
3. Open `clinic_schema.sql` from this project, copy its entire contents, paste into the SQL Editor.
4. Click **Run**. You should see "Success. No rows returned."
5. Verify: go to **Table Editor** (left sidebar) — you should see all the tables (`users`, `patient_profiles`, `staff_profiles`, `document_requests`, `consultations`, `inventory`, etc.).

If this step fails, nothing else in this guide will work — fix the error before continuing (usually a typo if you hand-edited the SQL, or running it twice without dropping tables first).

---

## 4. Get Your API Credentials

1. In Supabase, go to **Settings** (gear icon) → **API**.
2. Copy two values:
   - **Project URL** (looks like `https://abcdefghijk.supabase.co`)
   - **anon / public** key (a long JWT string, under "Project API keys")

Keep this tab open — you'll paste these next.

---

## 5. Configure the App's Environment Variables

```bash
cd clinic-system-react
cp .env.example .env.local
```

Open `.env.local` and paste your real values:

```
VITE_SUPABASE_URL=https://abcdefghijk.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Save. `.env.local` is already gitignored (`*.local` rule) — never commit it.

---

## 6. Install Dependencies

```bash
npm install
```

---

## 7. Create Your First User (Admin)

The app needs **two** matching records for someone to log in: a Supabase Auth account (handles the password) and a `public.users` row (handles the role/profile). They're linked by matching email — do both, in this order.

### 7a. Create the Auth account

1. In Supabase: **Authentication** → **Users** → **Add user** → **Create new user**.
2. Enter an email (e.g. `admin@clinic.edu`) and a password. Check **Auto Confirm User** so you don't need to click an email link.
   - **Optional**: the Login page has dev-only quick-login buttons (visible only when running `npm run dev`, never in a production build) that can sign in as any of these three accounts with one click — but only if you set the matching `VITE_DEMO_*_EMAIL` / `VITE_DEMO_*_PASSWORD` pairs yourself in your own `.env.local` (see `.env.example`; nothing is hardcoded, so this is entirely opt-in per developer). Use the same password for all three seed accounts below if you want this to work, e.g. `DevPassword123!`.
3. Click **Create user**.

### 7b. Create the matching database row

1. Go to **SQL Editor** → **New query**. Run this (edit the email/name to match what you just created):

```sql
insert into users (username, email, role, name, phone, is_active, password_hash)
values ('admin', 'admin@clinic.edu', 'admin', 'System Administrator', '09171234567', true, 'MANAGED_BY_SUPABASE_AUTH')
returning user_id;
```

2. Note the `user_id` it returns — you don't need it for anything further right now, but it confirms the insert worked.

That's it for an admin — admins don't need a `staff_profiles` row (only `staff` role does, per the schema).

### 7c. (Optional) Create a staff and a patient account too

Repeat 7a with a different email for each, then:

```sql
-- Staff (after creating their Auth user)
insert into users (username, email, role, name, phone, is_active, password_hash)
values ('mreyes', 'staff@clinic.edu', 'staff', 'Maria Reyes, RN', '09181234567', true, 'MANAGED_BY_SUPABASE_AUTH')
returning user_id;  -- note this id, use it below

insert into staff_profiles (user_id, department, position)
values (<the_user_id_from_above>, 'Clinic', 'Nurse');

insert into staff_permissions (user_id, print_inventory, print_appointments, print_health)
values (<the_user_id_from_above>, true, false, true);

-- Patient (after creating their Auth user)
insert into users (username, email, role, name, phone, is_active, password_hash)
values ('jdelacruz', 'patient@school.edu', 'patient', 'Juan dela Cruz', '09201234567', true, 'MANAGED_BY_SUPABASE_AUTH')
returning user_id;  -- note this id, use it below

insert into patient_profiles (user_id, student_number, surname, given_name, course, year_level)
values (<the_user_id_from_above>, '2021-00123', 'dela Cruz', 'Juan', 'BS Nursing', '3rd Year');
```

---

## 8. Run the App

```bash
npm run dev
```

Open the URL it prints (usually `http://localhost:5173`).

---

## 9. Log In and Verify the Connection

1. You should land on `/login`.
2. Sign in with the admin email/password from step 7a.
3. You should land on `/dashboard` with real (mostly empty) data — no mock data anywhere.
4. Quick end-to-end check: go to **Inventory → ➕ Add Item**, add one item, save. Then check Supabase's **Table Editor → inventory** — your new row should be there. That confirms the full chain (React form → service layer → Supabase → back to the UI) is actually connected.

If login fails: double-check the email in `public.users` exactly matches the email of the Supabase Auth user (case-sensitive on some setups) — that's the #1 cause of "signed in but no profile loads."

---

## 10. Important: Row Level Security Is Not Yet Configured

Right now, anyone with your anon key (which ships in the browser bundle — that's normal and expected) can read/write every table directly, bypassing the app's UI and role checks entirely. This is fine for local development and demos. **Before this app touches real patient data, you need RLS policies on every table.** This wasn't built as part of this project — see `KNOWN_ISSUES.md` item #1 and `RECOMMENDATIONS.md` item #1 for what's needed. Ask me if you'd like help drafting the actual policy SQL.

---

## 11. Deploying

Once local dev works end-to-end (step 9 passed), see `DEPLOYMENT.md` for pushing this to Vercel or Netlify — same environment variables, same schema, just a different place for people other than you to reach it.

---

## Registering via QR Code (Phase Q)

In addition to typing in their details, a person can register by scanning
their student ID's QR code (**Register → Scan my ID**). This pre-fills
name, student number, and course, and — if the code matches a row in the
`registration_qr_codes` table — links it to the new account so **Scan ID**
also works at login afterward (see section 9's login flow).

**This app has no admin screen yet that creates rows in
`registration_qr_codes`.** Scanning a code that isn't in the table still
lets registration proceed (using whatever the QR itself encoded), it just
won't get the extra database-side validation/enrichment. To seed a row
manually for testing, run something like this in the SQL Editor after
applying migration `023_registration_qr_codes.sql`:

```sql
INSERT INTO registration_qr_codes (code, student_number, full_name, course, year_level)
VALUES ('2021-00123', '2021-00123', 'Juan dela Cruz', 'BS Computer Science', '1st Year');
```

Then encode `2021-00123` (or whatever `code` you used) as a QR code — any
online QR generator works — and scan that during registration.

If someone skips Academic Info during registration ("Skip for now"), they
can finish it later from **Profile → Edit**, which also shows a banner
prompting them to. The same Profile edit screen has a "School ID" field
for linking a code manually, for anyone who registered the normal way and
wants **Scan ID** to work for their account afterward.

---

| Symptom | Likely Cause |
|---|---|
| Blank page, console error about `import.meta.env` | `.env.local` missing or not filled in — restart `npm run dev` after editing it (Vite only reads env vars at server start) |
| "Failed to load X: ..." toast on every page | Wrong URL/anon key in `.env.local`, or schema wasn't applied (step 3) |
| Login succeeds but page is blank / stuck on spinner | Auth email doesn't match a `public.users` row (step 7b) — check for typos |
| A specific action fails (e.g. "Mark as Claimed") | Expected for a few actions — see `KNOWN_ISSUES.md`, some database CHECK constraints don't yet allow every status the UI offers |
| Everything works locally but 404s on refresh after deploying | SPA rewrite rule missing on your host — see `DEPLOYMENT.md` |
