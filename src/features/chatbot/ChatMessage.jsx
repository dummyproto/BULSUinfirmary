import DOMPurify from 'dompurify'
import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { ConsultationIcon, AlertOctagonIcon } from '@components/ui/icons'

// Bot messages can come from two places: our own trusted rule-engine
// template strings (botEngine.js — deliberately use <strong>/<br> for
// formatting) OR an AI reply from the Groq-backed Edge Function, which
// is untrusted user-influenced content (prompt injection can make an
// LLM emit raw HTML/script). Rather than guessing which source a given
// message came from, ALWAYS sanitize before rendering as HTML, and only
// ever allow a small, fixed set of harmless formatting tags. This is
// safe regardless of source and doesn't rely on any heuristic.
const ALLOWED_TAGS = ['strong', 'b', 'em', 'i', 'br', 'div']

function sanitizeBotHtml(text) {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS, ALLOWED_ATTR: [] })
}

export default function ChatMessage({ message, userInitials, userAvatarUrl }) {
  const time = <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(message.ts)}</div>

  if (message.type === 'bot') {
    const bubbleClass = `msg-bubble bot${message.emergency ? ' emergency' : ''}`
    return (
      <div className="msg msg-bot-wrap">
        <div className="msg-avatar bot-av">
          {message.emergency ? <AlertOctagonIcon width={16} height={16} /> : <ConsultationIcon width={16} height={16} />}
        </div>
        <div className="msg-content-wrap">
          <div className={bubbleClass} dangerouslySetInnerHTML={{ __html: sanitizeBotHtml(message.text) }} />
          {time}
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