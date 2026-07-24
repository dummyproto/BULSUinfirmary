import { useState } from 'react'
import { useAuth } from '@context/AuthContext'
import SearchableSelect from '@components/ui/SearchableSelect'
import { SMS_TEMPLATES, validatePHPhone, buildSMSMessage } from './lib/smsHelpers'
import { PhoneIcon, UserIcon, AlertTriangleIcon, RefreshCwIcon, SendIcon, EyeIcon } from '@components/ui/icons'

const PICKUP_OPTIONS = [
  { value: 'none', label: 'No pickup needed', sub: 'Just informing parent/guardian' },
  { value: 'pickup', label: 'Parent must pick up', sub: 'Student needs to be picked up from school' },
  { value: 'sendhome', label: 'Sending student home', sub: 'Student will be sent home early' },
]

export default function SMSComposerTab({ patients, prefillPatientId, onClearPrefill, onSend }) {
  const { profile } = useAuth()
  const [patientId, setPatientId] = useState(prefillPatientId ? String(prefillPatientId) : '')
  const [situation, setSituation] = useState('')
  const [customText, setCustomText] = useState('')
  const [pickupFlag, setPickupFlag] = useState('none')
  const [notes, setNotes] = useState('')
  const [sending, setSending] = useState(false)

  const patient = patients.find((p) => String(p.user_id) === patientId) || null
  const options = patients.map((p) => ({ value: String(p.user_id), label: p.name, sub: `${p.student_number} · ${p.year_level}` }))

  const template = SMS_TEMPLATES.find((t) => t.id === situation)
  const effectiveSituationText = situation === 'custom' ? customText : template?.text || ''
  const message = patient && situation ? buildSMSMessage(patient.name, situation, pickupFlag, notes, profile?.name) : ''
  const primaryPhoneValid = patient ? validatePHPhone(patient.parent_phone) : false
  const canSend = !!patient && !!situation && primaryPhoneValid && (situation !== 'custom' || customText.trim().length > 0)

  function reset() {
    setPatientId('')
    setSituation('')
    setCustomText('')
    setPickupFlag('none')
    setNotes('')
    onClearPrefill?.()
  }

  function handleSend() {
    if (!canSend) return
    setSending(true)
    // Simulated send — same "Sent (Demo)" behavior as the legacy sendSMSAlert().
    setTimeout(() => {
      onSend({ patient, situation, situationLabel: template?.label, pickupFlag, notes, message })
      setSending(false)
      reset()
    }, 500)
  }

  return (
    <div className="sms-composer-layout">
      <div className="card sms-form-card">
        <div className="sms-form-header">
          <div className="sms-header-icon-wrap"><PhoneIcon width={18} height={18} /></div>
          <div>
            <h3>Notify Parent / Guardian</h3>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Demo mode — messages are logged only, not actually sent</div>
          </div>
        </div>

        <div style={{ padding: 18 }}>
          <div className="sms-step-block">
            <div className="sms-step-num">1</div>
            <div className="sms-step-content">
              <div className="sms-step-title">Select Student</div>
              <SearchableSelect
                options={options}
                value={patientId}
                displayValue={patient?.name || ''}
                onSelect={setPatientId}
                onClear={() => setPatientId('')}
                placeholder="Search student by name or ID…"
                emptyLabel="No students found"
              />
              {patient && (
                <div className="sms-parent-info-box">
                  {patient.parent_name ? (
                    <>
                      <div>
                        <UserIcon width={12} height={12} style={{ verticalAlign: -1 }} /> <strong>{patient.parent_name}</strong> ({patient.parent_relation})
                      </div>
                      <div>
                        <PhoneIcon width={11} height={11} style={{ verticalAlign: -1 }} /> {patient.parent_phone || '—'}
                        {patient.parent_phone2 ? ` / ${patient.parent_phone2}` : ''}
                      </div>
                      {!primaryPhoneValid && (
                        <div className="phone-status invalid" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangleIcon width={12} height={12} /> Primary contact number is not a valid PH mobile number</div>
                      )}
                    </>
                  ) : (
                    <div className="phone-status invalid" style={{ display: 'flex', alignItems: 'center', gap: 5 }}><AlertTriangleIcon width={12} height={12} /> No parent/guardian contact on file for this student</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="sms-step-block">
            <div className="sms-step-num">2</div>
            <div className="sms-step-content">
              <div className="sms-step-title">Select Situation</div>
              <div className="sms-template-grid">
                {SMS_TEMPLATES.map((t) => (
                  <div
                    key={t.id}
                    className={`sms-template-card${situation === t.id ? ' selected' : ''}`}
                    style={{ '--tpl-color': t.color }}
                    onClick={() => setSituation(t.id)}
                  >
                    <div className="tpl-icon">{t.icon}</div>
                    <div className="tpl-label">{t.label.replace(/^\S+\s/, '')}</div>
                  </div>
                ))}
              </div>
              {situation === 'custom' && (
                <textarea
                  className="form-textarea"
                  style={{ marginTop: 10 }}
                  placeholder="Write a custom message for the parent/guardian…"
                  value={customText}
                  onChange={(e) => setCustomText(e.target.value)}
                />
              )}
            </div>
          </div>

          <div className="sms-step-block">
            <div className="sms-step-num">3</div>
            <div className="sms-step-content">
              <div className="sms-step-title">Pickup Instructions</div>
              <div className="pickup-options">
                {PICKUP_OPTIONS.map((o) => (
                  <label className={`pickup-option${pickupFlag === o.value ? ' selected' : ''}`} key={o.value}>
                    <input
                      type="radio"
                      className="pickup-radio"
                      name="pickupFlag"
                      checked={pickupFlag === o.value}
                      onChange={() => setPickupFlag(o.value)}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{o.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{o.sub}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>

          <div className="sms-step-block">
            <div className="sms-step-num">4</div>
            <div className="sms-step-content">
              <div className="sms-step-title">
                Additional Notes <span style={{ fontWeight: 400, color: 'var(--text-3)' }}>(optional)</span>
              </div>
              <textarea
                className="form-textarea"
                placeholder="Any additional instructions or information…"
                style={{ minHeight: 60 }}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          <div className="sms-actions">
            <button type="button" className="btn btn-outline" onClick={reset}>
              <RefreshCwIcon width={13} height={13} /> Clear
            </button>
            <button type="button" className="btn sms-send-btn" disabled={!canSend || sending} onClick={handleSend} style={!canSend ? { opacity: 0.5 } : undefined}>
              {sending ? 'Sending…' : (<><SendIcon width={13} height={13} /> Send SMS Alert</>)}
            </button>
          </div>
        </div>
      </div>

      <div className="sms-preview-panel">
        <div className="card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><EyeIcon width={15} height={15} /> Live Preview</h3>
          </div>
          <div style={{ padding: 16 }}>
            <div className="sms-phone-mockup">
              <div className="sms-phone-bar" />
              <div className="sms-phone-contact">{patient?.parent_name || 'Parent/Guardian'}</div>
              <div className="sms-phone-body">
                {message ? (
                  <div className="sms-bubble">{message}</div>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', padding: 20 }}>
                    Select a student and situation to preview the message
                  </div>
                )}
              </div>
            </div>
            {message && <div className="sms-char-count">{message.length} characters</div>}
            {situation && situation !== 'custom' && (
              <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 8 }}>Template: {effectiveSituationText}</div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
