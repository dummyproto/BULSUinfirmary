# Known Issues

Updated after the **Phase A migration** (`supabase/migrations/001_phase_a_schema_and_rls.sql`), which closed most of what was previously listed here. See that file for the full SQL. Remaining open items below.

## ✅ Resolved by the Phase A Migration

- Row Level Security now exists on every table (role-scoped: patients see only their own records, staff/admin see everything clinical, admin-only for user management).
- `auth.uid()` ↔ `public.users.user_id` bridge added (`users.auth_user_id`), auto-linked on first login — RLS policies and the app itself now identify "who is the caller" reliably instead of matching by email only.
- `document_requests.status` now allows `'Claimed'`.
- `consultations` now has real `diagnosis` and `follow_up_notes` columns, and `visit_type` now allows `'Emergency'`. (Old string-encoded rows are backfilled by the migration.)
- `inventory_logs.action_type` now allows every real action the UI produces, and a real `consultation_id` FK links deduction logs back to the consultation that caused them. (Old encoded rows are backfilled.)
- `emergency_alerts.sms_sent` is now a real column instead of a derived join.
- `patient_profiles` now has separate `father_*`/`mother_*` columns plus `guardian_address` and `parent_phone_2` — the Profile page's Father/Mother sections persist for real now instead of being session-only.

## ✅ Resolved by Phase B

- **Live camera QR scanning now works.** The Scan tab's "Start Camera" button requests `getUserMedia`, polls frames every 250ms, and decodes with `jsQR` — ported directly from the legacy `startCamera()`/`captureFrame()` functions. Falls back gracefully with a clear message on permission-denied or no-camera-found.

## ✅ Resolved by Phase C

- **Standalone Appointments page built.** This is genuinely new functionality — the original app never had a booking UI, only dashboard widgets reading from the `appointments` table. The new `/appointments` page (all 3 roles) lets patients book/view/cancel their own appointments and lets staff/admin manage everyone's (confirm/complete/cancel/delete), with date-range and status filtering. Full CRUD against `appointmentsService`, notifications fire on booking and status changes, and it reuses the existing `ApptDetailModal` from the dashboards for consistency.

## ✅ Resolved by Phase D

- **New user creation now provisions a real login.** `supabase/functions/create-user/` is a Supabase Edge Function that verifies the caller is an admin (via their own JWT, subject to the same RLS as everything else), then uses the service-role key — server-side only, never shipped to the browser — to either invite the new user by email (default) or set a temporary password. Maintenance's "Add User" calls it automatically and falls back to profile-only creation with a clear warning if the function isn't deployed yet, so the flow doesn't hard-break during initial setup. **I could not deploy or test this function in this environment** — see the deployment steps in `DEPLOYMENT.md` and verify it end-to-end before relying on it.

## ✅ Resolved by Phase F

- **Inventory's Batches tab is now a real, working feature.** It existed in the original `.js` but its own tab bar silently redirected away from it — never actually reachable. Now built for real: full batch listing (excluding expired batches from view, same as the original), Add Batch (existing item or create-new-inline), per-batch Replenish/Release, and a global "Release Batch" search-and-release picker. Every action keeps the parent `inventory` row's aggregate quantity in sync, same as the original's `doAddBatch`/`doReplenishBatch`/`doReleaseSingleBatch` logic.

## ✅ Resolved by Phase G

- **Maintenance's Email Configuration tab is now real.** Unlike Batches, this one *was* technically reachable in the original code — it just had no save function at all, only a read-only display saying "contact IT support for changes." Since resurrecting a decorative dead-end seemed against the point of the request, it's genuinely editable now: admins can update SMTP host/port/user, from name, and toggle notifications, all persisted to the real `email_config` table. Flagging clearly: **this only stores settings for the app to reference — it does not send a test email or verify SMTP credentials actually work.** Wiring a real email provider would need its own Edge Function, same category of work as the SMS-sending in Emergency Alerts (which is also simulated, not real).

## ✅ Resolved by Phase I

- **The patient SOS/Emergency button now works end-to-end.** Previously a placeholder toast. Now: confirm dialog → full report form (emergency type, reporter details prefilled from the real session, searchable "affected person" picker for reporting on someone else's behalf, grouped campus-location picker, description) → writes a real `emergency_alerts` row → notifies both `staff` and `admin` roles → logs an audit entry → plays a synthesized siren (Web Audio API, no audio file, ported from the original's oscillator-based `EmergencySound.playSiren`) → success confirmation. The heavier report-form modal is lazy-loaded so it doesn't bloat every page's bundle just because the SOS button exists in the global Topbar.

## ✅ Resolved by Phase J — with an important security redesign

- **QR/barcode login now works — but not the way the original code (never actually wired to any UI) was written.** The original's `authenticateBySchoolIdCode()` logged a user in directly on a code match alone, no password check. That's a real security hole under genuine authentication (anyone who saw/photographed someone's ID barcode could sign in as them) — it only "worked" in the original because there was no real backend, just fake `localStorage` sessions. The rebuilt version instead: scans a QR code (live camera, same `jsQR` approach as Inventory's scanner, plus a manual-entry fallback) → resolves it to an account's **email only** via a narrow new `lookup_email_by_school_id` RPC (migration 002) → pre-fills the email field → **the person still has to enter their real password**. Genuinely faster sign-in, without becoming a way to impersonate someone. The RPC is intentionally narrow: it can never return anything but an email, and matches against `school_id_barcode`, `username`, or `patient_profiles.student_number`.

## ✅ Resolved by Phase K

- **Patient self-registration now works, with a real Supabase Auth account created.** Same 3-step form as the original (Personal Info → Academic Info → Account Setup), same field validation rules (numbers-only student ID, `09XXXXXXXXX` phone format, password-strength meter, etc.). Unlike Maintenance's admin-provisioned users, self-registration calls `supabase.auth.signUp()` directly — that's always safe with just the anon key, since the person only ever creates their own account.
  - **Required an RLS change** (migration 003): Phase A's `users_insert` policy only allowed admins to create rows. Registration needs a narrow addition — an authenticated caller can insert exactly one row for themselves as a `'patient'`, never as admin/staff, never for anyone else.
  - **Handles both email-confirmation modes your Supabase project might use.** If confirmation is off, the profile rows are created immediately after signup. If it's on, there's no session yet to authenticate those inserts (RLS would reject them) — so registration data is stashed in the auth user's `user_metadata` at signup time, and the profile rows get created automatically the first time the person actually logs in after confirming their email (`AuthContext.jsx`'s `loadProfile` handles this deferred case). **I could not test the confirmation-required path in this environment** — verify both modes against your actual project's Auth settings.
  - **Duplicate email/student-number checking happens at insert time, not before.** RLS blocks anonymous reads of `users`/`patient_profiles` by design, so there's no way to pre-check "is this already taken" before the person has an account. Postgres's own `UNIQUE` constraints catch real duplicates, surfaced as a friendly error message instead of a raw database error.

## ✅ Added: Pre-Login Emergency SOS Button

The original had the SOS button on the **login screen itself**, not just inside the authenticated app — for a bystander, or a student who can't/won't log in mid-emergency, to file a report. This required two more RLS/design decisions, both **deliberate tradeoffs, flagged clearly rather than silently shipped**:

1. **`emergency_alerts` now accepts anonymous (unauthenticated) inserts** (migration 004), same as `notifications` and `audit_logs` (the latter with a null `user_id`, mirroring the original's own `LOGIN_FAIL`/`LOGIN_BLOCKED` unattributed audit entries). This means **anyone, without logging in, can file an emergency alert naming a real student**. That's exactly what the original always allowed (it had no real auth at all) and exactly what was asked for — but it's a genuine spam/harassment vector in a way the earlier, authenticated-only version wasn't. **If this goes to a real production deployment, add rate-limiting and/or a CAPTCHA in front of this flow** — e.g. by fronting the insert with a Supabase Edge Function instead of a direct anonymous table write.
2. **A new narrow, anonymous-callable `search_patients_public` RPC** lets the pre-login reporter/affected-person picker search for a student by name or number. It deliberately returns *only* `name` + `student_number` — never email, phone, course, or anything else — to limit how much of the patient directory is exposed to unauthenticated visitors. Still a real information-exposure tradeoff worth the same rate-limiting/CAPTCHA recommendation as above.
3. **This also fixed a real bug from Phase I**: the authenticated "For Another Person" picker was calling `listUsers()`, which RLS actually blocks for patient callers (a patient can only read their own `users`/`patient_profiles` row, by design) — so that field silently returned nothing for real patient accounts, never caught because it wasn't tested against live RLS. Both the pre-login and logged-in "affected person" pickers now go through the same narrow search RPC instead.

## ✅ Chatbot: Database Persistence + Real AI (MediBot Integration)

Two related upgrades, done back to back:

1. **The chatbot's conversation history is now genuinely persisted** (`chat_conversations` + `chat_messages`, migration 005) instead of living only in React state (which reset on every refresh/logout — flagged as a known tradeoff since Phase 1). RLS on these two tables is intentionally **stricter** than most of the rest of the schema: every role, including admin, can only ever see their own chatbot conversations — no staff/admin-oversight policy exists here, since MediBot's own disclaimer offers emotional support and this is sensitive personal content.
2. **The reply engine can now be a real AI** (Groq/Llama 3.3 70B), ported from an uploaded standalone MediBot package into a `chat-completion` Edge Function — the only place a `GROQ_API_KEY` secret is allowed to exist. The original's in-memory per-session conversation Map (`memory.js`) was replaced with reads from the real `chat_messages` table instead, which is more robust than the original (survives cold starts, works across devices) rather than a downgrade.
   - **Automatic fallback, always on**: if the Edge Function isn't deployed, the API key isn't set, or the Groq call fails for any reason, the client transparently falls back to the original rule-based `botEngine.js`. The chatbot is never broken by this integration, even before you deploy anything for it.
   - **A real XSS risk was found and fixed while wiring this up**: bot messages were rendered via `dangerouslySetInnerHTML` on the assumption they'd only ever be your own trusted template strings. That assumption doesn't hold once replies can come from an LLM (a user could try to prompt-inject HTML/script content into a reply). Messages are now checked for whether they actually look like your trusted template HTML; AI-generated text renders as plain, auto-escaped text instead, matching the safety pattern the original MediBot's own frontend already used.
   - **Requires your own Groq API key** (free tier at console.groq.com) — this is a third-party service, not something that can be provisioned for you. See `DEPLOYMENT.md`.

## Still Open

1. **`audit_logs.ip_address` is always NULL** — can't be captured from a browser; would need a server-side hook.
2. **Avatar/profile photos are stored as base64 in a `TEXT` column**, not Supabase Storage.
3. `markNeedsMaintenance()`/`openEditMaintainModal()` in Inventory were not ported — genuinely unreachable dead code even in the original, no button anywhere calls them.
4. **Email Configuration settings aren't connected to a real email provider** — see the Phase G note above; it's a settings panel only.
5. **No automated tests exist** — see `RECOMMENDATIONS.md`.
6. Theme preference and sidebar collapsed-state no longer persist across reloads (moved off `localStorage` per an explicit instruction to remove all usage of it). Chat history is the one exception — it's now in the database, see above.
7. `legacy.css` (~134KB) likely contains rules for states/components trimmed during migration — not pruned, since safely verifying that without a browser to visually regression-test against was judged too risky.
8. **A standalone Appointments page was built (Phase C) then removed** per a later request — the dashboards' "Today's Schedule" widgets (original app functionality) still work and still use `appointmentsService.listAppointments()`.
9. **The `create-user` Edge Function is untested** (see above) — verify it deploys cleanly and actually creates working logins before depending on it.
10. **The `chat-completion` Edge Function is also untested** — same constraint, couldn't deploy or invoke it in this environment. The automatic fallback to the rule-based engine means a bad deploy fails safe, but verify the AI path actually works end-to-end before relying on it.
11. **The Query Log modal's "detected intent" column is now cosmetic when a reply came from the AI** — it's still computed via the same keyword-matching `classifyIntent()` used to drive the rule-based engine, which had no role in generating an AI-sourced reply. Still a reasonable rough categorization of what the user asked about, just not literally "what decided this reply" anymore for AI-answered messages.
12. **No rate-limiting on the AI endpoint** — a user could send messages in a tight loop and rack up Groq API usage/cost. Worth adding if this goes to real production use (e.g. a per-user cooldown, similar to the recommendation already flagged for the anonymous SOS endpoint).

## ✅ Bug Fixes: Login Theme, Registration, Profile Edit

- **Login page followed the visitor's OS dark-mode setting.** `ThemeContext` applies `data-theme` globally, with no exception for the unauthenticated login screen — someone with a dark-mode OS would see a dark login page before making any choice in the app itself. Fixed in `AuthLayout.jsx`: the login screen now always forces light mode, restoring the real theme the moment the user leaves it (login → authenticated app).
- **Registration could silently fail to create an account.** Root cause: Supabase Auth's own anti-enumeration behavior — signing up with an email that's *already registered* returns a fake success (`{user, session: null}`, no thrown error) instead of a clear "email taken" error. The only tell is an empty `identities` array. Previously this fell through to "check your email to confirm," but no email was sent and no database row was ever created — a genuinely broken experience with no error shown. Now detected explicitly and surfaced as a clear "an account with this email already exists" message.
  - Also fixed: if the two-step registration insert (`users` then `patient_profiles`) failed partway through, the `users` row was left dangling with no profile — permanently blocking that email/username from ever registering again, with no way to recover except manual database cleanup. Registration now cleans up its own orphaned row on partial failure, so the person can simply try again. This needed a new narrow RLS policy (`users_delete_own_incomplete`, migration 006) since only admins could previously delete `users` rows — scoped so it can only ever remove a user's own row, and only while it has no linked profile yet (a complete, real account can never be self-deleted this way).
- **Profile edits silently dropped the Username field.** `EditProfileModal.jsx` collects and lets a patient change their username, but `ProfilePage.jsx`'s save handler never included it in the `updateUser()` call — any username change was accepted by the UI and then quietly discarded. Fixed by including it in the update payload.
- **Added `migration 006`** — beyond the two fixes above, it idempotently re-affirms every RLS policy that registration and profile-editing depend on (`users_insert`/`_update`/`_select`, `patient_profiles_write`/`_select`, `staff_profiles_write`/`_select`), matching their intended final state from migrations 001/003 exactly. If a live project's policies ever drift from what the code expects — the single most likely cause of "the interface says it saved but the database doesn't have it" style bugs — this migration is safe to re-run at any time to bring them back in sync, regardless of which earlier migrations were actually applied.

## A Note on RLS Testing

I can't verify the new RLS policies against a live Supabase project in this environment. Before trusting them with real data, manually verify at minimum:
- A patient account genuinely cannot `SELECT` another patient's `document_requests`/`consultations` (try it directly via the Supabase client or REST API, not just through the UI, since the UI itself was never the security boundary — RLS is).
- A patient account cannot write to `inventory`/`inventory_logs`/`users` at all.
- Staff/admin can do everything the UI expects them to.
- `current_app_user_id()`/`current_app_role()` return the right values right after a fresh login (i.e. the auto-link-on-first-login logic in `AuthContext.jsx` actually ran).

## ✅ Inventory Normalization — Phase 3: Interface Now Connected

Following the Phase 2 schema work, **the Inventory page (and Consultation's medicine dispensing) now actually reads and writes the normalized `medicines`/`medicine_batches`/`suppliers` tables** for every Medicine-category item — this was not true before this phase; the interface previously still used the old `inventory` table for everything, including Medicine.

How it works:
- **`medicine_inventory_view`** (migration 008) computes quantity/expiration/status live from `medicine_batches` — never cached, so there's no drift between what's displayed and what's actually in the batches (the core problem Phase 1's analysis found with the old `inventory.quantity` cache).
- Items/Alerts tabs show a **merged list**: Medicine from the new tables, Supply/Equipment still from the old `inventory` table (Phase 2's explicit scope — those categories were never part of this normalization). Old `inventory` rows with `category = 'Medicine'` still exist in the database (nothing was deleted) but are suppressed from display so nothing shows twice.
- **The Batches tab is now Medicine-first**, backed by real `medicine_batches` — legacy `inventory_batches` rows are still shown too (nothing hidden), for any pre-existing Supply/Equipment batch data.
- **Release now does real FIFO deduction** (`releaseMedicineStockFIFO`) — deducts from the oldest-expiring Active batch(es) first, splitting across batches if needed. This is a genuine fix, not just a data-model change: `is_fifo` was previously decorative (Phase 1 finding) — quantity was always deducted from a single aggregate number regardless of batch age.
- **Consultation's medicine-dispensing dropdown and deduction were also fixed** — without this, new medicines added via Inventory would never have appeared as prescribable, and existing ones would have silently gone stale (frozen at whatever quantity the one-time Phase 2 backfill captured). Deduction tries the new medicines table first (real FIFO), falling back to the legacy path only for anything not found there (a safety net, not the primary path).
- **Deleting a medicine is a soft-delete** (`active = false`) — a medicine can be referenced by years of batch/movement history; a hard delete would cascade-erase all of it. Deleting a batch is a real hard delete, which is safe (Phase 2 chose `ON DELETE SET NULL` for exactly this).

Known gaps, deliberately out of scope for this phase (flagged, not silently skipped):
- **No data-entry UI yet for the pharmaceutical fields** (`generic_name`, `brand_name`, `dosage`, `strength`, `form`, `storage_requirement`, `image_url`) — Add/Edit Item still only collects what the original form always collected (name, category, quantity, unit, min stock, expiry, batch, supplier, received date). These fields exist in the schema and are `NULL` for every medicine today. Adding form fields for them would be a genuine interface redesign, which this phase was explicitly told not to do.
- **Supplier is still a free-text field**, not a picker — typing a name resolves to an existing `suppliers` row by exact match or creates a new one (`findOrCreateSupplier`). A dedicated supplier-picker/management UI would also be a visible interface addition beyond this phase's scope.
- **Editing an existing medicine's "Category" dropdown has no effect.** The Edit Item form still shows the Medicine/Supply/Equipment category selector (unchanged UI), but a medicine's category is implicitly "Medicine" by which table it lives in now — there's no supported way to re-categorize an existing medicine into Supply/Equipment (or vice versa) through this form. Out of scope for this phase; would need a dedicated migration action.
- **Staging two brand-new same-name medicines in one Add Item session** won't merge them into a single medicine with two batches — only the first is recognized within that same save operation. A pre-existing edge case in the original merge-detection logic, unchanged by this phase.

## ✅ Batch Inventory — Phase 4: Grouped Display, Edit, Archive

Building on Phase 3's connected interface:

- **Batches tab now groups by medicine** — one section per medicine (name + batch count + active on-hand total), its batches listed beneath it, sorted soonest-expiry-first. Legacy Supply/Equipment batches stay in their own flat section below, unchanged.
- **Edit Batch** (new) — corrects a batch's own details (batch/lot number, dates, quantity, unit cost, supplier, purchase reference) directly. This is deliberately NOT the same code path as the legacy item-edit flow, which searches for a "matching" item to merge into — Edit Batch always updates exactly the one batch that was opened, full stop. "Never merge batches automatically" was re-verified to already hold for Add Batch (it blocks duplicate batch numbers and tells you to use Replenish instead of silently combining) and now explicitly holds for Edit too.
- **Archive Batch** (new, migration 009 adds the `'Archived'` status value) — a soft-removal, same reasoning as Phase 3's medicine soft-delete: a batch can be referenced by movement history and consultation dispensing records, so archiving takes it out of active stock calculations (`medicine_inventory_view` only sums `Active` batches) while preserving everything. Unarchive is available too. A real hard delete (`deleteMedicineBatch`) still exists in the service layer for genuine mistakes, but isn't wired to the UI — Archive is the intended normal path.

Known scope boundary: Edit/Archive apply to Medicine batches only, matching this phase's own framing ("one medicine can have many batches"). Legacy `inventory_batches` rows (Supply/Equipment) have no `status` column at all and remain display-only — consistent with Phase 2's decision to scope real batch-tracking to Medicine going forward.

## ✅ Supplier Management — Phase 5: Complete CRUD, Dropdown Everywhere, Delete Protection

- **New "Suppliers" tab** in Inventory — full CRUD (name, contact person, phone, email, address, remarks), with a live batch-usage count per supplier.
- **Every supplier field across the entire Inventory feature is now a dropdown** (`SearchableSelect`, the same searchable combobox already used elsewhere in this app), not free text — this applies uniformly to both the new Medicine-batch flows (which store `supplier_id`) *and* the legacy Supply/Equipment flows (which still store a plain-text supplier name on the old `inventory` table, unchanged schema — the dropdown resolves to the name before saving, so the same picker serves both without a second UI pattern). Covered: Add Item, Edit Item, Replenish, Add Batch, Edit Batch, Replenish Batch, and the QR Scan verification form (which now resolves a scanned supplier name against known suppliers instead of accepting it as unverified free text).
- **Deleting a supplier still in use is blocked**, not silently allowed. Checked at the application layer first (a clear, specific "linked to N batches" message) and enforced independently at the database layer too — `migration 010` tightens `medicine_batches.supplier_id` from `ON DELETE SET NULL` to `ON DELETE RESTRICT`, so the guarantee holds even for direct API/SQL access that bypasses the application check.
- `findOrCreateSupplier()` (the old free-text-resolution helper from Phase 3) is no longer called anywhere in the interface — kept in the service layer as a reasonable building block for a possible future bulk-import feature, not because anything still uses it today.

## ✅ Receiving Records — Phase 6: Complete Receiving History

**A new, separate `receiving_records` table** — deliberately not just extra columns on `medicine_batches`. Reasoning: a batch's `quantity` is mutable (it drops as stock is released via FIFO), so if the received-quantity/invoice/receiver information only lived on the batch, it would become historically inaccurate the moment any of that batch was dispensed. `receiving_records` is the immutable "what was received" event (supplier, invoice number, purchase reference, quantity, received date, received by, remarks) — `medicine_batches` keeps tracking current on-hand state, exactly as it already did.

- **New "Receiving" tab** — full history table + Add/Edit.
- **Creating a receiving record automatically creates its linked batch** (one insert triggers both, application-side) — there's no way to create a receiving record without a batch, or a batch without one existing (through this flow).
- **Editing adjusts the linked batch by the quantity *delta*, not an overwrite.** If 10 units were already released via FIFO before someone corrects "50 → actually 80 received," the batch becomes `current + 30`, not `80` — a blind overwrite would wrongly restore stock that's genuinely gone. This is what "editing must correctly update inventory quantities" requires, and it's also what guarantees "never duplicate inventory" — edits always touch the one linked batch, never spawn a second one.
- **No delete action** — a considered omission, not a gap. A receiving record is a real-world audit document (a goods-received note); like the physical paperwork it represents, it should be correctable but not erasable. Consistent with how Phase 4 treated `medicine_batches` (Archive, not delete, is the normal path) and Phase 3 treated `medicines` (soft-delete only).
- **"Received by" is automatically the staff member performing the action** (matching how every other action in this app attributes itself, e.g. `staff_id` on `inventory_logs`), not a manually-selected field — and it stays fixed on edits, even if a different staff member later corrects the record's other details (the *edit* is attributed separately, in the movement log).
- Scope boundary, consistent with every phase since Phase 2: Receiving applies to Medicine only. Supply/Equipment continue through the existing (unmodified) Add Batch flow.

## ✅ Inventory Movement — Phase 7: Previous/New Quantity, New Movement Types, a Real Bug Fixed

- **Every movement now stores `previous_quantity` and `new_quantity`**, not just the delta (`quantity_change`, which already existed). Populated for every new movement going forward, across *both* the Medicine and legacy Supply/Equipment paths — left `NULL` for historical entries rather than reconstructing estimated values, since that would mean rewriting history with numbers that were never actually captured at the time.
- **Movement types aligned to the canonical set** (`Received`, `Released`, `Adjustment`, `Damaged`, `Expired`, `Archived`) for the normalized Medicine path going forward. Legacy values (`Replenish`, `Release`, `Edit`, `Merge`, `Remove Expired`, `Removed`, `Maintained`, `Maintenance Hold`) are kept, not deleted or renamed retroactively — Supply/Equipment still actively uses them, and no historical row's label is ever rewritten.
- **"Damaged" is a genuinely new capability** — previously there was no way to report damaged stock at all, distinct from expired or manually released. New per-batch "Damaged" action on the Batches tab.
- **"Archived" now logs as itself.** Previously Phase 4's archive action logged as a generic zero-quantity "Adjustment" with a note; it now uses the real `Archived` type.
- **Two places skipped logging a movement entirely** when a batch/receiving-record edit didn't change quantity (e.g., correcting a lot number with the same quantity) — found while auditing "every transaction must be recorded." Both now always log, using previous = new quantity to accurately represent "nothing quantity-wise changed, but this edit still happened."

**A real, serious pre-existing bug was found and fixed**: `inventory_logs.inventory_id` had no `ON DELETE` clause at all (defaulting to `NO ACTION`/restrict) — meaning `deleteInventoryItem()` would fail with a foreign-key violation for *any* Supply/Equipment item that had ever been logged before, which is virtually every real item (Add Item alone always logs an initial-stock entry). The Remove action for those categories has likely been broken this whole time for anything beyond a brand-new, untouched item. Fixed the same way `medicine_id`/`medicine_batch_id` already were: `ON DELETE SET NULL` — the log row is never removed (satisfying "do not delete movement history" precisely), it just loses its live link once the item itself is gone, while `notes` (updated at both affected call sites to include the item's name explicitly) keeps the entry self-describing even after that happens.

The Log tab now displays a "Previous → New" column alongside the existing quantity-change indicator.

Noticed but left out of this phase's scope: the Log tab's "Scan Source" column reads `l.from_scan`, a field that's never actually set anywhere in the schema or service layer — every entry shows "Manual" regardless of whether it came from a QR scan. Not one of this phase's required fields (medicine, batch, quantity, previous/new quantity, user, timestamp, remarks all are), so left as a known pre-existing gap rather than expanding scope.

## ✅ Inventory Status — Phase 8: 8-State System, Fully Automatic

Replaced the old 3-state logic (`Good`/`Low Stock`/`Expired`, plus Equipment's separate `Needs Maintenance`) with the full required set: **Available, Low Stock, Critical Stock, Out of Stock, Near Expiry, Expired, Damaged, Archived**. Every status is still computed live by `getInventoryStatus()` from quantity/expiration/batch data on every call — nothing is a stored flag a person has to remember to refresh, so "do not require manual updates" holds the same way it always did, just over a richer status set.

- **Critical Stock** is a new, more urgent tier than Low Stock — quantity at or below *half* the reorder point, not just at/below it.
- **Out of Stock** is quantity zero, distinguished from **Damaged**/**Archived** (also technically zero-quantity states) by checking the medicine's most recent batch — genuine "batch availability" data, not just a number. This needed extending `medicine_inventory_view` with `latest_batch_status`.
- **"Damaged" is now a real, reachable status**, not just the movement-log entry Phase 7 added. When a damage report consumes a batch's entire remaining quantity, the batch's status becomes `'Damaged'` instead of the generic `'Depleted'` — audit-meaningful: *why* did this batch reach zero?
- **Near Expiry** consolidates a 30-day threshold that was previously duplicated slightly inconsistently across `AlertsTab`, `BatchesTab`, and `InventoryPage`'s own alert-checking — now one shared `isNearExpiry()` helper.
- Equipment's `Needs Maintenance` is kept exactly as it was — not one of the 8 (Equipment has no batches, and its concept is unrelated to quantity/expiry-driven stock status), and removing an existing, working feature wasn't required by this task.

**Two real regressions were found and fixed** while verifying this rename project-wide: renaming `'Good'` → `'Available'` silently broke every place that still checked for the literal string `'Good'` — the Admin and Staff dashboards' "Inventory Alerts" counts (would have shown zero, or worse, nearly the entire inventory, depending on the check direction), a stat-card click filter, an Items-tab stock bar's color logic, and the medicine status indicator in Consultation's prescribing picker. All found via a full-project grep for the old status string and fixed, not just the Inventory feature's own files. Also fixed two pre-existing `key={i.inventory_id}` React-key collisions in the dashboards (the same medicine_id/inventory_id collision class fixed elsewhere in Phase 3), found incidentally while touching that code.

## ✅ QR Code Integration — Phase 9: Per-Batch QR Generation and Scan-to-Detail

- **New dependency**: `qrcode` (generation) — the existing `jsqr` (decoding) was already in place and is unchanged; nothing about the existing scan flow was removed.
- **Every medicine batch can generate its own QR code** — a new "QR" button on each batch row (Batches tab) opens a modal that generates one on the spot from that batch's *live* data (medicine, batch number, lot number, expiration, supplier, quantity — exactly the six required fields), with a download option. Nothing is pre-generated or cached as a static image, so a QR code printed today and one generated next month for the same batch will always reflect that batch's current state, not a stale snapshot from whenever it was first created.
- **Scanning a batch's own QR code opens its details immediately** — a new read-only Batch Details view with quick-action shortcuts (Edit/Replenish/Release/Archive) that call the exact same handlers the Batches tab itself uses, so acting on a batch found via scan behaves identically to acting on it from the table.
- **The existing generic scan flow is fully preserved** — external/supplier QR codes (the original use case: scan a product's printed code to quickly restock or create an item) go through the exact same verify-and-save flow as before. The two paths are distinguished by a `type: 'batch'` marker only our own generated codes carry; anything without it falls through to the original flow untouched. Confirmed via a full read of the existing `parseQRPayload`/`ScanVerifyModal`/`handleScanSave` code paths before making any change, and via file-diff after, that none of it was modified.
- **Database**: `scan_history` gains a `medicine_batch_id` FK and a new `'BatchView'` result value, so scan-to-detail lookups are recorded in the same existing audit trail Phase 2 already built for stock-in scans — extended, not duplicated.
- Scope boundary, consistent with every phase since Phase 2: batch QR codes apply to Medicine only (Supply/Equipment have no `medicine_batch_id` to encode).

## ✅ Inventory Dashboard — Phase 10

**New "Dashboard" tab** (first in the tab list; the default landing tab is deliberately left as Items, unchanged, since switching it wasn't required) showing all ten required cards/sections: Current Stock, Low Stock, Critical Stock, Expired, Near Expiry, Damaged, Recently Received, Recently Released, Monthly Inventory Movement, Top Used Medicines.

**"Optimize queries for performance" — where the real work went**: two of these cards genuinely need database-side aggregation to avoid scanning `inventory_logs`, which grows unbounded over time —
- **Monthly Inventory Movement** and **Top Used Medicines** are computed by two new Postgres SQL functions (`get_monthly_inventory_movement`, `get_top_used_medicines` — migration 015), called via `supabase.rpc()`. `GROUP BY`/`SUM`/`ORDER BY`/`LIMIT` all happen server-side; only the final small result set is ever transferred to the client.
- **Damaged** is a real `COUNT(*)` query (`head: true`, no row data transferred), not a client-side filter over fetched rows.
- **Recently Received/Released** are indexed, `LIMIT`-ed queries (added `inventory_logs.created_at` index specifically for this), not a full-table fetch.
- **Current Stock / Low Stock / Critical Stock / Expired / Near Expiry** deliberately reuse the `inventory` array the Inventory page already has loaded for every other tab (Items, Alerts, etc.) rather than firing a redundant duplicate fetch — `medicines` is a small table for a real clinic (hundreds of rows, not millions), so client-side `getInventoryStatus()` counts over already-loaded data is the right call here, not wasteful; the genuinely expensive aggregations (the two above) are the ones pushed server-side.

All ten values are live queries/computations — no hardcoded numbers anywhere on this tab.

Chart rendering reuses the exact same Chart.js pattern already established in Consultation's `AnalyticsTab.jsx` (a `useChart(canvasRef, config)` hook, `chart.js/auto`), rather than introducing `recharts` (also a project dependency, but unused anywhere) as a second, inconsistent charting paradigm.

## ✅ Reports — Phase 11: 7 Inventory Report Types, PDF/Excel/CSV Export

**A real, confirmed bug was found and fixed**: the existing "Inventory Summary" report called `listInventory()` alone — the legacy table only. Since Phase 2/3 moved Medicine into its own normalized tables, this report has been silently missing every medicine added after that point, showing only stale/frozen legacy rows for Medicine and correct live data for Supply/Equipment only. Replaced with the same merge `InventoryPage.jsx` has used since Phase 3 (legacy Supply/Equipment + live `medicines`), so all seven new inventory report types reflect genuinely live, complete data — which is also literally what this phase requires ("reports must use live Supabase data").

- **Seven inventory report types added**: Daily Inventory, Monthly Inventory, Expired Items, Low Stock, Inventory Movement, Receiving History, Supplier Deliveries — alongside the three existing clinic reports (Document Requests, Consultations, Audit Logs), which are untouched.
- **"Daily Inventory" reflects live current state, not a reconstructed historical snapshot.** There's no stored per-day inventory snapshot to pull from — only the movement log, and replaying it in full to derive a specific past day's state would be expensive and, for a report meant to be generated fresh each day anyway, unnecessary. Documented explicitly in the code, not left ambiguous.
- **"Do not duplicate queries unnecessarily"**: report data now loads *lazily*, per report type, instead of the old pattern of eagerly fetching everything on page load regardless of what's selected. A small in-memory cache (keyed by data type, or by exact date range for range-scoped data) means switching between Daily/Expired/Low Stock — which all share the same underlying inventory snapshot — fetches that snapshot once, not three times; likewise Supplier Deliveries reuses the exact same receiving-records fetch as Receiving History for the same date range rather than querying it twice. Two new date-range-scoped query functions (`listInventoryLogsInRange`, `listReceivingRecordsInRange`) avoid pulling entire unbounded history tables just to build a report over one period.
- **PDF and Excel export** (new `jspdf`/`jspdf-autotable`/`xlsx` dependencies) plus **CSV** (no library needed) — all three consume the exact same generic `{title, headers, rows}` shape the existing Print feature already used, so every report type gets all four output options automatically, and the existing Print button/flow is completely unchanged.
- **Bundle-size optimization**: `jspdf`/`xlsx` together are a genuinely heavy dependency (jsPDF alone pulls in `html2canvas`). They're dynamically imported inside the export functions rather than statically at the top of the file — the Reports page's own chunk dropped from 729KB to 17KB as a result; the ~700KB of PDF/Excel tooling now only downloads the moment someone actually clicks those buttons, not on every visit to the page.
- **Known, disclosed dependency risk**: `xlsx` (SheetJS) has two published security advisories (prototype pollution, ReDoS) with no fix currently available via npm. Both are in the *parsing* code path — this app only ever *writes* Excel files from its own trusted Supabase data, never parses uploaded spreadsheets, so practical exposure is low. Flagged transparently rather than silently accepted; worth reassessing if a future feature ever adds spreadsheet import.

## ✅ Phase 12 — Final Review

A full audit of the Inventory module: every CRUD operation, every foreign key, every Supabase query, duplicate logic, slow-query patterns, interface-vs-database consistency, and dead code. No AI/chatbot features were added or touched, per this phase's explicit instruction.

### Real issues found and fixed this phase

1. **A third instance of the FK-blocks-delete bug class.** Phase 7 found and fixed `inventory_logs.inventory_id` having no `ON DELETE` clause (defaulting to `RESTRICT`), which silently broke removing any Supply/Equipment item with movement history. The same review scope missed `consultation_medications.inventory_id` at the time — same bug, same fix (`ON DELETE SET NULL`), found now by systematically cross-checking every FK in the schema rather than just the one table Phase 7 was focused on.
2. **Three FK columns with no index at all**: `consultation_medications.inventory_id`, `consultation_medications.medicine_batch_id`, `scan_history.medicine_id`. Every other FK column in this schema is indexed; these three were simply missed as each was added incrementally across earlier phases. Found by cross-referencing every `REFERENCES` against every `CREATE INDEX` in the consolidated schema.
3. **Duplicate logic, found and consolidated**:
   - `BatchesTab.jsx` and `BatchDetailModal.jsx` each defined the exact same batch-status function, character-for-character identical. Moved to a single `getBatchStatus()` in `inventoryHelpers.js`.
   - Five separate places (`AlertsTab`, `BatchesTab`, `InventoryPage`, `ItemsTab`, `ReportsPage`) each hand-rolled their own "days until/since a date" arithmetic, slightly inconsistently (mixed `Math.ceil`/`Math.floor`, reversed subtraction order). Consolidated into one `daysUntil()` helper.
   - `InventoryPage.jsx`'s tab-badge alert count re-implemented the exact 30-day "near expiry" threshold inline instead of just calling `getInventoryStatus(i) === 'Near Expiry'` — the single source of truth that threshold already lived in. Fixed to use it directly.
4. **A real, systemic performance issue**: roughly 20 handler functions across `InventoryPage.jsx` called 2–4 independent `refresh*()` functions with sequential `await`s, one full network round-trip after another, when none of them depend on each other's results. Every one collapsed into a single `Promise.all([...])` — same queries, same data, running concurrently instead of one at a time. This is the most impactful change in this phase: it measurably speeds up the "after I save something" wait on nearly every write action in the module.
5. **Dead code removed**: `getMedicineByName` (zero callers anywhere, superseded by `findInventoryItemMatch`) and `findOrCreateSupplier` (explicitly flagged as speculative back in Phase 5, no concrete use ever materialized).

### Reviewed and found acceptable, not changed
- Every sequential per-item loop in the codebase (FIFO batch release, consultation medicine deduction, staged multi-item add, expired-batch distribution) is small, bounded by realistic real-world counts, and *sequentially necessary* for correctness (order matters) — not a genuine N+1 anti-pattern despite superficially looking like one.
- `medicine_inventory_view`'s per-row correlated subqueries are all covered by the existing `idx_medbatch_medicine` index; acceptable at clinic scale. If the medicines table ever grows into the tens of thousands of rows, consider a materialized view refreshed periodically instead of computing live on every read.
- `medicine_batches.medicine_id`/`receiving_records.medicine_id` are `ON DELETE CASCADE` — theoretically means a hard-deleted medicine would wipe its batch/receiving history, contradicting "never delete movement history." Not fixed, because the application layer never actually hard-deletes a medicine (only soft-deletes via `active = false`) — this path is unreachable through the UI today. Listed under recommendations below as defense-in-depth hardening, not a confirmed bug.
- `deleteMedicineBatch`/`deleteInventoryBatch`/`restoreMedicine` remain in the service layer with zero UI callers. Unlike the two functions removed above, these are legitimate, small, safe data-recovery operations (undo an accidental archive/deactivation, or remove a batch added by genuine mistake) — removing them would reduce the system's ability to recover from mistakes for no real benefit. Flagged as a recommendation (build the missing "Archived Medicines" admin view) rather than deleted as dead code.

---

## 📋 Phase 12 Summary

### Completed Features (Phases 1–12)
- Full Medicine/Batch/Supplier normalization, decoupled from the legacy Supply/Equipment `inventory` table
- Complete batch lifecycle: Add, Edit, Replenish, Release (true FIFO), Archive/Unarchive, Report Damaged
- Supplier management (CRUD, delete-protection when in use)
- Receiving Records — immutable goods-received audit trail, auto-creates its linked batch, edits adjust by quantity delta
- Inventory movement tracking — 8 movement types, previous/new quantity on every entry, full audit trail never deleted
- 8-state automatic inventory status (Available, Low Stock, Critical Stock, Out of Stock, Near Expiry, Expired, Damaged, Archived)
- Per-batch QR code generation and scan-to-detail lookup, alongside the original generic scan-and-restock flow (both coexist)
- Inventory Dashboard — all required cards/charts, computed live
- 7 inventory report types plus the 3 original clinic reports, exportable as PDF/Excel/CSV/Print
- Every inventory page verified functioning: Dashboard, Items, Batches, Receiving, Suppliers, Scan, Log, Alerts

### Database Improvements
- Normalized `medicines`/`medicine_batches`/`suppliers`/`receiving_records` tables, replacing a single denormalized `inventory` table for Medicine
- Every foreign key reviewed; three real `ON DELETE` bugs found and fixed across Phases 7 and 12 (items with movement history couldn't be deleted); three missing indexes added
- `medicine_inventory_view` — a live, computed aggregate with zero stored/cached values to drift out of sync
- Two server-side SQL aggregation functions (monthly movement, top used medicines) instead of pulling raw history client-side

### Performance Improvements
- ~20 sequential multi-query refreshes collapsed into parallel `Promise.all` calls — the single biggest change this phase, affecting nearly every write action's perceived speed
- Date-range-scoped query variants added for reports (`listInventoryLogsInRange`, `listReceivingRecordsInRange`) instead of pulling entire unbounded history tables
- Real `COUNT`-only queries (no row data) for dashboard counts where only a number is needed
- Reports page: lazy, on-demand, cached-within-session data loading instead of eagerly fetching everything regardless of what's selected
- PDF/Excel export libraries (~700KB) dynamically imported only when actually clicked, dropping the Reports page's own bundle from 729KB to 17KB
- Duplicate logic consolidated into shared helpers (`getBatchStatus`, `daysUntil`, `isNearExpiry`) — one source of truth instead of five slightly-inconsistent copies

### Remaining Recommendations
1. Build an "Archived Medicines" admin view exposing `restoreMedicine`/`deleteMedicineBatch`/`deleteInventoryBatch` — currently correct, safe, and present in the service layer, but unreachable from the UI.
2. Consider tightening `medicine_batches.medicine_id`/`receiving_records.medicine_id` from `ON DELETE CASCADE` to `RESTRICT` for defense-in-depth, even though the application never hard-deletes a medicine today.
3. Add data-entry UI for the pharmaceutical fields (`generic_name`, `brand_name`, `dosage`, `strength`, `form`, `storage_requirement`, `image_url`) — present in the schema since Phase 2, still `NULL` for every medicine, no form ever collects them.
4. Supplier remains free-text-resolved-to-dropdown only for Medicine batches; a dedicated bulk-import (CSV) flow for suppliers/medicines would be a natural next step now that `findOrCreateSupplier`-style resolution has a clearer purpose than it did when first built.
5. `scan_history.from_scan` is still never actually set anywhere (flagged in Phase 7) — the Log tab's "Scan Source" column always shows "Manual."
6. If `medicines` ever grows very large (tens of thousands of rows), revisit `medicine_inventory_view` as a materialized view rather than a live computed one.

## Inventory Notification System — Phase 2: Database

New `inventory_notifications` table (migration 017) — a dedicated, medicine/batch-linked notification store, not a duplicate of the existing general `notifications` table (which has no FK to inventory records, only a generic route). See the Phase 1 analysis in the corresponding conversation for the full reasoning, including two real gaps found in the existing system: 5 scattered hand-written low-stock notification call sites with no auto-clear mechanism, and a confirmed bug where `releaseMedicineStockFIFO()` could dispense an expired batch (its stored `status` was never automatically flipped when the date passed) — both fixed in later phases below.

New `src/services/inventoryNotificationsService.js` — `createInventoryNotification()` is the single entry point every alert-generating call goes through, with structural duplicate-prevention (by medicine + type + unread, not fragile message-text matching) and a priority-based cross-post to the existing general `notifications` table for high/critical alerts only (a visibility nudge for the existing Topbar bell, not a second copy of the data).

## Inventory Notification System — Phase 3: Low Stock Alerts

**Consolidated, not scattered.** `checkStockLevelAlert()` is called from exactly one place — `addMedicineMovement()` in `medicineService.js`, which every quantity-changing medicine action already calls (Replenish, Release, Damage, Expired-removal, Receiving, Batch-Edit, Archive/Unarchive, and Consultation dispensing via `releaseMedicineStockFIFO`). Verified this coverage is genuinely automatic by tracing all of these call paths, not assumed — every one of them either calls `addMedicineMovement` directly or through a function that does.

**The 5 scattered low-stock `notify()` calls found in Phase 1 are gone.** Two (in the legacy Supply/Equipment release paths) were left untouched — out of this system's scope, matching the Medicine-only boundary every phase since Phase 2 has held, and removing them would remove existing functionality with no replacement. The other three (all in Medicine-side code) were removed as now-redundant — leaving them would have caused duplicate/conflicting alerts firing alongside the new centralized ones.

**Auto-clear** works by re-evaluating status on every movement and clearing the *other* stock-tier alerts each time — Critical → Available clears everything in one pass; Critical → Low correctly swaps which single alert is showing. No separate "resolve" step or extra column needed.

**Configurable thresholds**: `min_stock` (already a per-medicine editable field) is the configurable reorder threshold this phase asks for; Critical Stock stays derived as half of it (Phase 8 of the original project) rather than adding a second, independently-configurable ratio that wasn't asked for.

## Inventory Notification System — Phase 4: Expiration Alerts

**Batch-level, not aggregate**: each of a medicine's batches gets checked and alerted on individually — a medicine with one batch expiring in 5 days and another in 200 days now correctly gets two separate alerts, where checking only the item-level "soonest batch" (what the dashboard shows) would have missed the second one entirely.

**A real bug in the Phase 2 dedup logic, found and fixed before it caused a real problem**: the duplicate-prevention check from Phase 2 keyed only on `medicine_id`, which would have silently dropped the *second* batch's alert as a "duplicate" the moment two batches of the same medicine hit the same tier. Fixed to key on `batch_id` when a batch is involved.

**The confirmed safety bug from Phase 1 is fixed**: `releaseMedicineStockFIFO()` — used by both the Batches tab's Release action *and* Consultation's medicine dispensing — now explicitly excludes any batch whose expiration date has passed, even if its stored `status` still says `'Active'`. This fixes the problem immediately and unconditionally, not just when an automated check happens to have run recently.

**"Automatically update status"**: originally a separate JS step flipping any batch past its expiration date from `'Active'` to `'Expired'` — this was later folded into the single SQL function built in Phase 8 (see below), which is now the source of truth for this behavior.

**Superseded, not duplicated**: the old item-level, message-text-deduped expiration check (found in Phase 1, using the general `notifications` table directly) was removed — running it alongside the new system would have created literally duplicate alerts, since both cross-post urgent items to the same general table.

## Inventory Notification System — Phase 5: Inventory Event Alerts

Same hook point as Phases 3-4 — `addMedicineMovement()` — now also generates one notification per Received/Released/Damaged/Adjustment/Archived event, each referencing both the affected medicine and the specific batch (both FKs always populated; every one of these five action types is confirmed to always carry a batch ID by construction).

**Deliberately excluded `'Expired'`** from event-alerting even though it's a real `addMedicineMovement` action type (fired by `removeExpiredBatchQuantity`) — Phase 4's dedicated, date-driven expiration alerting already covers this more accurately; firing an event alert here too would have duplicated it.

**A genuine behavioral difference from Phases 3-4, by design**: event alerts don't dedupe the way stock/expiration alerts do. Low Stock is a *state* (one open alert per medicine at a time, cleared when the state changes); "50 units were received" is an *event* (a real, distinct occurrence each time) — deduping those would mean only ever seeing the first delivery notification and silently dropping every one after it, which isn't what an activity feed should do.

**Query reuse**: the medicine name needed for event notification text is fetched once, in the same call that already runs for stock-level checking (Phase 3), rather than fetching it a second time — one extra single-row batch-number lookup only when an event notification is actually about to be created.

## Inventory Notification System — Phase 6: Notification Center

New "Notifications" tab within Inventory — deliberately distinct from the existing "Alerts" tab, not a replacement or a duplicate of it: Alerts shows *live-computed* current-state rows recalculated from scratch on every render (what needs attention right now); Notifications shows the *persisted history* of what Phases 2-5 actually generated, with real read/unread tracking, filterable by type, unread-only toggle, mark-as-read/mark-all-read.

**"Clicking a notification opens the related record" reuses existing components, not new ones**: batch-linked notifications (expiration and event alerts, which always carry a `batch_id`) open the exact same `BatchDetailModal` the original project's Phase 9 (QR code integration) already built — acting on a batch found via a notification behaves identically to acting on one found by scanning it. Medicine-only notifications (Low/Critical/Out of Stock have no single batch) route to the Items tab pre-filtered by medicine name, reusing the existing search-filter state rather than building a second detail view.

## Inventory Notification System — Phase 7: Dashboard Alert Widgets

Added the missing **Out of Stock** card (medicine-level, reusing already-loaded data, same as Low/Critical) and split the old single 30-day "Near Expiry" bucket into the three tiers **Expiring in 90/30/7 Days** the notification system now actually tracks — each a real `COUNT`-only query at the batch level (`getExpiringBatchCount(days)`, matching the existing `getDamagedBatchCount` pattern), cumulative (90 days includes anything within 30 or 7 days too, matching plain-language interpretation).

**A deliberate design decision worth being explicit about**: these cards are computed from live inventory state (`medicine_batches`/`medicines`), *not* from the `inventory_notifications` table Phases 2-6 built. These are legitimately different things — if someone marks a Low Stock notification as read, the medicine is still low stock; the dashboard has to keep reflecting that regardless of anyone's read/unread state. Conflating "current reality" with "history of alerts raised about it" would have been a real bug, not just an implementation preference.

Clicking the three new expiration cards and Damaged Inventory now navigates to the Batches tab (where that data actually lives) rather than the Items tab's status filter, which was the pre-existing (and, on inspection, not fully correct) behavior for Damaged specifically — batch-level concepts don't map cleanly onto the item-level status filter.

## Inventory Notification System — Phase 8: Automation

**Stock alerts (Phase 3) and event alerts (Phase 5) were already fully automatic** — hooked into `addMedicineMovement()`, which every quantity-changing action calls, so they fire immediately on the write itself. Nothing further was needed for those; this phase is specifically about expiration alerts (Phase 4), the one genuinely time-driven check with no data-write event a trigger could hook.

**A significant consolidation, not just a scheduling add-on**: the entire expiration-check algorithm (tiering, dedup, auto-clear, status sync) — previously implemented in JS across `checkExpirationAlert()`/`syncExpiredBatchStatus()`/`runExpirationCheck()` — moved into a single PL/pgSQL function, `run_expiration_check()` (migration 018). This is now the one source of truth, callable both from the client (`medicineService.runExpirationCheck()` is now a thin RPC wrapper, same trigger point as before — Inventory page load) and from `pg_cron` on a daily schedule. Keeping a second, separate JS implementation for a scheduled path would have meant maintaining the same algorithm in two places with no way to guarantee they'd stay in sync — exactly the kind of duplication this whole review has been working against.

**Once daily is the deliberately chosen cadence** — expiration dates don't change more than once a day, so anything more frequent would be the "unnecessary polling" this phase explicitly says to avoid.

**`pg_cron` availability is honestly uncertain and handled gracefully.** It varies by Supabase plan/project configuration. The migration wraps the scheduling attempt in exception handling so a project without it available still gets the required function (and the system still works exactly as it did after Phase 4 — checked on every page load) without the migration failing outright. See `DEPLOYMENT.md` for how to verify whether the schedule actually took effect on your project.

## ✅ Inventory Notification System — Phase 9: Final Review

Verified each required area against the real code, not assumed:

- **Database integrity**: `notification_type` CHECK constraint cross-checked against every value actually used in JS (`PRIORITY_BY_TYPE`) and SQL (`run_expiration_check()`'s `CASE` branches) — exact match, 13 values, no gaps or extras. RLS confirmed enabled and unchanged. `run_expiration_check()`'s `SECURITY DEFINER` is intentional and consistent with existing functions in this schema (`search_patients_public`, `get_monthly_inventory_movement`) — required because `pg_cron` has no authenticated Supabase session to run under; adding a role check inside the function would have broken the cron path along with the client path, so it wasn't added (the function itself is idempotent and returns no data, so broad `authenticated` execute access carries negligible risk).
- **Notification generation**: confirmed reachable end-to-end for all 13 types by tracing every call site, not just reading the code in isolation.
- **A real bug found and fixed — six times over**: archiving a batch, fully damaging one out, fully removing expired stock, a FIFO release that empties a batch, a manual batch release that empties it, and correcting a receiving record down to zero all move a batch to a terminal status (`Archived`/`Damaged`/`Depleted`) that `run_expiration_check()`'s loop only processes for `Active`/`Expired` batches. Without an explicit fix, any expiration alert already open on that batch would have stayed open forever, since the SQL function would simply stop seeing that batch on every subsequent run. Traced every place a batch's status changes to a terminal value (six call sites total, across both `medicineService.js` and `InventoryPage.jsx`) and added an explicit stale-alert clear at each one.
- **Dashboard accuracy**: confirmed no dependency on anything removed by Phase 8's JS-to-SQL consolidation — the six dashboard query functions are all independent and untouched.
- **Duplicate prevention**: traced a full realistic scenario (release → low stock → release again → critical stock → release to zero → out of stock, with a batch also approaching its expiration tier throughout) confirming auto-clear and tier-swapping behave correctly at each step, including the newly-fixed terminal-status case.
- **Performance**: `addMedicineMovement` now does 2-5 extra small queries per movement for alerting (a dedup check, an insert, an optional cross-post, an optional batch-number lookup) — reviewed and accepted as proportionate for a clinic's realistic movement volume (tens per day, not thousands per second); not optimized further, since doing so would trade real simplicity for a performance gain this workload doesn't need.
- **Batch/inventory relationships**: every notification's `medicine_id`/`batch_id` FKs confirmed populated correctly per type (stock alerts: medicine-only by design; expiration and event alerts: both, always).
- **Constraints honored**: confirmed zero AI/chatbot files touched across all 9 phases (verified via diff, not just by not having intentionally touched them), and no existing page's layout/structure was altered — only new tabs and new dashboard cards were added, consistent with "reuse existing components" and "do not redesign existing pages."

### Summary of Changes
Complete database-driven notification/alert system for Inventory: automatic Low/Critical/Out-of-Stock alerts, four-tier expiration monitoring (90/60/30/7 days) plus expired, five event types (Received/Released/Damaged/Adjustment/Archived), a dedicated Notification Center tab, three new/expanded Dashboard cards, and daily automated expiration checking — integrated with, not duplicating, the existing general notification system and Alerts tab.

### Database Modifications
- **New table**: `inventory_notifications` (migration 017) — `id, notification_type, medicine_id, batch_id, title, message, priority, is_read, created_at, created_by`, with FKs to `medicines`/`medicine_batches`/`users` (`ON DELETE SET NULL`, consistent with every comparable FK added since Phase 7 of the original project) and 6 indexes.
- **New function**: `run_expiration_check()` (migration 018, PL/pgSQL) — the complete expiration-check algorithm, callable via RPC or `pg_cron`.
- **Optional automation**: daily `pg_cron` schedule for the function above, gracefully skipped if unavailable.
- No changes to any existing table's columns or existing FKs — this feature is additive.

### New Queries
- `checkStockLevelAlert()` / `createEventNotification()` — called from `addMedicineMovement()`, fire on every quantity-changing action.
- `run_expiration_check()` — one query for status sync, one query for the batch scan, then per-batch dedup-checked reads/writes against the composite index from migration 017.
- `listInventoryNotifications()` / `countUnreadInventoryNotifications()` / `markInventoryNotificationRead()` / `markAllInventoryNotificationsRead()` — Notification Center CRUD.
- `getExpiringBatchCount(days)` — real `COUNT`-only query per Dashboard expiration tier.

### Performance Recommendations
1. If clinic movement volume ever grows dramatically (hundreds of writes per minute, not per day), reconsider the 2-5 extra per-movement alert queries — currently fine, but a batched/async alerting approach would be worth revisiting at that scale.
2. Monitor `run_expiration_check()`'s runtime as `medicine_batches` grows — the per-batch loop is fine at hundreds-to-low-thousands of rows; beyond that, consider rewriting the loop as a single set-based `INSERT ... SELECT` rather than row-by-row PL/pgSQL, which would be faster but harder to read.
3. If `pg_cron` isn't available on your plan, the client-side "check on page load" path is a full fallback, not a degraded one — no further action needed unless "runs even if nobody opens the app" specifically matters for your deployment.


---

## Phase Q — QR-Code Registration

### Known gap: no seeding flow for `registration_qr_codes`
Migration 023 adds `registration_qr_codes` plus `lookup_registration_qr()` /
`claim_registration_qr()` RPCs, but this app has **no admin UI or generation
flow that creates rows in that table**. Until an admin "generate/print
student ID QR" feature exists, rows must be seeded manually (e.g. a one-off
`INSERT` run directly against the database — see `SETUP_GUIDE.md`).
`RegisterQrScan.jsx` (Phase 2) is designed to degrade gracefully when a
scanned code isn't in the table — it still lets registration proceed with
whatever the QR payload itself contained, rather than hard-blocking on an
unseeded table.

### Resolved spec contradiction (Phase 1 vs Phase 2 of the prompt)
Phase 1's original RPC spec said `lookup_registration_qr` should return
**nothing** once a code's `is_used = true`. Phase 2's UI spec calls for a
specific "This ID has already been registered" message when `is_used`
comes back true — which requires the RPC to actually return the row in
that case. Flagged to the requester, who confirmed: the RPC returns the
row (with `is_used = true`) instead of nothing. No additional sensitive
data is exposed by this change — same non-sensitive columns either way,
just with the boolean populated so the caller can distinguish "already
claimed" from "not found at all."

### A real bug found and fixed — ambiguous column reference
`registration_qr_codes` has a column literally named `code`. The original
Phase 1 draft of `lookup_registration_qr(code TEXT)` and
`claim_registration_qr(code TEXT, user_id INT)` referenced an unqualified
`code` inside each function body — ambiguous to Postgres between the
column and the parameter of the same name, which raises "column reference
'code' is ambiguous" **at call time**, not at `CREATE FUNCTION` time. This
wasn't visible from reading the SQL in isolation; it only surfaced while
tracing the Phase 6 end-to-end flow. Fixed by renaming both parameters to
`p_code` (and `user_id` to `p_user_id`, for consistency) in migration 023,
with matching updates to both `usersService.js` call sites
(`lookupRegistrationQr()`, `finalizeSelfRegistration()`'s claim call).

### QA pass (Phase 7) — code-level trace, not a live-database test run
No live Supabase project was available in this environment to execute
against, so this QA pass is a careful manual trace of each scenario
through the actual code paths (not an assumption-based checklist). Treat
this as "should work per the code as written," and verify against a real
project before shipping:

- **Manual registration (unchanged)**: `form.qrCode`/`form.profileIncomplete`
  stay at their empty/false defaults the whole time; `registerPatient()`
  writes `school_id_barcode: null` and `profile_incomplete: false` — same
  end state as before Phase Q, just via explicit columns instead of
  nonexistent ones.
- **QR registration, full data**: scan resolves via `lookup_registration_qr`
  (unused row), all fields prefill, `stepNext()`'s Step 2 validation
  passes normally since course/year are already filled, submission claims
  the code and sets `school_id_barcode`.
- **QR registration, missing course → skip → complete later**:
  `matchOption()` returns `''` when the scanned course doesn't match a
  `COURSES` entry, Step 2's Skip link clears course/year and sets
  `profile_incomplete: true`, Profile page shows the banner afterward, and
  saving course+year from `EditProfileModal` flips it back to `false`.
- **QR code reused twice**: second scan's `lookup_registration_qr` call
  returns the row with `is_used = true`, `RegisterQrScan` shows "This ID
  has already been registered," registration via that scan is blocked.
  (Note: this only gates the *scan* convenience path — someone who already
  knows the raw student number could still type it into the manual Step 1
  fields for a different account, exactly as was already possible before
  Phase Q. `patient_profiles.student_number` has no `UNIQUE` constraint in
  this schema, so that's a pre-existing gap, not one introduced or
  resolved by this work.)
- **Unseeded/unknown QR code**: `lookup_registration_qr` returns no row,
  `RegisterQrScan` still calls `onScanned(...)` with whatever the raw QR
  payload contained — registration is not hard-blocked.

### RLS re-check (Phase 7)
- `registration_qr_codes`: RLS enabled, **zero policies** — confirmed this
  denies all direct table access from `anon`/`authenticated`; the only
  access path is the two `SECURITY DEFINER` RPCs, which bypass RLS by
  running as the function owner. No table-level grants were added.
- `patient_profiles.profile_incomplete` / `users.school_id_barcode`: both
  covered by the existing "own row" `FOR ALL`/`FOR UPDATE` policies from
  migration 006 — this schema has no column-level RLS, so no new policy
  was needed for either new/reused column.

### Summary of Changes
QR-code registration for the clinic app: scan a student ID at registration
to pre-fill name/student number/course, an explicit "skip academic info,
finish later" path, persisted registration QR codes (lookup + claim RPCs),
a Profile-page banner + edit flow for finishing an incomplete profile, and
a manual "link your school ID" field for people who registered normally —
all while confirming the existing scan-to-login flow (Phase J) keeps
working end-to-end for QR-registered accounts, with **no scan ever
bypassing password entry**.

### Database Modifications
- **New table**: `registration_qr_codes` (migration 023) — `id, code
  (unique), student_number, full_name, course, year_level, raw_payload
  (jsonb), is_used, used_by_user_id (FK → users), created_at, used_at`. RLS
  enabled, zero policies (RPC-only access).
- **New functions**: `lookup_registration_qr(p_code)` (SECURITY DEFINER,
  `anon`+`authenticated`), `claim_registration_qr(p_code, p_user_id)`
  (SECURITY DEFINER, `authenticated` only) — migration 023.
- **New column**: `patient_profiles.profile_incomplete BOOLEAN NOT NULL
  DEFAULT false` — migration 023.
- No changes to any existing table's columns/constraints beyond that one
  addition; `users.school_id_barcode` (from migration 002) is reused, not
  altered.

### Known limitations
- No admin UI to generate/print `registration_qr_codes` rows — seeding is
  manual/SQL-only for now (see `SETUP_GUIDE.md`).
- `patient_profiles.student_number` has no `UNIQUE` constraint — a
  pre-existing gap unrelated to this feature, noted above under "QR code
  reused twice."
- `matchOption()`'s course/year-level matching against the fixed
  `COURSES`/`YEAR_LEVELS` dropdown lists is exact-match-first with a
  narrow digit fallback for year level only — a QR encoding a course name
  that doesn't closely match an existing option will leave that field
  blank for manual selection rather than guessing.

