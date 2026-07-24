import { supabase } from './supabaseClient'

// ── NOTES (post-Phase-A-migration) ──
// `diagnosis`, `follow_up_notes`, and the `'Emergency'` visit type are now
// real, first-class columns/values (migration 001) — no more string-encoding
// workarounds needed here.
//
// `bp`/`temp_celsius`/`pulse_bpm`/`o2_sat_pct` are typed columns (temp is
// NUMERIC, pulse/o2 are SMALLINT), but the UI collects them as free text
// (to allow things like "120/80" for BP or partial entries). This service
// parses temp/pulse/o2 to numbers (storing NULL if not parseable) and
// keeps `bp` as text, matching the schema's own types.

function toNumberOrNull(v) {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : null
}

const SELECT_WITH_PATIENT = `
  *,
  patient:users!consultations_patient_id_fkey ( name, patient_profiles ( student_number ) ),
  consultation_medications ( * )
`

function flattenConsultation(row) {
  if (!row) return row
  const { patient, consultation_medications, temp_celsius, pulse_bpm, o2_sat_pct, ...rest } = row
  return {
    ...rest,
    patient_name: patient?.name ?? 'Deleted User', // patient_id is SET NULL on user deletion (migration 019) — falls back to a real string, not null, so existing .toLowerCase()/.includes() filters on this field never crash
    student_number: patient?.patient_profiles?.student_number ?? null,
    temp: temp_celsius != null ? String(temp_celsius) : '',
    pulse: pulse_bpm != null ? String(pulse_bpm) : '',
    o2sat: o2_sat_pct != null ? String(o2_sat_pct) : '',
    prescribed_meds: (consultation_medications || []).map((m) => ({
      name: m.item_name,
      qty: m.quantity,
      dosage: m.dosage_instructions,
    })),
    medications: (consultation_medications || []).map((m) => `${m.item_name} ${m.dosage_instructions || ''}`.trim()).join(', ') || 'None',
  }
}

export async function listConsultations({ patientId } = {}) {
  let query = supabase.from('consultations').select(SELECT_WITH_PATIENT).order('visit_date', { ascending: false })
  if (patientId) query = query.eq('patient_id', patientId)
  const { data, error } = await query
  if (error) throw error
  return data.map(flattenConsultation)
}

export async function getConsultation(id) {
  const { data, error } = await supabase.from('consultations').select(SELECT_WITH_PATIENT).eq('consultation_id', id).single()
  if (error) throw error
  return flattenConsultation(data)
}

/**
 * Creates a consultation + its consultation_medications rows.
 * NOTE: this does NOT also deduct inventory — call
 * inventoryService.deductForConsultation() separately (or wrap both in a
 * Postgres RPC/transaction for atomicity).
 */
export async function createConsultation({
  patientId, visitType, date, staffId, complaint, bp, temp, pulse, o2sat,
  diagnosis, assessment, followUpDate, followUpNotes, prescribedMeds,
}) {
  const { data: consultation, error } = await supabase
    .from('consultations')
    .insert({
      patient_id: patientId,
      visit_type: visitType,
      chief_complaint: complaint,
      bp,
      temp_celsius: toNumberOrNull(temp),
      pulse_bpm: toNumberOrNull(pulse),
      o2_sat_pct: toNumberOrNull(o2sat),
      diagnosis: diagnosis || null,
      assessment,
      attended_by: staffId,
      visit_date: date,
      follow_up_date: followUpDate || null,
      follow_up_notes: followUpNotes || null,
    })
    .select()
    .single()
  if (error) throw error

  if (prescribedMeds?.length) {
    const rows = prescribedMeds.map((m) => ({
      consultation_id: consultation.consultation_id,
      inventory_id: m.inventoryId ?? null,
      item_name: m.name,
      quantity: m.qty,
      dosage_instructions: [m.dosage, m.frequency].filter(Boolean).join(' ') || null,
    }))
    const { error: medError } = await supabase.from('consultation_medications').insert(rows)
    if (medError) throw medError
  }

  return getConsultation(consultation.consultation_id)
}
