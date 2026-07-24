import { supabase } from './supabaseClient'

// Phase 8 — replaces the static INITIAL_DIAGNOSIS_LIST /
// INITIAL_DIAG_CATEGORIES (diagnosisData.js), which "Add New Diagnosis"
// only ever appeared to extend — additions never left the current
// browser session. No separate listDiagnosisCategories() function here:
// the {category: [names]} shape ConsultationPage.jsx/AddDiagnosisModal.jsx/
// AnalyticsTab.jsx already expect is derived client-side from the one
// listDiagnoses() result (a simple grouping reduce), rather than firing a
// second query for data the first one already returned in full.

export async function listDiagnoses() {
  const { data, error } = await supabase.from('diagnoses').select('*').eq('active', true).order('name')
  if (error) throw error
  return data
}

export async function createDiagnosis(name, category) {
  const { data, error } = await supabase.from('diagnoses').insert({ name, category }).select().single()
  if (error) throw error
  return data
}

// Moved here from the now-deleted diagnosisData.js — a small, reusable,
// pure utility (reverse-looks-up which category a diagnosis belongs to
// in a {category: [names]} map), unrelated to the static reference data
// that used to live alongside it. Still used by NewConsultationTab.
export function getDiagnosisCategory(diagnosis, categories) {
  for (const [cat, list] of Object.entries(categories)) {
    if (list.includes(diagnosis)) return cat
  }
  return 'Other'
}
