import { supabase } from './supabaseClient'

// ── ARCHITECTURE NOTE (updated post-Phase-D) ──
// `users.auth_user_id` bridges public.users <-> auth.users (migration 001).
// Creating a *new* login-capable user now goes through the `create-user`
// Edge Function (supabase/functions/create-user/), which is the only place
// the service-role key is allowed to exist — see provisionUser() below.
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
  const { data, error } = await supabase.functions.invoke('create-user', {
    body: { email, name, role, mode, temporaryPassword },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data.authUserId
}

/**
 * Pre-login patient search (Emergency SOS form only) — calls the narrow
 * `search_patients_public` RPC (migration 004), which returns only
 * name + student_number, never a full profile. See that migration for
 * the reasoning and the flagged information-exposure tradeoff.
 */
export async function searchPatientsPublic(query) {
  if (!query || query.trim().length < 2) return []
  const { data, error } = await supabase.rpc('search_patients_public', { query: query.trim() })
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
 * Self-registration (Phase K). Creates a REAL Supabase Auth account via
 * `supabase.auth.signUp()` — unlike Maintenance's admin-provisioned users,
 * this is always safe to do purely client-side with the anon key, since
 * the person is only ever creating their own account.
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
 */
export async function registerPatient({ email, password, name, surname, givenName, phone, studentNumber, course, yearLevel }) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name, role: 'patient', surname, given_name: givenName, phone, student_number: studentNumber, course, year_level: yearLevel },
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

  if (data.session) {
    const user = await finalizeSelfRegistration(data.user)
    return { needsEmailConfirmation: false, user }
  }
  return { needsEmailConfirmation: true, user: null }
}

/**
 * Creates the `public.users` + `patient_profiles` rows for a freshly (or
 * newly-confirmed) authenticated self-registered user, using the
 * registration data stashed in their `user_metadata`. Idempotent-ish: if
 * the row already exists this will throw a unique-violation, which the
 * caller can treat as "already finalized, nothing to do."
 */
export async function finalizeSelfRegistration(authUser) {
  const m = authUser.user_metadata || {}
  const username = (authUser.email || '').split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase()

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      username,
      email: authUser.email,
      role: 'patient',
      name: m.name,
      phone: m.phone || null,
      password_hash: 'MANAGED_BY_SUPABASE_AUTH',
      is_active: true,
      auth_user_id: authUser.id,
    })
    .select()
    .single()
  if (error) throw error

  const { error: ppError } = await supabase.from('patient_profiles').insert({
    user_id: user.user_id,
    student_number: m.student_number,
    surname: m.surname,
    given_name: m.given_name,
    course: m.course || null,
    year_level: m.year_level || null,
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

  return user
}

const SELECT_WITH_PROFILES = `*, staff_profiles ( * ), staff_permissions ( * ), patient_profiles ( * )`

function flattenUser(row) {
  if (!row) return row
  const { staff_profiles, staff_permissions, patient_profiles, is_active, ...rest } = row
  return {
    ...rest,
    active: is_active,
    department: staff_profiles?.department ?? null,
    position: staff_profiles?.position ?? null,
    permissions: staff_permissions
      ? { print_inventory: staff_permissions.print_inventory, print_appointments: staff_permissions.print_appointments, print_health: staff_permissions.print_health }
      : null,
    student_number: patient_profiles?.student_number ?? null,
    course: patient_profiles?.course ?? null,
    year_level: patient_profiles?.year_level ?? null,
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
  const { data, error } = await supabase.from('users').select(SELECT_WITH_PROFILES).eq('email', email).single()
  if (error) throw error
  return flattenUser(data)
}

export async function getUserByAuthId(authUserId) {
  const { data, error } = await supabase.from('users').select(SELECT_WITH_PROFILES).eq('auth_user_id', authUserId).single()
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
  const { error } = await supabase.from('users').update({ auth_user_id: authUserId }).eq('user_id', row.user_id)
  if (error) throw error
  return { ...row, auth_user_id: authUserId }
}

/**
 * Inserts the profile rows for a user whose `auth.users` row already
/**
 * Inserts the `public.users` + profile rows only — does NOT create an
 * `auth.users` row (see the architecture note at the top of this file).
 * The new person can't sign in until that separate server-side step runs.
 */
export async function createUserProfile({ username, email, role, name, phone, department, position, studentNumber, course, yearLevel, authUserId }) {
  const { data: user, error } = await supabase
    .from('users')
    .insert({ username, email, role, name, phone: phone || null, password_hash: 'MANAGED_BY_SUPABASE_AUTH', is_active: true, auth_user_id: authUserId ?? null })
    .select()
    .single()
  if (error) throw error

  if (role === 'patient') {
    const { error: ppError } = await supabase.from('patient_profiles').insert({
      user_id: user.user_id,
      student_number: studentNumber,
      surname: name.split(' ').slice(-1)[0],
      given_name: name.split(' ').slice(0, -1).join(' ') || name,
      course: course || null,
      year_level: yearLevel || null,
    })
    if (ppError) throw ppError
  } else {
    const { error: spError } = await supabase.from('staff_profiles').insert({ user_id: user.user_id, department: department || null, position: position || null })
    if (spError) throw spError
    const { error: permError } = await supabase
      .from('staff_permissions')
      .insert({ user_id: user.user_id, print_inventory: false, print_appointments: false, print_health: false })
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

export async function deleteUser(id) {
  // ON DELETE CASCADE on staff_profiles/staff_permissions/patient_profiles
  // handles the profile-row cleanup automatically.
  const { error } = await supabase.from('users').delete().eq('user_id', id)
  if (error) throw error
}

export async function togglePermission(userId, key, value) {
  const { error } = await supabase.from('staff_permissions').update({ [key]: value }).eq('user_id', userId)
  if (error) throw error
}
