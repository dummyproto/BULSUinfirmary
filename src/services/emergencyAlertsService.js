import { supabase } from './supabaseClient'

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
  const { data, error } = await supabase.from('emergency_alerts').select(SELECT_ALERT).order('created_at', { ascending: false })
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

export async function listSmsLog() {
  const { data, error } = await supabase
    .from('sms_log')
    .select('*, sender:users!sms_log_sent_by_fkey ( name )')
    .order('sent_at', { ascending: false })
  if (error) throw error
  return data.map((s) => ({ ...s, sent_by_name: s.sender?.name ?? null }))
}

/**
 * Logs the SMS and, if it's linked to an emergency alert, marks that
 * alert's real `sms_sent` column true in the same call.
 */
export async function sendSms({ emergencyAlertId, studentName, studentNumber, parentName, parentPhone, relation, situation, message, sentBy }) {
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
    })
    .select()
    .single()
  if (error) throw error

  if (emergencyAlertId) {
    const { error: linkError } = await supabase.from('emergency_alerts').update({ sms_sent: true }).eq('emergency_alert_id', emergencyAlertId)
    if (linkError) throw linkError
  }

  return data
}
