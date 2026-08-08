# Push Notifications — Setup & Verification Checklist

Follow this in order. Each step has a "how do I know it worked" check right under it — don't move to the next step until that check passes.

---

## Part 1 — Files in place

Confirm every one of these files exists at the exact path shown (all from earlier in this conversation):

| File | Where |
|---|---|
| `031_push_subscriptions.sql` | `supabase/migrations/` |
| `manifest.json` | `public/` |
| `sw.js` | `public/` |
| `pushNotifications.js` | `src/lib/` |
| `send-push/index.ts` | `supabase/functions/send-push/` |
| `notificationsService.js` | `src/services/` (replaced) |
| `index.html` | project root (replaced) |
| `ProfilePage.jsx` | `src/features/profile/` (replaced) |
| `legacy.css` | `src/styles/` (replaced) |
| `.env.example` | project root (replaced) |
| `.vscode/settings.json` | `.vscode/` |

**✅ Check:** `git status` should list all of these as new or modified files.

---

## Part 2 — Database migration

```bash
supabase db push
```

(Or paste `031_push_subscriptions.sql`'s contents into the Supabase SQL Editor and run it, if you're not using the CLI for migrations.)

**✅ Check:** In the Supabase dashboard → **Table Editor**, you should now see a `push_subscriptions` table — empty, but it should exist with columns `push_subscription_id`, `user_id`, `endpoint`, `p256dh`, `auth`, `user_agent`, `created_at`.

---

## Part 3 — Supabase secrets (server-side, Edge Function only)

```bash
supabase secrets set VAPID_PUBLIC_KEY=BCQ2UglfHGzG61ic1-R9Z_20msPz_-mAhc7DGHlxtthQptca09lXKt4bfb3Wm-5tj_O2sein3z1jaQCHZCBKcIY
supabase secrets set VAPID_PRIVATE_KEY=aZsO2GIcclvQpbOu93qUchEVYs4Ft_SMksXCVlAeyfM
supabase secrets set VAPID_SUBJECT=mailto:your-real-contact-email@example.com
```

Replace the email in `VAPID_SUBJECT` with a real one you'd want push services contacting if there's ever an abuse issue — don't leave it as a placeholder.

If you haven't already set these for your other functions (`create-user`, `send-sms`, etc.), `send-push` also needs:

```bash
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_ANON_KEY=your-anon-key
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**✅ Check:**
```bash
supabase secrets list
```
Should show `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` all present (values are hidden, but the names should be listed).

---

## Part 4 — Deploy the Edge Function

```bash
supabase functions deploy send-push
```

**✅ Check:** the command should end with something like `Deployed Function send-push`. You can also confirm in the Supabase dashboard → **Edge Functions** — `send-push` should appear in the list with a recent deploy timestamp.

---

## Part 5 — Frontend environment variable

Add this line to your **real** `.env.local` (not `.env.example` — that one's just the template):

```
VITE_VAPID_PUBLIC_KEY=BCQ2UglfHGzG61ic1-R9Z_20msPz_-mAhc7DGHlxtthQptca09lXKt4bfb3Wm-5tj_O2sein3z1jaQCHZCBKcIY
```

**And add the same variable in Vercel** (Vercel doesn't read `.env.local` — it's gitignored and never gets pushed): **Vercel dashboard → your project → Settings → Environment Variables** → add `VITE_VAPID_PUBLIC_KEY` with the same value → redeploy (or it'll apply on your next push).

**✅ Check:** locally, run `npm run dev`, open the browser console on any page, and type:
```js
import.meta.env.VITE_VAPID_PUBLIC_KEY
```
It should print the key, not `undefined`.

---

## Part 6 — Commit and deploy

Your normal workflow:

```bash
git checkout main
git pull origin main
git add .
git commit -m "add push notifications"
git push origin main
```

**✅ Check:** Vercel → Deployments shows a new one building, then goes green "Ready" (per your redeployment guide from earlier).

---

## Part 7 — The real end-to-end test

This is the part that actually proves everything works together. Do this on your **live Vercel URL**, not localhost.

### 7a. Confirm the service worker registered
1. Open the live site, open DevTools (`F12`) → **Application** tab → **Service Workers** (left sidebar)
2. You should see `sw.js` listed with status **"activated and is running"**

**If it's not there:** the browser hasn't tried to register it yet — that only happens the first time someone clicks the push toggle (see 7b), not on page load.

### 7b. Enable the toggle
1. Log in, go to **Profile → Push Notifications**
2. Click the toggle
3. A real browser permission popup should appear ("this site wants to send notifications")
4. Click **Allow**
5. The toggle should now show **"On for this device"**

**If it says "Not available on this device":** you're likely on iPhone/iPad in a regular Safari tab — see 7e below.

### 7c. Confirm the subscription actually saved
In Supabase → **Table Editor → `push_subscriptions`**, you should now see one new row, with `user_id` matching your account and a long `endpoint` URL.

**This is the single most important check** — if this row exists, the entire subscribe flow (browser → service worker → your database) worked correctly.

### 7d. Trigger a real notification and confirm it arrives
Do anything in the app that already calls `notify()` — for example, as a patient account, submit a document request (which notifies staff), or have staff acknowledge an emergency alert.

Then:
- **Close the browser tab entirely** (not just switch tabs — actually close it)
- Within a few seconds, a real OS-level notification should appear (Windows notification, macOS notification center, Android notification tray) — separate from anything happening inside the browser
- Clicking it should open/focus the site and navigate to the relevant page

**If the in-app bell notification appears but no push does:** check the Vercel function logs / Supabase Edge Function logs for `send-push` — the in-app notification always succeeds independently (by design), so this specifically means something's wrong on the push side, not that the whole feature is broken.

### 7e. iOS-specific test (if you have an iPhone available)
1. Open the live site in **Safari** (not Chrome — must be Safari to install)
2. Tap **Share → Add to Home Screen**
3. Open the app **from the new home screen icon**, not from Safari
4. Now repeat 7b–7d from inside that installed app

This is the one platform where skipping "install to home screen first" means the toggle will never work at all — that's an Apple restriction, not a bug in anything here.

---

## If something fails, where to look

| Symptom | Check |
|---|---|
| Toggle stuck on "Not available" (non-iOS) | Browser console for errors; confirm `VITE_VAPID_PUBLIC_KEY` is actually set in Vercel |
| Permission popup never appears | Check if notifications are already blocked for the site in browser settings (address bar → site info icon) |
| Toggle turns on, but no row in `push_subscriptions` | Check browser console at the moment you clicked — likely an insert error, possibly RLS-related |
| Row exists, but no notification ever arrives | Supabase Edge Function logs for `send-push` — look for the actual error message it returns |
| Everything above passes once, works, then quietly stops later | Normal — subscriptions can go stale (browser data cleared, etc.); `send-push` cleans these up automatically, the user just needs to re-enable the toggle |