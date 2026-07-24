import { useEffect, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import Spinner from '@components/ui/Spinner'
import AlertListTab from './AlertListTab'
import AlertLogTab from './AlertLogTab'
import SMSComposerTab from './SMSComposerTab'
import SmsLogTab from './SmsLogTab'
import SmsSuccessOverlay from './SmsSuccessOverlay'
import {
  listEmergencyAlerts,
  acknowledgeAlert,
  resolveAlert,
  listSmsLog,
  sendSms,
} from '@services/emergencyAlertsService'
import { listUsers } from '@services/usersService'
import { notify } from '@services/notificationsService'

import { EmergencyIcon, ClipboardIcon, PhoneIcon, MessageSquareIcon } from '@components/ui/icons'

const TABS = [
  { key: 'list', label: 'Active Alerts', Icon: EmergencyIcon },
  { key: 'log', label: 'Alert Log', Icon: ClipboardIcon },
  { key: 'composer', label: 'Notify Parent', Icon: PhoneIcon },
  { key: 'smslog', label: 'SMS Log', Icon: MessageSquareIcon },
]

export default function EmergencyAlertsPage() {
  const { profile } = useAuth()
  const { show } = useToast()
  const currentUserId = profile?.user_id ?? null

  const [tab, setTab] = useState('list')
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState([])
  const [smsLog, setSmsLog] = useState([])
  const [patients, setPatients] = useState([])
  const [prefillPatientId, setPrefillPatientId] = useState(null)
  const [successResult, setSuccessResult] = useState(null)

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

  const activeCount = alerts.filter((a) => a.status === 'Active').length

  async function handleAck(id) {
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

  function handleGoToSMS(alert) {
    setPrefillPatientId(alert.subject_id)
    setTab('composer')
  }

  async function handleSendSms(payload) {
    const { patient, situation, message } = payload

    // Link to the most recent un-notified active/acknowledged alert for
    // this patient, same as the legacy sendSMSAlert() linking step —
    // computed client-side since "notified" isn't a stored flag (see the
    // schema-gap note in emergencyAlertsService.js).
    const linkedAlert = [...alerts]
      .filter((a) => a.subject_id === patient.user_id && a.status !== 'Resolved' && !a.sms_sent)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0]

    try {
      await sendSms({
        emergencyAlertId: linkedAlert?.emergency_alert_id ?? null,
        studentName: patient.name,
        studentNumber: patient.student_number,
        parentName: patient.parent_name,
        parentPhone: patient.parent_phone,
        relation: patient.parent_relation,
        situation,
        message,
        sentBy: currentUserId,
      })
      const [freshAlerts, freshLog] = await Promise.all([listEmergencyAlerts(), listSmsLog()])
      setAlerts(freshAlerts)
      setSmsLog(freshLog)
      setPrefillPatientId(null)
      setSuccessResult(payload)
    } catch (err) {
      show(`Failed to send SMS: ${err.message}`, 'error')
    }
  }

  const tabItems = TABS.map((t) => (t.key === 'list' && activeCount > 0 ? { ...t, label: `${t.label} (${activeCount})` } : t))

  if (loading) return <Spinner label="Loading emergency alerts…" />

  return (
    <>
      <div className="tab-row" style={{ marginBottom: 16 }}>
        {tabItems.map((t) => (
          <button key={t.key} type="button" className={`tab-btn${tab === t.key ? ' active' : ''}`} onClick={() => setTab(t.key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <t.Icon width={14} height={14} /> {t.label}
          </button>
        ))}
      </div>

      {tab === 'list' && <AlertListTab alerts={alerts} onAck={handleAck} onResolve={handleResolve} onGoToSMS={handleGoToSMS} />}
      {tab === 'log' && <AlertLogTab alerts={alerts} />}
      {tab === 'composer' && (
        <SMSComposerTab
          patients={patients}
          prefillPatientId={prefillPatientId}
          onClearPrefill={() => setPrefillPatientId(null)}
          onSend={handleSendSms}
        />
      )}
      {tab === 'smslog' && <SmsLogTab smsLog={smsLog} />}

      <SmsSuccessOverlay result={successResult} onClose={() => setSuccessResult(null)} />
    </>
  )
}
