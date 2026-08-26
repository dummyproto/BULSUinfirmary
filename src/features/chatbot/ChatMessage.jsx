import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { AlertOctagonIcon, Volume2Icon, VolumeXIcon } from '@components/ui/icons'
import BotFace from './BotFace'
import { toSpeechText, sanitizeBotHtml } from './chatText'

export default function ChatMessage({ message, userInitials, userAvatarUrl, speakId, speakingId, onToggleSpeak, speechSupported }) {
  const time = <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(message.ts)}</div>

  if (message.type === 'bot') {
    const bubbleClass = `msg-bubble bot${message.emergency ? ' emergency' : ''}`
    const isSpeaking = speakingId === speakId
    return (
      <div className="msg msg-bot-wrap">
        <div className="msg-avatar bot-av">
          {message.emergency ? <AlertOctagonIcon width={16} height={16} /> : <BotFace size={32} />}
        </div>
        <div className="msg-content-wrap">
          <div className={bubbleClass} dangerouslySetInnerHTML={{ __html: sanitizeBotHtml(message.text) }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {time}
            {speechSupported && (
              <button
                type="button"
                className="msg-listen-btn"
                title={isSpeaking ? 'Stop reading aloud' : 'Listen to this reply'}
                aria-label={isSpeaking ? 'Stop reading aloud' : 'Listen to this reply'}
                onClick={() => onToggleSpeak(speakId, toSpeechText(message.text))}
              >
                {isSpeaking ? <Volume2Icon width={12} height={12} /> : <VolumeXIcon width={12} height={12} />}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="msg msg-user-wrap">
      <div className="msg-content-wrap" style={{ alignItems: 'flex-end' }}>
        {/* Plain JSX text — React escapes this automatically. The legacy
            version inserted raw user text via innerHTML here, which was an
            actual (if low-stakes, single-user-only) XSS hole; not replicated. */}
        <div className="msg-bubble user">{message.text}</div>
        {time}
      </div>
      <div className="msg-avatar user-av">
        {userAvatarUrl ? <img src={userAvatarUrl} alt="" /> : userInitials || '?'}
      </div>
    </div>
  )
}