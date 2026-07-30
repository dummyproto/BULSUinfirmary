import { supabase } from './supabaseClient'

// NOTE: a standalone Appointments page briefly existed and was removed —
// this service is scoped back down to what the dashboards' "Today's
// Schedule" widgets actually use (an original app feature), not the
// broader CRUD surface the removed page needed.

const SELECT_WITH_PATIENT = `*, patient:users!appointments_patient_id_fkey ( name, patient_profiles ( student_number ) )`

function flattenAppt(row) {
  if (!row) return row
  const { patient, ...rest } = row
  // patient_name falls back to 'Deleted User', not null — patient_id is
  // SET NULL on user deletion (migration 019).
  return { ...rest, patient_name: patient?.name ?? 'Deleted User', student_number: patient?.patient_profiles?.student_number ?? null }
}

export async function listAppointments({ date } = {}) {
  let query = supabase.from('appointments').select(SELECT_WITH_PATIENT).order('appt_time')
  if (date) query = query.eq('appt_date', date)
  const { data, error } = await query
  if (error) throw error
  return data.map(flattenAppt)
}
