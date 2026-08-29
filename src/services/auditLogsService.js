import { supabase } from './supabaseClient'

export async function listAuditLogs({ from, to } = {}) {
  let query = supabase
    .from('audit_logs')
    // `role` is pulled alongside `name` so the Audit Trail page can offer
    // an Administrator/Staff/Patient filter without a second round trip —
    // see AuditTrailPage.jsx's roleFilter.
    .select('*, user:users!audit_logs_user_id_fkey ( name, role )')
    .order('created_at', { ascending: false })
  if (from) query = query.gte('created_at', from)
  if (to) query = query.lte('created_at', to)
  // Safety-net cap — from/to already narrow this down when a caller
  // passes them, but this is the system-wide audit trail, the one table
  // in this app most guaranteed to grow forever with normal use. A hard
  // limit here means a call made without a date range (or with an
  // unexpectedly wide one) can never balloon into fetching the entire
  // history at once.
  query = query.limit(500)
  const { data, error } = await query
  if (error) throw error
  // Prefers the actor-name/role snapshot taken at insert time (migration
  // 048) over the live `users` join — the snapshot survives the actor's
  // account being deleted later, where the live join would go null. The
  // join is kept purely as a fallback for any row written before that
  // migration whose account still happens to exist.
  return data.map((l) => ({ ...l, user_name: l.actor_name ?? l.user?.name ?? null, user_role: l.actor_role ?? l.user?.role ?? null }))
}

// NOTE: `ip_address` genuinely can't be captured client-side in a browser
// (the legacy prototype hardcoded '127.0.0.1', which was never real either).
// Real IP capture needs a server-side hook (e.g. a Supabase Edge Function
// reading the request header) — left NULL here rather than faking it.
//
// `actorRole` is optional and only meaningful when `userId` is null — it
// lets a caller who already knows the role (e.g. LoginPage.jsx's
// handleSubmit, which calls getRoleByEmail() a few lines earlier anyway)
// attach it directly, WITHOUT attaching a specific account. See migration
// 049: the snapshot_audit_log_actor() trigger only auto-derives
// actor_role from user_id when the caller didn't already supply one, so
// passing this never conflicts with the normal (userId provided) path.
//
// Deliberately does NOT chain .select() after .insert(). In Postgres, an
// INSERT ... RETURNING clause is subject to the table's SELECT policy on
// the row being returned — and audit_logs_select only allows admin/staff
// to read this table (by design: patients shouldn't be able to browse
// the whole audit trail). For every OTHER caller — a patient logging in,
// a patient resetting their own password, an anonymous pre-login
// PASSWORD_RESET_REQUESTED — that RETURNING step failed the SELECT check
// and rolled back the entire INSERT, so the log entry was never actually
// written at all, not just "written but not returned to the caller."
// Confirmed via the Network tab: a patient's LOGIN_SUCCESS insert came
// back 403 even though user_id correctly matched their own account,
// specifically because of this RETURNING step. No caller anywhere in
// this codebase actually uses the row this used to return (checked every
// addAuditLog() call site), so dropping it is a pure fix with no
// behavior change for the callers that were already working.
export async function addAuditLog({ userId, action, details, actorRole }) {
  const { error } = await supabase.from('audit_logs').insert({ user_id: userId, action, details, ip_address: null, actor_role: actorRole ?? null })
  if (error) throw error
}

// Best-effort wrapper for authentication events specifically (login,
// logout, password change/reset, email verification, denied access —
// see AuthContext.jsx and ProtectedRoute.jsx, the call sites for this).
// Those calls happen in the MIDDLE of a real, security-sensitive auth
// action — a transient audit-log failure (an RLS edge case on a brand
// new session, a network blip) must never surface as a broken login or
// a failed password reset. Swallows its own error (still visible in the
// console for debugging) instead of throwing, unlike addAuditLog above
// which intentionally DOES throw for its existing callers (Maintenance
// -> User Management), where the log entry is expected to succeed
// alongside an already-completed admin action.
export async function logAuthEvent({ userId, action, details, actorRole }) {
  try {
    await addAuditLog({ userId: userId ?? null, action, details, actorRole })
  } catch (err) {
    console.error('[AUTH_AUDIT_LOG_FAILED]', action, err.message)
  }
}

// Same best-effort shape as logAuthEvent above, for the Document Requests
// Logs tab (AuditTrailPage.jsx's DOCUMENT_ACTIONS): submit/approve/decline/
// claim in DocumentRequestsPage.jsx + MyRequestsPage.jsx, and print/
// download-as-PNG/download-as-Word in MyRequestsPage.jsx's detail modal.
// Those are all "the real action already happened, just record it" call
// sites — a transient insert failure here must never surface as a failed
// approval, a failed claim confirmation, or a blocked print/download, so
// this swallows its own error (still logged to the console) instead of
// throwing, same reasoning as logAuthEvent.
export async function logDocumentEvent({ userId, action, details }) {
  try {
    await addAuditLog({ userId: userId ?? null, action, details })
  } catch (err) {
    console.error('[DOCUMENT_AUDIT_LOG_FAILED]', action, err.message)
  }
}

// Same best-effort shape again, for the User Management Logs tab

// Same best-effort shape again, for the User Management Logs tab
// (AuditTrailPage.jsx's USER_MGMT_ACTIONS) — specifically the two
// call sites that AREN'T an admin explicitly acting in Maintenance
// (which already uses addAuditLog directly, since a log failure there
// SHOULD surface — see that function's own doc comment): a patient
// self-registering (REGISTER, in usersService.js's
// finalizeSelfRegistration) and anyone editing their OWN profile
// (EDIT_OWN_PROFILE, in ProfilePage.jsx's handleSaveProfile) — patient,
// staff, or admin alike, since Account Settings is the same page for
// all three roles. Both are "the real action already succeeded, just
// record it" moments, so a transient audit-log failure must never
// surface as a broken registration or a failed profile save.
export async function logUserMgmtEvent({ userId, action, details }) {
  try {
    await addAuditLog({ userId: userId ?? null, action, details })
  } catch (err) {
    console.error('[USER_MGMT_AUDIT_LOG_FAILED]', action, err.message)
  }
}

// Same best-effort shape again, for clinical/health-data actions:
// CONSULTATION_ADDED (written from ConsultationPage.jsx's
// handleSaveConsultation, right after the real consultation record is
// saved) and PATIENT_RECORD_VIEWED (written from PatientDetailModal.jsx
// whenever staff/admin opens a patient's record). A logging hiccup must
// never surface as a failed save for a staff member who just finished
// recording a patient visit, or block them from actually viewing the
// record they clicked into.
export async function logClinicalEvent({ userId, action, details }) {
  try {
    await addAuditLog({ userId: userId ?? null, action, details })
  } catch (err) {
    console.error('[CLINICAL_AUDIT_LOG_FAILED]', action, err.message)
  }
}

// Same best-effort shape again, for the System Configuration Logs tab
// (AuditTrailPage.jsx's SYSTEM_CONFIG_ACTIONS) — currently just the
// system backup/export action (see systemBackup.js's generateSystemBackup()
// and its call site in MaintenancePage.jsx's BackupTab). Permission
// changes already write UPDATE_PERMISSION via addAuditLog() directly
// (MaintenancePage.jsx's handleTogglePerm) and that tab just also
// filters for that same action code — no separate logger needed for it.
export async function logConfigEvent({ userId, action, details }) {
  try {
    await addAuditLog({ userId: userId ?? null, action, details })
  } catch (err) {
    console.error('[CONFIG_AUDIT_LOG_FAILED]', action, err.message)
  }
}