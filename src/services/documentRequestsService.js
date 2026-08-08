import { supabase } from './supabaseClient'

// Maps 1:1 to the `document_requests` table. `patient_name`/`student_number`
// aren't columns on this table — they live on `users`/`patient_profiles` —
// so reads join across them the way a real page needs to display the list.
const SELECT_WITH_PATIENT = `
  *,
  patient:users!document_requests_patient_id_fkey ( name, patient_profiles ( student_number ) ),
  processor:users!document_requests_processed_by_fkey ( name )
`

function flattenRequest(row) {
  if (!row) return row
  const { patient, processor, ...rest } = row
  return {
    ...rest,
    patient_name: patient?.name ?? 'Deleted User', // patient_id is SET NULL on user deletion (migration 019)
    student_number: patient?.patient_profiles?.student_number ?? null,
    processed_by_name: processor?.name ?? null,
  }
}

export async function listDocumentRequests({ patientId } = {}) {
  let query = supabase.from('document_requests').select(SELECT_WITH_PATIENT).order('created_at', { ascending: false })
  if (patientId) query = query.eq('patient_id', patientId)
  // Capped — when called without patientId (the staff-facing "all
  // requests clinic-wide" view), this was unbounded and only grows over
  // time. Scoped-to-one-patient calls stay naturally small regardless,
  // so this limit is really only load-bearing for the unfiltered case.
  query = query.limit(300)
  const { data, error } = await query
  if (error) throw error
  return data.map(flattenRequest)
}

export async function getDocumentRequest(id) {
  const { data, error } = await supabase.from('document_requests').select(SELECT_WITH_PATIENT).eq('doc_request_id', id).single()
  if (error) throw error
  return flattenRequest(data)
}

export async function createDocumentRequest({ patientId, docType, purpose, dateNeeded }) {
  const { data, error } = await supabase
    .from('document_requests')
    .insert({
      patient_id: patientId,
      doc_type: docType,
      purpose,
      date_requested: new Date().toISOString().slice(0, 10),
      date_needed: dateNeeded,
      status: 'Pending',
    })
    .select(SELECT_WITH_PATIENT)
    .single()
  if (error) throw error
  return flattenRequest(data)
}

// status: 'Processing' | 'Approved' | 'Declined' | 'Claimed'.
// (The 'Claimed' status was added to the CHECK constraint by migration 001.)
export async function updateDocumentRequestStatus(id, status, { processedBy, notes } = {}) {
  const { data, error } = await supabase
    .from('document_requests')
    .update({ status, processed_by: processedBy ?? null, notes: notes ?? null, updated_at: new Date().toISOString() })
    .eq('doc_request_id', id)
    .select(SELECT_WITH_PATIENT)
    .single()
  if (error) throw error
  return flattenRequest(data)
}

export async function deleteDocumentRequest(id) {
  const { error } = await supabase.from('document_requests').delete().eq('doc_request_id', id)
  if (error) throw error
}