import { supabase } from './supabaseClient'
import { initialsFor } from '@features/maintenance/lib/userHelpers'
import { generateSchoolIdCode } from '@lib/schoolId'
import { invokeEdgeFunction } from './edgeFunctions'
import { logUserMgmtEvent } from './auditLogsService'
import { getAppUrl } from '@lib/appUrl'
import { isPersonnelNumber } from '@features/profile/lib/profileHelpers'

// ── ARCHITECTURE NOTE (updated post-Phase-D) ──
// `users.auth_user_id` bridges public.users <-> auth.users (migration 001).
// Creating a *new* login-capable user now goes through the `create-user`
// Edge Function (supabase/functions/create-user/), which is the only place
// the service-role key is allowed to exist — see provisionUser() below.
// Removing one goes through the matching `delete-user` Edge Function
// (supabase/functions/delete-user/) for the same reason — see
// deleteUser() below, which calls it before removing the public.users row.
// createUserProfile() itself still only ever writes public.users + profile
// rows; it accepts an optional `authUserId` so the caller (Maintenance's
// Add User flow) can pass in the UUID that provisionUser() just created,
// linking it immediately instead of waiting for the "link on first login"
// bridge in AuthContext.jsx.

/**
 * Calls the `create-user` Edge Function to provision a real, login-capable
 * Supabase Auth account. Requires the caller to be signed in as an admin —
 * enforced server-side by the function itself (see its source for the
 * full explanation of why this can't be done directly from the browser).
 *
 * mode: 'invite' (default) emails the new user a set-password link and
 * never generates a password in this app at all. mode: 'password' lets an
 * admin set a temporary password directly, for projects without email
 * sending configured — pass `temporaryPassword` in that case.
 */
export async function provisionUser({ email, name, role, mode = 'invite', temporaryPassword }) {
  // invokeEdgeFunction() (see edgeFunctions.js) reads the function's own
  // { error } response body and, separately, tells a network-level failure
  // apart from a real server rejection — a raw supabase.functions.invoke()
  // call collapses both into the same generic "Edge Function returned a
  // non-2xx status code", which is what was showing up as an unexplained
  // 400 in the console with no usable reason surfaced to the admin.
  const data = await invokeEdgeFunction('create-user', { email, name, role, mode, temporaryPassword })
  return data.authUserId
}

/**
 * Pre-login patient search (Emergency SOS form only) — calls the narrow
 * `search_patients_public` RPC (migration 004), which returns only
 * name + student_number, never a full profile. See that migration for
 * the reasoning and the flagged information-exposure tradeoff.
 */
export async function searchPatientsPublic(query) {
  // An empty/short query is treated as "show me everyone" (the RPC's own
  // ILIKE '%' || query || '%' matches all patients when query is ''),
  // not as "return nothing" — this used to hard-block any query under 2
  // characters, which silently broke every "browse all patients" use
  // case regardless of what the calling component did.
  const { data, error } = await supabase.rpc('search_patients_public', { query: (query || '').trim() })
  if (error) throw error
  return data || []
}

/**
 * QR/barcode login lookup (Phase J) — resolves a scanned code to an
 * account's email ONLY, via the narrow `lookup_email_by_school_id` RPC
 * (migration 002). Callable while signed out. Never returns a session or
 * bypasses the password check — see that migration's comments for why.
 */
export async function lookupEmailBySchoolId(code) {
  const { data, error } = await supabase.rpc('lookup_email_by_school_id', { code })
  if (error) throw error
  return data || null
}

/**
 * Login lockout escalation (Phase R) — called by LoginPage once a given
 * email has reached its 10th Tier-2 failed attempt (5 attempts -> 60s
 * cooldown, then 10 fresh attempts -> disable). Runs as `anon`
 * (pre-login, no session yet), so it goes through the SECURITY DEFINER
 * `disable_account_after_lockout` RPC (migration 024) rather than a
 * direct UPDATE — `users_update` RLS (migration 001) only allows
 * `authenticated`. Same trust model as lookupEmailBySchoolId above: a
 * practical deterrent, not a hardened server-side brute-force guard.
 */
export async function disableAccountAfterLockout(email) {
  const { error } = await supabase.rpc('disable_account_after_lockout', { p_email: email })
  if (error) throw error
}

/**
 * Login lockout escalation (Phase R) — checked by AuthContext.signIn()
 * immediately after a CORRECT password, so a disabled account (whether
 * disabled by disableAccountAfterLockout above, or by an admin's
 * Activate/Deactivate toggle in Maintenance -> User Management) still
 * can't complete sign-in. Supabase Auth's own signInWithPassword has no
 * concept of `public.users.is_active` on its own. Also called upfront by
 * LoginPage before attempting sign-in at all, so a disabled account
 * shows the same clear message regardless of which password was typed.
 */
export async function checkAccountActive(email) {
  const { data, error } = await supabase.rpc('lookup_is_active_by_email', { p_email: email })
  if (error) throw error
  return data
}

/**
 * Login lockout exemption (Phase S) — checked by LoginPage before
 * applying ANY of the Tier 1/Tier 2 lockout or auto-disable logic.
 * Admin accounts are fully exempt: only an admin can re-enable a
 * disabled account, so letting the lockout system disable the only
 * admin would be a real denial-of-service risk (deliberately typing
 * wrong passwords for a known/guessed admin email would lock everyone
 * out of user management with no one left who could undo it).
 */
export async function getRoleByEmail(email) {
  const { data, error } = await supabase.rpc('lookup_role_by_email', { p_email: email })
  if (error) throw error
  return data || null
}

/**
 * Registration QR lookup (Phase Q) — resolves a scanned student-ID code
 * against `registration_qr_codes` via the narrow `lookup_registration_qr`
 * RPC (migration 023). Callable while signed out (registration happens
 * before any account/session exists). Returns `null` if the code isn't in
 * the table at all — that's expected and NOT an error: this app has no
 * seeding flow yet (see KNOWN_ISSUES.md), so `RegisterQrScan` treats "not
 * found" as "proceed with whatever the QR payload itself contained," not
 * as a hard failure. Returns `{ ..., is_used: true }` if the code was
 * already claimed by an earlier registration, which the caller uses to
 * show a distinct "already registered" message.
 */
export async function lookupRegistrationQr(code) {
  const { data, error } = await supabase.rpc('lookup_registration_qr', { p_code: code })
  if (error) throw error
  return data?.[0] || null
}
/**
 * Registration duplicate check (Phase Q, extended) — catches the case
 * `lookup_registration_qr`'s is_used flag can't: someone registering with
 * a DIFFERENT QR code that happens to encode the SAME student number as
 * an already-registered account. Checked separately from is_used so both
 * paths are covered.
 */
export async function checkStudentNumberRegistered(studentNumber) {
  const { data, error } = await supabase.rpc('check_student_number_registered', { p_student_number: studentNumber })
  if (error) throw error
  return !!data
}

/**
 * Self-registration (Phase K, extended in Phase Q). Creates a REAL
 * Supabase Auth account via `supabase.auth.signUp()` — unlike
 * Maintenance's admin-provisioned users, this is always safe to do purely
 * client-side with the anon key, since the person is only ever creating
 * their own account.
 *
 * Registration data is stashed in the auth user's `user_metadata` at
 * signUp time. If the project has email confirmation OFF, signUp()
 * returns an active session immediately, and this function finishes
 * creating the `public.users`/`patient_profiles` rows right away. If
 * confirmation is ON, there's no session yet (RLS would reject the
 * inserts), so `needsEmailConfirmation: true` is returned instead, and the
 * rows get created later — see `finalizeSelfRegistration()`, called from
 * `AuthContext.loadProfile()` the first time this person actually logs in
 * after confirming their email.
 *
 * Phase Q additions — both optional, both no-ops when omitted (manual
 * registration is unaffected):
 * - `qrCode`: the normalized code from a scanned/looked-up registration
 *   QR (migration 023). Stashed in metadata like everything else here so
 *   it survives the email-confirmation-pending case too, then written to
 *   `users.school_id_barcode` and claimed via `claim_registration_qr` in
 *   `finalizeSelfRegistration()` — this is what makes the scan-to-login
 *   flow (`lookup_email_by_school_id`, migration 002) work for this
 *   account immediately afterward.
 * - `profileIncomplete`: set when the person used Step 2's "Skip for now"
 *   path. Written to `patient_profiles.profile_incomplete`.
 */
export async function registerPatient({ email, password, username, name, surname, givenName, phone, studentNumber, course, yearLevel, qrCode, profileIncomplete }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Without this, Supabase falls back to the project's default Site
      // URL (Dashboard → Authentication → URL Configuration) for where
      // the confirmation link sends people — which may not be set, or
      // may point at a different deployment than the one they actually
      // registered from. Pinning it to wherever THIS app is currently
      // running means the link always lands back on the right site.
      // (That URL still has to be added to the project's Redirect URLs
      // allow-list in the Dashboard, or Supabase rejects it outright —
      // see this function's own module-level comment for the full
      // email-confirmation setup this depends on.)
      //
      // ?confirmed=1 is OUR OWN query param, not Supabase's — it's what
      // LoginPage.jsx checks to show a clean "Your account has been
      // activated!" screen instead of the normal login form or an
      // instant silent redirect to the dashboard. It survives
      // supabase-js's own post-confirmation cleanup (which clears ITS
      // token hash/code from the URL once the session is established,
      // but leaves an unrelated query param we added alone), which a
      // check for Supabase's own `type=signup` param wouldn't reliably
      // do, since that can already be gone by the time this app's own
      // code gets to look at the URL.
      emailRedirectTo: `${getAppUrl()}/login?confirmed=1`,
      data: {
        username,
        name,
        role: 'patient',
        surname,
        given_name: givenName,
        phone,
        student_number: studentNumber,
        course,
        year_level: yearLevel,
        qr_code: qrCode || null,
        profile_incomplete: !!profileIncomplete,
      },
    },
  })
  if (error) throw error

  // Supabase's own anti-enumeration behavior: signing up with an email
  // that's ALREADY registered returns a 200 with { user, session: null }
  // and no error at all — not a thrown exception, not `data.session`
  // being set either. The only tell is `identities` coming back empty.
  // Without this check, a duplicate attempt silently fell through to
  // "needsEmailConfirmation: true" — telling someone to check an email
  // that was never sent, for an account that was never created. This is
  // the most likely cause of "registration doesn't save."
  if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('An account with this email already exists. Please sign in instead.')
  }

  // `data.session` being set here means Supabase decided this account
  // needed no confirmation at all and signed it straight in — which only
  // happens when the project's "Confirm email" setting (Dashboard →
  // Authentication → Sign In / Providers → Email) is turned OFF. With it
  // ON (required for the "verify email before the account exists"
  // behavior this whole function is built around), `data.session` is
  // always null here instead, and this branch never runs — the account
  // only gets finalized into public.users/patient_profiles later, from
  // AuthContext.jsx's loadProfile(), once they've actually clicked the
  // confirmation link and a real session exists. This branch is kept
  // only so registration still works (just without the email-gate) if
  // that project setting is ever off — not the intended path.
  if (data.session) {
    const user = await finalizeSelfRegistration(data.user)
    // Registering shouldn't silently log the person in — sign this
    // auto-created session back out so LoginPage's isAuthenticated check
    // stays false and they land on the sign-in form (with their email
    // prefilled, see RegisterModal/LoginPage's onRegistered handoff) to
    // enter their password themselves, same as any other first sign-in.
    await supabase.auth.signOut()
    return { needsEmailConfirmation: false, user }
  }
  return { needsEmailConfirmation: true, user: null }
}

// Re-sends the confirmation email for an account that hasn't clicked its
// link yet — used by LoginPage.jsx when a sign-in attempt fails with
// Supabase's "Email not confirmed" error, so someone who lost the
// original email (or let it expire) isn't stuck.
export async function resendConfirmationEmail(email) {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${getAppUrl()}/login?confirmed=1` },
  })
  if (error) throw error
}

/**
 * Creates the `public.users` + `patient_profiles` rows for a freshly (or
 * newly-confirmed) authenticated self-registered user, using the
 * registration data stashed in their `user_metadata`. Idempotent-ish: if
 * the row already exists this will throw a unique-violation, which the
 * caller can treat as "already finalized, nothing to do."
 *
 * Phase Q: also writes `school_id_barcode` (from `m.qr_code`, if the
 * person registered via QR scan) and `profile_incomplete` (from
 * `m.profile_incomplete`), then claims the scanned code via
 * `claim_registration_qr` so it can't be reused to prefill a second
 * registration. Claiming happens last and is treated as non-critical —
 * failing to mark a row "used" doesn't undo an already-created account,
 * and `school_id_barcode` (set moments earlier, in the same function) is
 * what actually makes scan-to-login work, not the claim itself.
 */
export async function finalizeSelfRegistration(authUser) {
  const m = authUser.user_metadata || {}
  // Prefer the username chosen at registration (RegisterModal Step 3,
  // stashed in user_metadata the same way name/surname/etc. already are)
  // over auto-deriving one from the email's local part — the derived
  // version is still the fallback for any path that doesn't collect one
  // (e.g. a metadata-less edge case), not removed outright. Same
  // VARCHAR(50)-safe sanitization applied either way, and same
  // capped-to-50 reasoning as before: a long chosen username shouldn't
  // outright break registration with a column-length DB error.
    const baseUsername = (m.username || (authUser.email || '').split('@')[0])
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase()
    .slice(0, 50)

  const maxUsernameAttempts = 8
  let user
  for (let attempt = 1; attempt <= maxUsernameAttempts; attempt++) {
    const suffix = attempt === 1 ? '' : String(attempt)
    const username = attempt === 1 ? baseUsername : (baseUsername.slice(0, 50 - suffix.length) + suffix)

    const { data, error } = await supabase
      .from('users')
      .insert({
        username,
        email: authUser.email,
        role: 'patient',
        name: m.name,
        phone: m.phone ? String(m.phone).slice(0, 20) : null,
        password_hash: 'MANAGED_BY_SUPABASE_AUTH',
        is_active: true,
        auth_user_id: authUser.id,
        school_id_barcode: m.qr_code ? String(m.qr_code).slice(0, 50) : generateSchoolIdCode(),
      })
      .select()
      .single()

    if (!error) {
      user = data
      break
    }

    const isUsernameCollision = error.code === '23505' && /users_username_key/.test(error.message || '')
    if (!isUsernameCollision || attempt === maxUsernameAttempts) throw error
  }

  const { error: ppError } = await supabase.from('patient_profiles').insert({
    user_id: user.user_id,
    student_number: m.student_number,
    surname: m.surname,
    given_name: m.given_name,
    course: m.course || null,
    year_level: m.year_level || null,
    profile_incomplete: !!m.profile_incomplete,
  })
  if (ppError) {
    // Half-registered is worse than not-registered: the `users` row we
    // just created would otherwise dangle with no `patient_profiles` row
    // (breaking anything that assumes patients always have one) AND
    // block every future registration attempt with this email/username
    // (unique-constraint errors that have nothing to do with the actual
    // problem). Clean it up so the person can simply try again.
    await supabase.from('users').delete().eq('user_id', user.user_id)
    throw ppError
  }

  if (m.qr_code) {
    try {
      const { error: claimError } = await supabase.rpc('claim_registration_qr', {
        p_code: m.qr_code,
        p_user_id: user.user_id,
        p_student_number: m.student_number || null,
        p_full_name: m.name || null,
        p_course: m.course || null,
        p_year_level: m.year_level || null,
      })
      if (claimError) throw claimError
    } catch (err) {
      // Non-critical to the REGISTRATION itself — see doc comment above,
      // the account is fully created and scan-to-login-capable either
      // way. But this used to be a bare `catch {}` with nothing logged
      // at all, which meant a genuine, reproducible failure writing to
      // registration_qr_codes (a stale PostgREST schema cache not yet
      // seeing the 6-arg overload from 025_registration_qr_upsert.sql,
      // an RLS/grant issue, anything) looked IDENTICAL to it simply
      // never being called — impossible to tell apart from the outside.
      // Logging here doesn't fix an underlying DB-side problem by
      // itself, but it's what turns "the QR code isn't saving, for some
      // reason" into an actual, checkable error message.
      console.error('claim_registration_qr failed — registration_qr_codes was not written for this scan:', err.message)
    }
  }

  // ACTION_STYLES/USER_MGMT_ACTIONS on AuditTrailPage.jsx were already
  // set up to display a REGISTER entry, but nothing ever actually wrote
  // one — every patient self-registration was invisible in the audit
  // trail. Written here (not in RegisterModal.jsx) so it's covered
  // exactly once regardless of which of the two paths that lead here
  // actually ran: an immediate account (email confirmation OFF, this
  // function called straight from registerPatient()) or a deferred one
  // (confirmation ON, this function instead called later from
  // AuthContext.loadProfile() the first time the confirmed link is
  // followed).
  // isPersonnelNumber() is the same letters-prefix-vs-plain-digits check
  // Account Settings already uses (profileHelpers.js) to tell a campus
  // Personnel account apart from a Student one from the stored User/ID
  // Number alone — there's no separate patient-type column to read
  // instead. Included here per the requirement that the Audit Trail
  // preserve the Student/Personnel distinction for patient actions, not
  // just a generic "patient."
  const patientKind = isPersonnelNumber(m.student_number) ? 'Personnel' : 'Student'
  logUserMgmtEvent({
    userId: user.user_id,
    action: 'REGISTER',
    details: `${m.name || user.name} self-registered as a patient (${patientKind}${m.student_number ? ` — ${m.student_number}` : ', no ID number'})`,
  })

  return user
}

const SELECT_WITH_PROFILES = `*, staff_profiles ( * ), staff_permissions ( * ), patient_profiles ( * )`

function flattenUser(row) {
  if (!row) return row
  const { staff_profiles, staff_permissions, patient_profiles, is_active, ...rest } = row
  return {
    ...rest,
    active: is_active,
    // Fall back to computed initials from the name whenever the DB
    // column is empty (true for most patient self-registrations, and any
    // account older than the Maintenance "Add User" initials feature) —
    // this is the single place every avatar-showing component reads
    // from, so fixing it here fixes every "?" avatar across the app.
    avatar_initials: row.avatar_initials || initialsFor(row.name || '?'),    department: staff_profiles?.department ?? null,
    position: staff_profiles?.position ?? null,
    staff_id_number: staff_profiles?.staff_id_number ?? null,
    permissions: staff_permissions
? { print_inventory: staff_permissions.print_inventory, print_documents: staff_permissions.print_documents, print_health: staff_permissions.print_health, delete_logs: staff_permissions.delete_logs, reset_reports: staff_permissions.reset_reports }      : null,
    student_number: patient_profiles?.student_number ?? null,
    course: patient_profiles?.course ?? null,
    year_level: patient_profiles?.year_level ?? null,
    // Registration (registerPatient) already saves these to
    // patient_profiles.surname/given_name, and EditProfileModal +
    // ProfilePage's handleSaveProfile already read/write them under
    // these exact keys — flattenUser was just never actually mapping
    // them onto the returned object, so both the read-only Personal Info
    // view and the Edit modal's pre-filled fields always showed blank
    // ("—") regardless of what was actually saved at registration.
    surname: patient_profiles?.surname ?? null,
    givenName: patient_profiles?.given_name ?? null,
    // Every field below is a real patient_profiles column that
    // EditProfileModal/handleSaveProfile already correctly save — this
    // was the same bug as surname/given_name above, just for the rest
    // of the Personal Info form: the save always worked, but none of
    // these ever made it back onto the object every page actually
    // reads, so they reverted to blank on the very next load/refresh —
    // indistinguishable from "the edit didn't save" to anyone testing
    // it, even though the database had the right value the whole time.
    middle_initial: patient_profiles?.middle_initial ?? null,
    suffix: patient_profiles?.suffix ?? null,
    date_of_birth: patient_profiles?.date_of_birth ?? null,
    birth_place: patient_profiles?.birth_place ?? null,
    gender: patient_profiles?.gender ?? null,
    civil_status: patient_profiles?.civil_status ?? null,
    religion: patient_profiles?.religion ?? null,
    nationality: patient_profiles?.nationality ?? null,
    blood_type: patient_profiles?.blood_type ?? null,
    addr_region: patient_profiles?.addr_region ?? null,
    addr_province: patient_profiles?.addr_province ?? null,
    addr_city: patient_profiles?.addr_city ?? null,
    addr_barangay: patient_profiles?.addr_barangay ?? null,
    addr_zip: patient_profiles?.addr_zip ?? null,
    // Phase Q: surfaced so ProfilePage can show the "finish your profile"
    // banner. `?? false` (not `?? null`) — the column is NOT NULL with a
    // default, so `false` is the only meaningful "no row / not set" value.
    profile_incomplete: patient_profiles?.profile_incomplete ?? false,
    parent_name: patient_profiles?.parent_name ?? null,
    parent_phone: patient_profiles?.parent_phone ?? null,
    parent_phone2: patient_profiles?.parent_phone_2 ?? null,
    parent_relation: patient_profiles?.parent_relation ?? null,
    guardian_address: patient_profiles?.guardian_address ?? null,
    father_name: patient_profiles?.father_name ?? null,
    father_phone: patient_profiles?.father_phone ?? null,
    father_address: patient_profiles?.father_address ?? null,
    mother_name: patient_profiles?.mother_name ?? null,
    mother_phone: patient_profiles?.mother_phone ?? null,
    mother_address: patient_profiles?.mother_address ?? null,
  }
}

export async function listUsers() {
  const { data, error } = await supabase.from('users').select(SELECT_WITH_PROFILES).order('name')
  if (error) throw error
  return data.map(flattenUser)
}

export async function getUserByEmail(email) {
  // Case-insensitive on purpose: a casing mismatch between what Supabase
  // Auth hands back (authUser.email) and whatever case public.users.email
  // happens to be stored in (e.g. an account created via direct SQL, or
  // before this app consistently lowercased on insert) used to make an
  // existing account look unregistered to this exact-match query — which
  // then sent AuthContext.jsx's loadProfile() down the "create a new
  // account" path for someone who already had one, producing a duplicate
  // key error on users_username_key instead of just finding their row.
  //
  // ilike treats `%` and `_` as wildcards — and `_` is a completely
  // normal, common character in real email addresses (e.g.
  // "john_doe@gmail.com") — so both are escaped first. Without this, a
  // lookup for "john_doe@gmail.com" could also match "johnxdoe@gmail.com"
  // (any single character in place of the escaped `_`), silently
  // returning the wrong person's account.
  const escapedEmail = email.replace(/[%_]/g, (ch) => `\\${ch}`)
  const { data, error } = await supabase.from('users').select(SELECT_WITH_PROFILES).ilike('email', escapedEmail).maybeSingle()
  if (error) throw error
  return flattenUser(data)
}

// Used by ForgotPasswordModal.jsx, called from an anon (not-yet-signed-in)
// session — getUserByEmail above can't be reused there since users_select
// is `TO authenticated` only, so RLS would silently return zero rows for
// EVERY email, registered or not, useless for telling them apart. This
// calls a SECURITY DEFINER RPC (email_is_registered, see
// 044_email_is_registered_rpc.sql) that bypasses RLS internally but only
// ever returns a plain boolean — never any other column.
export async function checkEmailRegistered(email) {
  const { data, error } = await supabase.rpc('email_is_registered', { p_email: email })
  if (error) throw error
  return !!data
}

// ── Quick-login PIN (see 045_pin_login.sql) ──
// setOwnPin/clearOwnPin/hasOwnPin all act on the CURRENTLY signed-in
// user's own account (auth.uid()-scoped, enforced inside each RPC) —
// used from Account Settings, where the person is already logged in.
export async function setOwnPin(pin) {
  const { error } = await supabase.rpc('set_own_pin', { p_pin: pin })
  if (error) throw error
}
export async function clearOwnPin() {
  const { error } = await supabase.rpc('clear_own_pin')
  if (error) throw error
}
export async function hasOwnPin() {
  const { data, error } = await supabase.rpc('has_own_pin')
  if (error) throw error
  return !!data
}
// Pre-login — checked by LoginPage.jsx right after a successful QR scan
// to decide whether to show a PIN pad or fall back to the normal
// password field, for whichever email the scan just identified.
export async function checkEmailHasPin(email) {
  const { data, error } = await supabase.rpc('email_has_pin', { p_email: email })
  if (error) throw error
  return !!data
}

export async function getUserByAuthId(authUserId) {
  const { data, error } = await supabase.from('users').select(SELECT_WITH_PROFILES).eq('auth_user_id', authUserId).maybeSingle()
  if (error) throw error
  return flattenUser(data)
}

/**
 * One-time bridge: if this user's `auth_user_id` isn't set yet (first
 * login after the Phase A migration, or first login ever for a
 * freshly-provisioned account), link it to the current Supabase Auth
 * session. Safe to call on every login — it's a no-op once already linked.
 */
export async function linkAuthUserIfNeeded(row, authUserId) {
  if (!row || row.auth_user_id === authUserId) return row
  // Was a plain client-side `.update({ auth_user_id }).eq('user_id', ...)`
  // — that silently affected ZERO rows (no error thrown by Supabase JS
  // either way) whenever the UPDATE's RLS USING clause didn't match this
  // row, most commonly an exact-case mismatch between what's stored in
  // `public.users.email` and Supabase Auth's own auth.email() for the
  // same account. This function then optimistically returned
  // `{...row, auth_user_id: authUserId}` as if linking had worked, when
  // `auth_user_id` was never actually written — silently breaking every
  // RLS policy keyed off "is this my own row" for that account from then
  // on (most visibly: that same account's own LOGIN_SUCCESS/LOGOUT audit
  // log writes getting rejected with a 403 — see migration 050's comment
  // for the full chain).
  //
  // link_current_auth_user() (migration 050) does the same update as a
  // SECURITY DEFINER function matching case-INSENSITIVELY on email —
  // fixing the mismatch instead of just working around it — and returns
  // the linked user_id, so a genuine failure (no users row shares this
  // session's email at all) is now something this can actually detect
  // and surface, instead of pretending to succeed.
  const { data: linkedUserId, error } = await supabase.rpc('link_current_auth_user')
  if (error) throw error
  if (!linkedUserId) {
    throw new Error("Couldn't link your account to this login session — please contact an administrator.")
  }
  return { ...row, auth_user_id: authUserId }
}


/**
 * Inserts the `public.users` + profile rows only — does NOT create an
 * `auth.users` row (see the architecture note at the top of this file).
 * The new person can't sign in until that separate server-side step runs.
 */
export async function createUserProfile({ username, email, role, name, surname, givenName, phone, department, position, studentNumber, course, yearLevel, authUserId, schoolIdBarcode, staffIdNumber }) {
  const { data: user, error } = await supabase
    .from('users')
    .insert({ username, email, role, name, phone: phone || null, password_hash: 'MANAGED_BY_SUPABASE_AUTH', is_active: true, auth_user_id: authUserId ?? null, school_id_barcode: schoolIdBarcode ?? null })
    .select()
    .single()
  if (error) throw error

  if (role === 'patient') {
    const { error: ppError } = await supabase.from('patient_profiles').insert({
      user_id: user.user_id,
      student_number: studentNumber,
      // AddUserModal now collects these directly (Surname/First Name
      // fields, not one freeform "Full Name" input) — prefer them when
      // given. The name.split(' ') guess is kept only as a fallback for
      // any other caller that still passes just `name`, so it degrades
      // gracefully rather than breaking, but is no longer how this gets
      // populated from the actual Add User form.
      surname: surname || name.split(' ').slice(-1)[0],
      given_name: givenName || name.split(' ').slice(0, -1).join(' ') || name,
      course: course || null,
      year_level: yearLevel || null,
    })
    if (ppError) throw ppError
  } else {
    const { error: spError } = await supabase.from('staff_profiles').insert({ user_id: user.user_id, department: department || null, position: position || null, staff_id_number: staffIdNumber ?? null })
    if (spError) throw spError
    const { error: permError } = await supabase
      .from('staff_permissions')
      .insert({ user_id: user.user_id, print_inventory: false, print_documents: false, print_health: false })
    if (permError) throw permError
  }

  return getUserByEmail(email)
}

export async function updateUser(id, patch) {
  const { error } = await supabase.from('users').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', id)
  if (error) throw error
}

export async function updateStaffProfile(id, patch) {
  const { error } = await supabase.from('staff_profiles').update(patch).eq('user_id', id)
  if (error) throw error
}

export async function updatePatientProfile(id, patch) {
  const { error } = await supabase.from('patient_profiles').update(patch).eq('user_id', id)
  if (error) throw error
}

export async function setActive(id, active) {
  const { error } = await supabase.from('users').update({ is_active: active }).eq('user_id', id)
  if (error) throw error
}

export async function deleteUser(userId) {
  // Before deleting, backfill unregistered_patient_name on any of this
  // person's existing consultations that don't already have one — the
  // FK's ON DELETE SET NULL is about to null out patient_id on those
  // rows, and the consultations_patient_identity_check CHECK constraint
  // (added for Phase Q's unregistered-patient support) requires at least
  // one of patient_id/unregistered_patient_name to stay non-null. Without
  // this, deleting any patient who has consultation history fails
  // outright with a constraint violation.
  const { data: user } = await supabase.from('users').select('name, auth_user_id').eq('user_id', userId).single()
  if (user?.name) {
    await supabase
      .from('consultations')
      .update({ unregistered_patient_name: user.name })
      .eq('patient_id', userId)
      .is('unregistered_patient_name', null)
  }

  // Removing only the public.users row left the person's actual
  // Supabase Auth account untouched — "deleted" in Maintenance, but
  // still able to log in, since nothing had actually revoked their
  // credentials. Calling delete-user/ FIRST (before touching
  // public.users) removes the real auth.users account with the
  // service-role key the browser can never hold directly; only once
  // that succeeds does the public.users row get removed, so a failure
  // here leaves both intact rather than deleting the profile while
  // leaving a live, now-orphaned login behind.
  if (user?.auth_user_id) {
    // See provisionUser() above for why this goes through
    // invokeEdgeFunction() rather than calling supabase.functions.invoke()
    // directly — this specific call is the one that was showing up in the
    // console as "POST .../delete-user 400 (Bad Request)" with no further
    // explanation; this surfaces the function's actual reason (e.g. an
    // expired session after a connectivity drop, or "Forbidden") in the
    // toast instead.
    await invokeEdgeFunction('delete-user', { authUserId: user.auth_user_id, userId })
  }

  const { error } = await supabase.from('users').delete().eq('user_id', userId)
  if (error) throw error
}

export async function togglePermission(userId, key, value) {
  const { error } = await supabase.from('staff_permissions').update({ [key]: value }).eq('user_id', userId)
  if (error) throw error
}

/**
 * Admin "change password" for any user (System Management -> User
 * Management). Same reasoning as deleteUser() above — public.users has
 * no password of its own to update (Supabase Auth owns that, in
 * auth.users), and the browser can never safely hold the service-role
 * key that operation requires, so this goes through the
 * reset-user-password/ Edge Function instead of a direct table write.
 */
export async function resetUserPassword(userId, newPassword) {
  const { data: user, error: lookupError } = await supabase
    .from('users')
    .select('auth_user_id')
    .eq('user_id', userId)
    .single()
  if (lookupError) throw lookupError
  if (!user?.auth_user_id) throw new Error('This user has no linked login account.')

    await invokeEdgeFunction('reset-user-password', { authUserId: user.auth_user_id, newPassword })
}