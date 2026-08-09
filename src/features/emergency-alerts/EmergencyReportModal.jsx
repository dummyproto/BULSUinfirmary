import { useEffect, useState } from 'react'
import Modal from '@components/ui/Modal'
import EmergencyPatientPicker from './EmergencyPatientPicker'
import { createEmergencyAlert } from '@services/emergencyAlertsService'
import { notify } from '@services/notificationsService'
import { addAuditLog } from '@services/auditLogsService'
import { playEmergencySiren } from '@lib/emergencySound'
import { AlertOctagonIcon, UserIcon, PeopleIcon } from '@components/ui/icons'
import LocationPicker from './LocationPicker'

// Rate limit on SOS submissions — same reasoning and same client-side-only
// caveat as LoginPage's login-attempt lockout: this is a practical
// deterrent against someone repeatedly mashing "Send Emergency Alert"
// (accidental double-submits, or deliberate spam), tracked in
// localStorage per reporter so it survives a page reload. It is
// deliberately short (60s, not minutes) — this is a safety feature, not
// a security one, and must never meaningfully delay a genuine follow-up
// report of a second, different emergency. It's also NOT a real
// server-side guard (clearing localStorage resets it) — a determined
// spammer isn't stopped by this, only accidental/casual repeat
// submissions are. A proper server-side rate limit would need a
// dedicated counting table + RPC, which is a larger change than this
// deterrent.
const EMERGENCY_COOLDOWN_MS = 60_000
const EMERGENCY_COOLDOWN_KEY_PREFIX = 'emg_last_submit_'

function lastSubmitAt(reporterId) {
  const raw = localStorage.getItem(`${EMERGENCY_COOLDOWN_KEY_PREFIX}${reporterId}`)
  return raw ? Number(raw) : 0
}

function markSubmitted(reporterId) {
  localStorage.setItem(`${EMERGENCY_COOLDOWN_KEY_PREFIX}${reporterId}`, String(Date.now()))
}

/**
 * profile: pass the authenticated patient's profile when logged in, or
 * null for the pre-login (login-screen SOS) case. Either way, the
 * "affected person" search (and the reporter search, pre-login) goes
 * through the narrow `search_patients_public` RPC rather than
 * `listUsers()` — a logged-in PATIENT can't read other patients' rows via
 * RLS (by design), so the full-listing approach silently returned nothing
 * for the "For Another Person" case. This also happens to be what makes
 * the pre-login case possible at all, since there's no session yet.
 *
 * initialDescription: optional pre-fill for the Description field —
 * used by the chatbot's "sos" trigger to seed it from the recent
 * conversation. The person can still edit/clear it before submitting;
 * this never auto-submits anything.
 */
export default function EmergencyReportModal({ isOpen, onClose, profile, onError, onSuccess, initialDescription = '' }) {
  const [reporter, setReporter] = useState(null) // { user_id, name, student_number } — only used pre-login
  const [emgType, setEmgType] = useState('myself')
  const [affected, setAffected] = useState(null)
  const [location, setLocation] = useState('')
  const [description, setDescription] = useState(initialDescription)
  const [submitting, setSubmitting] = useState(false)
  const [cooldownLeft, setCooldownLeft] = useState(0)

  const reporterUser = profile ? { user_id: profile.user_id, name: profile.name, student_number: profile.student_number } : reporter

  // Re-checks the cooldown whenever the modal opens or the identified
  // reporter changes (pre-login: only known once they've picked
  // themselves from EmergencyPatientPicker) — covers reopening the modal
  // shortly after a previous submission, not just mid-session countdown.
  useEffect(() => {
    if (!isOpen || !reporterUser) return undefined
    const tick = () => {
      const remaining = Math.max(0, EMERGENCY_COOLDOWN_MS - (Date.now() - lastSubmitAt(reporterUser.user_id)))
      setCooldownLeft(Math.ceil(remaining / 1000))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, reporterUser?.user_id])

  const effectiveCooldown = isOpen && reporterUser ? cooldownLeft : 0

  function reset() {
    setReporter(null)
    setEmgType('myself')
    setAffected(null)
    setLocation('')
    setDescription(initialDescription)
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit() {
    const errors = []
    if (!reporterUser) errors.push("Reporter's details are required.")
    if (!location) errors.push('Room / Location of Incident is required.')
    if (!description.trim()) errors.push('Description of Emergency is required.')
    if (emgType === 'another' && !affected) errors.push("Affected Person's details are required.")
    if (errors.length) return onError(errors.join(' '))

    if (reporterUser) {
      const remaining = Math.max(0, EMERGENCY_COOLDOWN_MS - (Date.now() - lastSubmitAt(reporterUser.user_id)))
      if (remaining > 0) {
        return onError(`Please wait ${Math.ceil(remaining / 1000)}s before sending another emergency alert.`)
      }
    }

    const subject = emgType === 'myself' ? reporterUser : affected

    setSubmitting(true)
    try {
      await createEmergencyAlert({
        reportedBy: reporterUser.user_id,
        subjectId: subject.user_id,
        subjectStudentNum: subject.student_number,
        subjectName: subject.name,
        emergencyType: emgType,
        location,
        description: description.trim(),
      })
      markSubmitted(reporterUser.user_id)

      const summary = `EMERGENCY: ${subject.name} at ${location} — ${description.slice(0, 60)}${description.length > 60 ? '…' : ''}`
      try {
        await Promise.all([
          notify({ targetRole: 'staff', message: summary, type: 'danger', module: '/emergency-alerts' }),
          notify({ targetRole: 'admin', message: summary, type: 'danger', module: '/emergency-alerts' }),
        ])
        await addAuditLog({ userId: profile?.user_id ?? null, action: 'EMERGENCY_ALERT', details: `Alert submitted for ${subject.name} at ${location}${!profile ? ' (pre-login)' : ''}` })
      } catch {
        // Non-critical — the alert itself was already created successfully.
      }

      playEmergencySiren()
      reset()
      onClose()
      onSuccess(subject.name, location)
    } catch (err) {
      onError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Emergency Alert"
      icon={<AlertOctagonIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-outline" onClick={handleClose}>
            Cancel
          </button>
          <button type="button" className="btn btn-red" onClick={handleSubmit} disabled={submitting || effectiveCooldown > 0}>
            {submitting ? 'Sending…' : effectiveCooldown > 0 ? `Wait ${effectiveCooldown}s…` : (<><AlertOctagonIcon width={13} height={13} /> Send Emergency Alert</>)}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 16 }}>Fill in the details below. All fields are required.</div>

      <div className="emg-section-label">Emergency Type</div>
      <div className="emg-type-row">
        <label className={`emg-type-card${emgType === 'myself' ? ' selected' : ''}`}>
          <input type="radio" name="emg-type" style={{ display: 'none' }} checked={emgType === 'myself'} onChange={() => setEmgType('myself')} />
          <span className="emg-type-icon"><UserIcon width={20} height={20} /></span>
          <span className="emg-type-text">For Myself</span>
        </label>
        <label className={`emg-type-card${emgType === 'another' ? ' selected' : ''}`}>
          <input type="radio" name="emg-type" style={{ display: 'none' }} checked={emgType === 'another'} onChange={() => setEmgType('another')} />
          <span className="emg-type-icon"><PeopleIcon width={20} height={20} /></span>
          <span className="emg-type-text">For Another Person</span>
        </label>
      </div>

      <div className="emg-section-label" style={{ marginTop: 14 }}>
        Reporter Details
      </div>
      {profile ? (
        <div className="emg-form-row">
          <div className="emg-form-field">
            <label>
              Patient Number <span className="emg-req">*</span>
            </label>
            <input type="text" className="emg-input" value={profile.student_number || ''} readOnly />
          </div>
          <div className="emg-form-field">
            <label>
              Full Name <span className="emg-req">*</span>
            </label>
            <input type="text" className="emg-input" value={profile.name || ''} readOnly />
          </div>
        </div>
      ) : (
        <div className="emg-form-field" style={{ marginBottom: 10 }}>
          <label>
            Select Patient (that&apos;s you) <span className="emg-req">*</span>
          </label>
          <EmergencyPatientPicker selected={reporter} onSelect={setReporter} onClear={() => setReporter(null)} placeholder="Search by name or patient number…" />
        </div>
      )}

      {emgType === 'another' && (
        <>
          <div className="emg-section-label">Affected Person Details</div>
          <div className="emg-form-field" style={{ marginBottom: 10 }}>
            <label>
              Select Patient <span className="emg-req">*</span>
            </label>
            <EmergencyPatientPicker
              selected={affected}
              onSelect={setAffected}
              onClear={() => setAffected(null)}
              placeholder="Search by name or patient number…"
              excludeUserId={reporterUser?.user_id}
            />
          </div>
        </>
      )}

      <div className="emg-section-label">Incident Details</div>
      <div className="emg-form-field" style={{ marginBottom: 12 }}>
        <label>
          Room / Location <span className="emg-req">*</span>
        </label>
        <LocationPicker value={location} onChange={setLocation} />
      </div>
      <div className="emg-form-field">
        <label>
          Description <span className="emg-req">*</span>
        </label>
        <textarea className="emg-input emg-textarea" rows={3} placeholder="Briefly describe what happened…" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
    </Modal>
  )
}