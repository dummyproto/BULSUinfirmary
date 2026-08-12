import { useEffect, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { useConfirm } from '@context/ConfirmContext'
import Spinner from '@components/ui/Spinner'
import AlertListTab from './AlertListTab'
import AlertLogTab from './AlertLogTab'
import SMSComposerTab from './SMSComposerTab'
import SmsLogTab from './SmsLogTab'
import SmsSuccessOverlay from './SmsSuccessOverlay'
import EmergencySidebar, { PICKUP_OPTIONS } from './EmergencySidebar'
import { stopEmergencySiren } from '@lib/emergencySound'
import { SMS_TEMPLATES, validatePHPhone, buildSMSMessage } from './lib/smsHelpers'
import {
  listEmergencyAlerts,
  acknowledgeAlert,
  resolveAlert,
  deleteEmergencyAlerts,
  listSmsLog,
  deleteSmsLogs,
  sendSms,
} from '@services/emergencyAlertsService'
import { listUsers } from '@services/usersService'
import { notify } from '@services/notificationsService'

/**
 * Emergency Alerts — Active Alerts / Alert Log / Notify Parent / SMS Log
 * all live behind one persistent left sidebar (EmergencySidebar.jsx)
 * instead of a top tab row, with Notify Parent's own Select Student/
 * Message Templates/Pickup Instructions folded into that same sidebar
 * rather than living inside its own tab content. Notify Parent's main
 * area (SMSComposerTab.jsx) is just the Compose & Preview summary now —
 * the earlier chat-thread/Quick-Actions UI was removed per request, so
 * selection feedback goes through toasts (via useToast) instead of chat
 * bubbles. This component owns all of the compose state (student/
 * situation/pickup/notes) so both the sidebar (the selection UI) and
 * SMSComposerTab (the preview that reacts to those selections) can
 * share it — neither one owns it independently.
 */
export default function EmergencyAlertsPage() {
  const { profile } = useAuth()
  const { show } = useToast()
  const confirm = useConfirm()
  const currentUserId = profile?.user_id ?? null
  // Admin implicitly qualifies regardless of their own staff_permissions
  // row (every non-patient account gets one on creation, but the flag
  // itself is only meaningful for staff — RLS migration 028 mirrors
  // this same admin-or-permitted-staff logic server-side, which is what
  // actually enforces it; this is just for hiding/showing the UI).
  const canDeleteLogs = profile?.role === 'admin' || !!profile?.permissions?.delete_logs

  const [tab, setTab] = useState('list')
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])
  const [smsLog, setSmsLog] = useState([])
  const [patients, setPatients] = useState([])
  const [prefillPatientId, setPrefillPatientId] = useState(null)
  const [successResult, setSuccessResult] = useState(null)

  // ── Compose state (Notify Parent) — see the doc comment above for why
  // this lives here rather than inside SMSComposerTab or EmergencySidebar. ──
  const [patientId, setPatientId] = useState('')
  const [situation, setSituation] = useState('')
  const [customText, setCustomText] = useState('')
  const [pickupFlag, setPickupFlag] = useState('none')
  const [notes, setNotes] = useState('')
  const [manualPhone, setManualPhone] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([listEmergencyAlerts(), listSmsLog(), listUsers()])
      .then(([a, s, users]) => {
        if (cancelled) return
        setAlerts(a)
        setSmsLog(s)
        setPatients(users.filter((u) => u.role === 'patient'))
      })
      .catch((err) => show(`Failed to load emergency alert data: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Prefilling a student (from Active Alerts' "Notify Parent" shortcut —
  // see handleGoToSMS below) should feel like the person just picked
  // that student themselves, so it goes through the same selection
  // handler rather than silently setting patientId directly.
  useEffect(() => {
    if (prefillPatientId) handleSelectStudent(String(prefillPatientId))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefillPatientId])

  const activeCount = alerts.filter((a) => a.status === 'Active').length
  const patient = patients.find((p) => String(p.user_id) === patientId) || null
  const template = SMS_TEMPLATES.find((t) => t.id === situation)
  const message = patient && situation ? buildSMSMessage(patient.name, situation, pickupFlag, situation === 'custom' ? customText : notes, profile?.name, profile?.role) : ''
  const primaryPhoneValid = patient ? validatePHPhone(patient.parent_phone) : false
  // When the patient record has no valid guardian number, staff/admin
  // can type one in manually (see EmergencySidebar.jsx's phone input,
  // shown only in that case) rather than being blocked outright — the
  // manual number is used for this message only, not saved back to the
  // patient's record, since confirming it's actually correct is a
  // separate step from sending one alert.
  const manualPhoneValid = validatePHPhone(manualPhone)
  const usingManualPhone = !!patient && !primaryPhoneValid
  const effectivePhone = usingManualPhone ? manualPhone : patient?.parent_phone
  const effectivePhoneValid = usingManualPhone ? manualPhoneValid : primaryPhoneValid
  const canSend = !!patient && !!situation && effectivePhoneValid && (situation !== 'custom' || customText.trim().length > 0)

  function resetComposer() {
    setPatientId('')
    setSituation('')
    setCustomText('')
    setPickupFlag('none')
    setNotes('')
    setManualPhone('')
    setPrefillPatientId(null)
  }

  function handleSelectStudent(id) {
    setPatientId(id)
    setManualPhone('')
    if (!id) return
    const p = patients.find((x) => String(x.user_id) === id)
    if (!p) return
    if (!validatePHPhone(p.parent_phone)) {
      show(`${p.name} selected — no valid guardian number on file. You can type one in below.`, 'warning')
    } else {
      show(`${p.name} selected.`, 'success')
    }
  }

  function handleSelectSituation(id) {
    setSituation(id)
  }

  function handleSelectPickup(value) {
    setPickupFlag(value)
  }

  function handleNotesChange(text) {
    if (situation === 'custom') setCustomText(text)
    else setNotes(text)
  }

  async function handleAck(id) {
    stopEmergencySiren()
    try {
      const updated = await acknowledgeAlert(id, currentUserId)
      setAlerts((list) => list.map((a) => (a.emergency_alert_id === id ? { ...a, ...updated } : a)))
      show('Alert acknowledged', 'success')
      // The person who filed this was already notified nothing back once
      // staff actually responded — patient-to-staff was covered, but not
      // the reverse direction. reported_by can be null for a pre-login
      // SOS submission (no account to notify); skip those rather than
      // guess at who to tell.
      if (updated.reported_by) {
        try {
          await notify({
            targetUserId: updated.reported_by,
            message: `Your emergency alert for ${updated.subject_name || 'the reported situation'} has been acknowledged — help is on the way.`,
            type: 'success',
            module: '/dashboard',
          })
        } catch {
          // Non-critical — the acknowledgment itself already succeeded.
        }
      }
    } catch (err) {
      show(`Failed to acknowledge alert: ${err.message}`, 'error')
    }
  }

  async function handleResolve(id) {
    try {
      const updated = await resolveAlert(id)
      setAlerts((list) => list.map((a) => (a.emergency_alert_id === id ? { ...a, ...updated } : a)))
      show('Alert marked as resolved', 'success')
    } catch (err) {
      show(`Failed to resolve alert: ${err.message}`, 'error')
    }
  }

  async function handleDeleteAlerts(ids) {
    const ok = await confirm(
      ids.length === 1
        ? 'Delete this alert log entry?\nThis cannot be undone.'
        : `Delete ${ids.length} alert log entries?\nThis cannot be undone.`,
      { confirmLabel: 'Delete', danger: true }
    )
    if (!ok) return
    try {
      await deleteEmergencyAlerts(ids)
      setAlerts((list) => list.filter((a) => !ids.includes(a.emergency_alert_id)))
      show(ids.length === 1 ? 'Alert log entry deleted' : `${ids.length} alert log entries deleted`, 'success')
    } catch (err) {
      show(`Failed to delete: ${err.message}`, 'error')
    }
  }

  async function handleDeleteSmsLogs(ids) {
    const ok = await confirm(
      ids.length === 1
        ? 'Delete this SMS log entry?\nThis cannot be undone.'
        : `Delete ${ids.length} SMS log entries?\nThis cannot be undone.`,
      { confirmLabel: 'Delete', danger: true }
    )
    if (!ok) return
    try {
      await deleteSmsLogs(ids)
      setSmsLog((list) => list.filter((s) => !ids.includes(s.sms_log_id)))
      show(ids.length === 1 ? 'SMS log entry deleted' : `${ids.length} SMS log entries deleted`, 'success')
    } catch (err) {
      show(`Failed to delete: ${err.message}`, 'error')
    }
  }

  function handleGoToSMS(alert) {
    setTab('composer')
    setPrefillPatientId(alert.subject_id)
  }

  async function handleSendClick() {
    if (!canSend) return
    setSending(true)

    // Link to the most recent un-notified active/acknowledged alert for
    // this patient, same as the legacy sendSMSAlert() linking step —
    // computed client-side since "notified" isn't a stored flag (see the
    // schema-gap note in emergencyAlertsService.js).
    const linkedAlert = [...alerts]
      .filter((a) => a.subject_id === patient.user_id && a.status !== 'Resolved' && !a.sms_sent)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

    try {
      await sendSms({
        patientId: patient.user_id,
        emergencyAlertId: linkedAlert?.emergency_alert_id ?? null,
        studentName: patient.name,
        studentNumber: patient.student_number,
        parentName: patient.parent_name || (usingManualPhone ? 'Parent/Guardian' : ''),
        parentPhone: effectivePhone,
        relation: patient.parent_relation,
        situation,
        message,
        sentBy: currentUserId,
      })
      const [freshAlerts, freshLog] = await Promise.all([listEmergencyAlerts(), listSmsLog()])
      setAlerts(freshAlerts)
      setSmsLog(freshLog)
      show(`Message sent to ${patient.parent_name || 'the parent/guardian'}.`, 'success')
      setSuccessResult({ patient: { ...patient, parent_phone: effectivePhone }, situation, situationLabel: template?.label, pickupFlag, notes, message })
      resetComposer()
    } catch (err) {
      show(`Failed to send SMS: ${err.message}`, 'error')
    } finally {
      setSending(false)
    }
  }

  if (loading) return <Spinner label="Loading emergency alerts…" />

  return (
    <>
      <div className="sms-chat-layout">
        <EmergencySidebar
          tab={tab}
          onTabChange={setTab}
          activeCount={activeCount}
          patients={patients}
          patientId={patientId}
          patient={patient}
          primaryPhoneValid={primaryPhoneValid}
          manualPhone={manualPhone}
          onManualPhoneChange={setManualPhone}
          manualPhoneValid={manualPhoneValid}
          onSelectStudent={handleSelectStudent}
          situation={situation}
          onSelectSituation={handleSelectSituation}
          pickupFlag={pickupFlag}
          onSelectPickup={handleSelectPickup}
          onReset={resetComposer}
        />

        {tab === 'list' && <AlertListTab alerts={alerts} onAck={handleAck} onResolve={handleResolve} onGoToSMS={handleGoToSMS} />}
        {tab === 'log' && <AlertLogTab alerts={alerts} canDelete={canDeleteLogs} onDelete={handleDeleteAlerts} />}
        {tab === 'composer' && (
          <SMSComposerTab
            situationLabel={template?.label}
            message={message}
            notesValue={situation === 'custom' ? customText : notes}
            onNotesChange={handleNotesChange}
            patient={patient}
            situation={situation}
            pickupFlag={pickupFlag}
            effectivePhone={effectivePhone}
            effectivePhoneValid={effectivePhoneValid}
            senderName={profile?.name}
            senderRole={profile?.role}
            canSend={canSend}
            sending={sending}
            onSendClick={handleSendClick}
          />
        )}
        {tab === 'smslog' && <SmsLogTab smsLog={smsLog} canDelete={canDeleteLogs} onDelete={handleDeleteSmsLogs} />}
      </div>

      <SmsSuccessOverlay result={successResult} onClose={() => setSuccessResult(null)} />
    </>
  )
}