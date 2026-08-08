import Avatar from '@components/ui/Avatar'
import { SMS_TEMPLATES, buildSMSFooter } from './lib/smsHelpers'
import { PICKUP_OPTIONS } from './EmergencySidebar'
import { SendIcon, PhoneIcon, UserIcon, CheckIcon } from '@components/ui/icons'

/**
 * Step indicator for each part of the walkthrough — a filled green
 * checkmark once that step is actually done, otherwise a plain numbered
 * circle so it's obvious both what order to work through this in and
 * how far along the person already is, at a glance, without reading
 * every line of text.
 */
function StepBadge({ num, done }) {
  return (
    <span className={`sms-preview-step-badge${done ? ' done' : ''}`}>
      {done ? <CheckIcon width={13} height={13} /> : num}
    </span>
  )
}

export default function EmergencyPreviewPanel({
  patient,
  situation,
  pickupFlag,
  message,
  effectivePhone,
  effectivePhoneValid,
  senderName,
  senderRole,
  canSend,
  sending,
  onSendClick,
  embedded = false,
}) {
  const template = SMS_TEMPLATES.find((t) => t.id === situation)
  const pickupOption = PICKUP_OPTIONS.find((o) => o.value === pickupFlag)
  const footer = buildSMSFooter(senderName, senderRole)
  // Derived from `message` itself (the single source of truth, built by
  // buildSMSMessage in EmergencyAlertsPage.jsx) rather than recomputed
  // independently — guarantees this always matches what's actually
  // sent, including notes, which this component doesn't otherwise have
  // access to. The footer is no longer a fixed string (it identifies
  // the sender, so it varies), but it's computed the same deterministic
  // way here as it was when `message` was built, so stripping it still
  // reliably isolates the actual composed content.
  const middle = message ? message.replace(`\n\n${footer}`, '') : ''

  return (
    <div className={`sms-preview-panel${embedded ? ' sms-preview-panel-embedded' : ''}`}>
      {!embedded && (
        <div className="sms-preview-header">
          <span>Compose &amp; Preview</span>
          <span className="sms-preview-live-badge">
            <span className="sms-preview-live-dot" /> Message Preview
          </span>
        </div>
      )}

      {/* Reordered into an actual build-up (Patient → Situation → Pickup
          → the message those three produce → who it's going to) instead
          of leading with the result before the steps that create it —
          reads top-to-bottom like a walkthrough, not a summary. */}
      <div className="sms-preview-body">
        <div className="sms-preview-section">
          <div className="sms-preview-section-title">
            <StepBadge num={1} done={!!patient} /> Choose the Patient
          </div>
          {patient ? (
            <div className="sms-preview-student">
              <Avatar user={patient} size={34} />
              <div>
                <div className="sms-preview-student-name">{patient.name}</div>
                <div className="sms-preview-student-sub">
                  {patient.course || patient.year_level ? `${patient.course || ''}${patient.course && patient.year_level ? ' \u00b7 ' : ''}${patient.year_level || ''}` : null}
                  {(patient.course || patient.year_level) && patient.student_number ? ' \u00b7 ' : ''}
                  {patient.student_number}
                </div>
              </div>
            </div>
          ) : (
            <div className="sms-preview-empty">Open <strong>Select Patient</strong> in the sidebar and pick who this is about.</div>
          )}
        </div>

        <div className="sms-preview-section">
          <div className="sms-preview-section-title">
            <StepBadge num={2} done={!!situation} /> Choose What Happened
          </div>
          {template ? (
            <div className="sms-preview-chip-row">
              <span className="sms-preview-chip-icon"><template.Icon width={17} height={17} /></span>
              <div>
                <div className="sms-preview-chip-label">{template.label}</div>
                <div className="sms-preview-chip-sub">
                  {template.id === 'custom' ? (
                    'Custom message written below'
                  ) : (
                    <>
                      {template.text}
                      {template.textTl && <><br /><span className="sms-preview-tagalog">"{template.textTl}"</span></>}
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="sms-preview-empty">Open <strong>Message Templates</strong> in the sidebar and pick a situation.</div>
          )}
        </div>

        <div className="sms-preview-section">
          <div className="sms-preview-section-title">
            <StepBadge num={3} done /> Pickup Instruction
          </div>
          <div className="sms-preview-chip-row">
            <span className="sms-preview-chip-icon"><PhoneIcon width={14} height={14} /></span>
            <div>
              <div className="sms-preview-chip-label">{pickupOption?.label}</div>
              <div className="sms-preview-chip-sub">{pickupOption?.sub}</div>
            </div>
          </div>
          <div className="sms-preview-step-hint">Already set to a sensible default — open <strong>Pickup Instructions</strong> in the sidebar only if this needs to change.</div>
        </div>

        <div className="sms-preview-section sms-preview-section-message">
          <div className="sms-preview-section-title">Message to Parent</div>
          {message ? (
            <>
              <div className="sms-preview-message-box">
                <div className="sms-preview-message-middle">
                  {(() => {
                    const lines = middle.split('\n')
                    return lines.map((line, i) => {
                      const isTagalog = line.startsWith('"') && line.endsWith('"')
                      return (
                        <span key={i} className={isTagalog ? 'sms-preview-tagalog' : undefined}>
                          {line}
                          {i < lines.length - 1 && <br />}
                        </span>
                      )
                    })
                  })()}
                </div>
                <div className="sms-preview-message-fixed">{footer}</div>
              </div>
              <div className="sms-preview-fixed-note">The signature line is added automatically based on who's sending — only the message above it is composed.</div>
              <div className="sms-preview-char-count">{message.length} characters</div>
            </>
          ) : (
            <div className="sms-preview-empty">Complete steps 1 and 2 above, and the message will appear here automatically.</div>
          )}
        </div>

        {patient && (
          <div className="sms-preview-section">
            <div className="sms-preview-section-title">Send To</div>
            <div className="sms-preview-chip-row">
              <span className="sms-preview-chip-icon"><UserIcon width={14} height={14} /></span>
              <div>
                <div className="sms-preview-chip-label">{effectivePhone || 'No number entered yet'}</div>
                <div className="sms-preview-chip-sub">
                  {patient.parent_relation || 'Parent/Guardian'}
                  {effectivePhone && !effectivePhoneValid ? ' \u2014 not a valid PH mobile number' : ''}
                  {effectivePhone && effectivePhoneValid && effectivePhone !== patient.parent_phone ? ' \u2014 entered manually' : ''}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="sms-preview-actions">
        {!canSend && (
          <div className="sms-preview-step-hint" style={{ textAlign: 'center', marginBottom: 2 }}>
            {!patient ? 'Finish step 1 to continue.' : !situation ? 'Finish step 2 to continue.' : !effectivePhoneValid ? 'A valid phone number is needed before sending.' : 'Finish the steps above to send.'}
          </div>
        )}
        <button
          type="button"
          className="btn sms-send-btn"
          disabled={!canSend || sending}
          onClick={onSendClick}
          style={!canSend ? { opacity: 0.5 } : undefined}
        >
          {sending ? 'Sending…' : (<><SendIcon width={13} height={13} /> Send SMS Alert</>)}
        </button>
      </div>
    </div>
  )
}