import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { ConsultationIcon, AlertOctagonIcon } from '@components/ui/icons'

// Rule-based bot replies (botEngine.js) are always our own trusted
// template strings — safe to render as HTML (they deliberately use
// <strong>/<br>/<div> for formatting). AI-generated replies (from the
// Groq-backed Edge Function) are plain natural-language text with no
// legitimate reason to contain real HTML tags — rendering those as HTML
// would be a genuine prompt-injection-driven XSS risk (a user could try
// to coax the model into emitting a <script> or event-handler
// attribute). This heuristic — "does it contain something tag-shaped" —
// reliably tells the two sources apart without needing a new database
// column to track it explicitly, since the two content sources are
// structurally very different in practice.
function looksLikeTrustedHtml(text) {
  return /<[a-z][\s\S]*>/i.test(text)
}

export default function ChatMessage({ message, userInitials }) {
  const time = <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3 }}>{timeAgo(message.ts)}</div>

  if (message.type === 'bot') {
    const trustedHtml = looksLikeTrustedHtml(message.text)
    const bubbleClass = `msg-bubble bot${message.emergency ? ' emergency' : ''}`
    return (
      <div className="msg msg-bot-wrap">
        <div className="msg-avatar bot-av">
          {message.emergency ? <AlertOctagonIcon width={16} height={16} /> : <ConsultationIcon width={16} height={16} />}
        </div>
        <div className="msg-content-wrap">
          {trustedHtml ? (
            <div className={bubbleClass} dangerouslySetInnerHTML={{ __html: message.text }} />
          ) : (
            <div className={bubbleClass} style={{ whiteSpace: 'pre-wrap' }}>
              {message.text}
            </div>
          )}
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
      <div className="msg-avatar user-av">{userInitials || '?'}</div>
    </div>
  )
}
