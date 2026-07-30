import { supabase } from './supabaseClient'

// Notifications target either a specific user OR a whole role (never both
// required — see the schema's CHECK (user_id IS NOT NULL OR target_role
// IS NOT NULL)). listForUser() fetches both kinds relevant to one person.
export async function listForUser(userId, role) {
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .or(`user_id.eq.${userId},target_role.eq.${role}`)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function countUnread(userId, role) {
  const { count, error } = await supabase
    .from('notifications')
    .select('*', { count: 'exact', head: true })
    .or(`user_id.eq.${userId},target_role.eq.${role}`)
    .eq('is_read', false)
  if (error) throw error
  return count ?? 0
}

export async function markRead(id) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).eq('notification_id', id)
  if (error) throw error
}

export async function markAllRead(userId, role) {
  const { error } = await supabase.from('notifications').update({ is_read: true }).or(`user_id.eq.${userId},target_role.eq.${role}`)
  if (error) throw error
}

/**
 * Same as notify(), but skips inserting if a notification with the exact
 * same message already exists for this target (any read state, no time
 * window). Used for state-based alerts (e.g. medicine expiration) that
 * have no discrete triggering event to hook — unlike a stock release,
 * "an item is still expired" isn't an action anyone took, so without this
 * guard the same alert would re-insert every time the checking page loads.
 */
export async function notifyIfNew({ targetUserId, targetRole, message, type = 'info', module }) {
  // Was a direct .select() against `notifications`, subject to the same
  // RLS blind spot as notify()'s old .select().single() — the caller
  // can't see rows addressed to someone else, so it silently concluded
  // "no duplicate" on every cross-role call (which is most of them),
  // defeating the point of this function. notification_exists() (migration
  // 022) is a narrow SECURITY DEFINER check that only returns a boolean,
  // not row contents.
  const { data: exists, error } = await supabase.rpc('notification_exists', {
    p_message: message,
    p_user_id: targetUserId ?? null,
    p_target_role: targetRole ?? null,
  })
  if (error) throw error
  if (exists) return
  return notify({ targetUserId, targetRole, message, type, module })
}

/**
 * targetUserId XOR targetRole — pass exactly one.
 * NOTE: `module` is stored as a full route path (e.g. '/document-requests')
 * rather than the bare page-key style suggested by the schema's inline
 * comment ("doc-requests, inventory, ...") — this app's NotificationsModal
 * calls `navigate(module)` directly on click, so a real path is more
 * useful than a key that would need mapping back to one.
 */
export async function notify({ targetUserId, targetRole, message, type = 'info', module }) {
  // Deliberately NOT .select().single() here — that would require the
  // CALLER to pass RLS's SELECT policy on the row they just inserted,
  // using their OWN role/user_id. notifications_select only allows
  // reading rows addressed to yourself (user_id = you) or your own role
  // (target_role = your role). The overwhelming majority of notify()
  // calls in this app are cross-role by design — a patient notifying
  // staff, an admin notifying a specific staff member, etc. — where the
  // caller's own identity never matches the row they're creating. In
  // Postgres, INSERT ... RETURNING is one atomic statement: when RLS
  // blocks the RETURNING read-back, the ENTIRE insert rolls back, not
  // just the returned data — meaning every cross-role notify() call was
  // silently failing to create the row at all, not just failing to
  // report success. Confirmed no caller anywhere in this codebase uses
  // notify()'s return value, so a plain insert with no RETURNING clause
  // is a safe, complete fix.
  const { error } = await supabase
    .from('notifications')
    .insert({ user_id: targetUserId ?? null, target_role: targetRole ?? null, message, type, module: module ?? null })
  if (error) throw error
}
