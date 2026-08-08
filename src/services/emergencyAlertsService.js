import { supabase } from './supabaseClient'
import { formatPHPhone } from '@features/emergency-alerts/lib/smsHelpers'

// Post-Phase-A-migration: `emergency_alerts.sms_sent` is now a real column
// (migration 001), and `patient_profiles.parent_phone_2` gives the SMS
// Composer's second-phone display slot real data to show. No more derived
// "notified" flag or permanently-empty UI elements.

const SELECT_ALERT = `
  *,
  reporter:users!emergency_alerts_reported_by_fkey ( name ),
  acknowledger:users!emergency_alerts_acknowledged_by_fkey ( name )
`

function flattenAlert(row) {
  if (!row) return row
  const { reporter, acknowledger, ...rest } = row
  return { ...rest, reporter_name: reporter?.name ?? 'Deleted User', acknowledged_by_name: acknowledger?.name ?? null } // reported_by is SET NULL on user deletion (migration 019); acknowledged_by staying null->blank is fine, it's optional metadata not a primary display field
}

export async function listEmergencyAlerts() {
  // Capped — every past incident stays in this table forever, so an
  // unbounded fetch only gets slower the longer the clinic uses this
  // system. 200 covers a very generous amount of recent history for a
  // feature that's realistically about current/recent alerts, not a
  // full multi-year archive.
  const { data, error } = await supabase.from('emergency_alerts').select(SELECT_ALERT).order('created_at', { ascending: false }).limit(200)
  if (error) throw error
  return data.map(flattenAlert)
}

/**
 * Single-row fetch with the same joins as listEmergencyAlerts — needed
 * because a Supabase realtime INSERT payload only ever carries the raw
 * table row (reported_by as a bare integer, no joined name), not the
 * SELECT_ALERT shape the UI actually needs to display.
 */
export async function getAlertById(id) {
  const { data, error } = await supabase.from('emergency_alerts').select(SELECT_ALERT).eq('emergency_alert_id', id).maybeSingle()
  if (error) throw error
  return flattenAlert(data)
}

export async function createEmergencyAlert({ reportedBy, subjectId, subjectStudentNum, subjectName, emergencyType, location, description }) {
  const { data, error } = await supabase
    .from('emergency_alerts')
    .insert({
      reported_by: reportedBy,
      subject_id: subjectId ?? null,
      subject_student_num: subjectStudentNum ?? null,
      subject_name: subjectName,
      emergency_type: emergencyType,
      location,
      description,
      status: 'Active',
    })

  if (error) throw error
  return flattenAlert(data)
}

export async function acknowledgeAlert(id, acknowledgedBy) {
  const { data, error } = await supabase
    .from('emergency_alerts')
    .update({ status: 'Acknowledged', acknowledged_by: acknowledgedBy })
    .eq('emergency_alert_id', id)
    .select(SELECT_ALERT)
    .single()
  if (error) throw error
  return flattenAlert(data)
}

export async function resolveAlert(id) {
  const { data, error } = await supabase
    .from('emergency_alerts')
    .update({ status: 'Resolved', resolved_at: new Date().toISOString() })
    .eq('emergency_alert_id', id)
    .select(SELECT_ALERT)
    .single()
  if (error) throw error
  return flattenAlert(data)
}

// Row-level security (migration 028) is what actually enforces this —
// admin, or staff with the delete_logs permission (Maintenance ->
// Staff Permissions). If the caller doesn't qualify, Postgres simply
// deletes zero rows rather than raising an error, so this checks the
// count explicitly and throws — without that check, an unauthorized
// attempt would silently appear to succeed in the UI while nothing was
// actually removed.
export async function deleteEmergencyAlerts(ids) {
  const { error, count } = await supabase.from('emergency_alerts').delete({ count: 'exact' }).in('emergency_alert_id', ids)
  if (error) throw error
  if (count === 0) throw new Error("You don't have permission to delete alert log entries.")
  return count
}

export async function listSmsLog() {
  // Same reasoning as listEmergencyAlerts() above — unbounded before,
  // only ever grows.
  const { data, error } = await supabase
    .from('sms_log')
    .select('*, sender:users!sms_log_sent_by_fkey ( name )')
    .order('sent_at', { ascending: false })
    .limit(200)
  if (error) throw error
  return data.map((s) => ({ ...s, sent_by_name: s.sender?.name ?? null }))
}

// Same reasoning as deleteEmergencyAlerts() above.
export async function deleteSmsLogs(ids) {
  const { error, count } = await supabase.from('sms_log').delete({ count: 'exact' }).in('sms_log_id', ids)
  if (error) throw error
  if (count === 0) throw new Error("You don't have permission to delete SMS log entries.")
  return count
}

/**
 * Logs the SMS and, if it's linked to an emergency alert, marks that
 * alert's real `sms_sent` column true in the same call.
 */
export async function sendSms({ emergencyAlertId, studentName, studentNumber, parentName, parentPhone, relation, situation, message, sentBy }) {
  let deliveryStatus = 'sent'
  let providerMessageId = null
  let sendError = null

  try {
    const { data, error: fnError } = await supabase.functions.invoke('send-sms', {
      body: { to: formatPHPhone(parentPhone), message },
    })
    if (fnError) {
      // supabase.functions.invoke() only exposes a generic "Edge
      // Function returned a non-2xx status code" by default — the
      // actual reason (set in send-sms/index.ts's jsonResponse calls,
      // e.g. "SMS is not configured yet", an invalid number, or
      // IPROG's own error text) is in the response body, reachable via
      // fnError.context (the raw Response object). Falls back to the
      // generic message only if that body can't be read/parsed for any
      // reason, rather than ever silently losing the real reason.
      let detailedMessage = fnError.message
      try {
        const body = await fnError.context?.json()
        if (body?.error) detailedMessage = body.error
      } catch {
        // Response body wasn't valid JSON (or context was unavailable)
        // — fall back to fnError.message above.
      }
      throw new Error(detailedMessage)
    }
    if (data?.error) throw new Error(data.error)
    providerMessageId = data?.providerMessageId ?? null
  } catch (err) {
    // Logged below regardless (delivery_status:'failed'), so the
    // attempt isn't silently lost — then re-thrown after logging, so
    // the composer can show the person the real reason it didn't go
    // through instead of a false "sent" confirmation.
    deliveryStatus = 'failed'
    sendError = err
  }

  const { data, error } = await supabase
    .from('sms_log')
    .insert({
      emergency_alert_id: emergencyAlertId ?? null,
      student_name: studentName,
      student_number: studentNumber,
      parent_name: parentName,
      parent_phone: parentPhone,
      relation,
      situation,
      message,
      sent_by: sentBy,
      delivery_status: deliveryStatus,
      provider_message_id: providerMessageId,
    })
    .select()
    .single()
  if (error) throw error

  if (emergencyAlertId && deliveryStatus === 'sent') {
    const { error: linkError } = await supabase.from('emergency_alerts').update({ sms_sent: true }).eq('emergency_alert_id', emergencyAlertId)
    if (linkError) throw linkError
  }

  if (sendError) throw sendError

  return data
}