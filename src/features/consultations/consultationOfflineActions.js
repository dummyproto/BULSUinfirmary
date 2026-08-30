// src/features/consultations/consultationOfflineActions.js
//
// Phase 3 — same pattern as inventoryOfflineActions.js (Phase 2):
// registers the actual "how to replay this" function with the generic
// queue from offlineQueueService.js. Imported once for its side effect
// by ConsultationPage.jsx.
//
// UNLIKE Phase 2's three separate runners, this is ONE runner for the
// WHOLE consultation-save flow (create + medicine deduction + patient
// notify), not one per service call — createConsultation,
// deductMedicinesForConsultation, and deductForConsultation are chained
// (each deduction call needs the real consultation_id the create step
// just returned), so they can't be queued as independent, separately
// replayable entries without the queue needing to understand that
// dependency. Bundling the whole sequence into one runner keeps that
// chaining exactly as-is, replayed as a single atomic unit once back
// online — mirrors handleSaveConsultation in ConsultationPage.jsx
// itself; keep the two in sync if that flow changes.
//
// RISK ACCEPTED (medicine deduction step, same as Phase 2's FIFO release):
// both deductMedicinesForConsultation and its deductForConsultation
// fallback check live stock levels AT REPLAY TIME, not when the
// consultation was actually recorded offline. Stock might have moved in
// the meantime (another release, another queued action ahead of this
// one), so a deduction that would have succeeded the moment the visit
// happened could fail once synced — surfacing as a queue error rather
// than at the point of care. Accepted per the same confirmation given
// for Phase 2's medicine FIFO risk.
//
// Patient notify() and the CONSULTATION_ADDED audit log are best-effort
// in the online path too (wrapped in their own try/catch there) — same
// treatment here.

import { registerOfflineRunner } from '@services/offlineQueueService'
import { createConsultation } from '@services/consultationsService'
import { deductMedicinesForConsultation } from '@services/medicineService'
import { deductForConsultation } from '@services/inventoryService'
import { notify } from '@services/notificationsService'
import { logClinicalEvent } from '@services/auditLogsService'

registerOfflineRunner('consultation_save', async (payload) => {
  const { patient, unregisteredPatientName, visitType, date, staffId, complaint, bp, temp, pulse, o2sat, diagnosis, assessment, followUpDate, followUpNotes, prescribedMeds } = payload

  const created = await createConsultation({
    patientId: patient?.user_id ?? null,
    unregisteredPatientName,
    visitType,
    date,
    staffId,
    complaint,
    bp,
    temp,
    pulse,
    o2sat,
    diagnosis,
    assessment,
    followUpDate,
    followUpNotes,
    prescribedMeds,
  })

  try {
    logClinicalEvent({
      userId: staffId,
      action: 'CONSULTATION_ADDED',
      details: `${payload.staffName || 'Staff'} recorded a ${visitType} consultation for ${patient ? patient.name : unregisteredPatientName} (synced from offline).`,
    })
  } catch (err) {
    console.error('[CONSULTATION_AUDIT_LOG_FAILED]', err.message)
  }

  try {
    if (patient) {
      await notify({
        targetUserId: patient.user_id,
        message: `A consultation record was added for your visit on ${date} (${visitType}).`,
        type: 'info',
        module: '/dashboard',
      })
    }
  } catch (err) {
    console.error('notify() failed:', err)
  }

  if (prescribedMeds?.length > 0) {
    const primary = await deductMedicinesForConsultation(prescribedMeds, staffId, created.consultation_id)
    const notFound = primary.errors.filter((e) => e.notFound).map((e) => prescribedMeds.find((m) => m.name === e.medicine)).filter(Boolean)
    if (notFound.length > 0) {
      await deductForConsultation(notFound, staffId, created.consultation_id)
    }
  }
})