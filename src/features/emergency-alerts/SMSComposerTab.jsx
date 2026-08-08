import EmergencyPreviewPanel from './EmergencyPreviewPanel'

/**
 * Notify Parent's main panel — Compose & Preview only. The earlier
 * chat-thread/header/Quick-Actions UI (system messages, "Got it,
 * selected..." bubbles, the 6-item Quick Actions grid) was removed per
 * request; selection feedback now goes through toast notifications
 * (see EmergencyAlertsPage.jsx's handleSelectStudent etc.) instead of
 * chat bubbles. EmergencyPreviewPanel.jsx itself is unchanged and still
 * the single source of truth for the Patient/Situation/Pickup/Message/
 * Send-To summary — it's just the only thing rendered here now, at full
 * size instead of nested in a collapsible section.
 *
 *   onNotesChange(text): the free-text box below the preview feeds
 *     directly into the message being built (custom text, or extra
 *     notes, depending on the selected situation) — a plain controlled
 *     input now, with no separate "submit" step, since there's no chat
 *     log for it to also get appended to anymore.
 */
export default function SMSComposerTab({
  situationLabel,
  notesValue,
  onNotesChange,
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
}) {
  return (
    <div className="card sms-chat-main">
      <div className="sms-inline-preview-body sms-inline-preview-body-full">
        <EmergencyPreviewPanel
          patient={patient}
          situation={situation}
          pickupFlag={pickupFlag}
          message={message}
          effectivePhone={effectivePhone}
          effectivePhoneValid={effectivePhoneValid}
          senderName={senderName}
          senderRole={senderRole}
          canSend={canSend}
          sending={sending}
          onSendClick={onSendClick}
        />
      </div>

      <div className="sms-chat-input-row">
        <input
          type="text"
          className="sms-chat-input"
          placeholder={situationLabel === 'Custom Message' ? 'Type your custom message here…' : 'Type additional notes here…'}
          value={notesValue}
          onChange={(e) => onNotesChange(e.target.value)}
        />
      </div>
    </div>
  )
}