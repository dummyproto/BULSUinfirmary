import DOMPurify from 'dompurify'
import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { AlertOctagonIcon, Volume2Icon, VolumeXIcon } from '@components/ui/icons'
import BotFace from './BotFace'
import { toSpeechText } from './chatText'

// Bot messages can come from two places: our own trusted rule-engine
// template strings (botEngine.js — deliberately use <strong>/<br> for
// formatting) OR an AI reply from the Groq-backed Edge Function, which
// is untrusted user-influenced content (prompt injection can make an
// LLM emit raw HTML/script). Rather than guessing which source a given
// message came from, ALWAYS sanitize before rendering as HTML, and only
// ever allow a small, fixed set of harmless formatting tags. This is
// safe regardless of source and doesn't rely on any heuristic.
//
// 'a' + 'href' added so the clinic's phone number can render as a real
// tap-to-call link (both from botEngine.js's own templates and from the
// AI path, which is told to format it the same way — see
// SYSTEM_PROMPT in chat-completion/knowledge.ts). DOMPurify's default
// URI sanitizer already restricts href to a safe scheme allowlist
// (http/https/mailto/tel/etc.) and strips anything like javascript: on
// its own, so this doesn't reopen the XSS risk the rest of this comment
// is about — an untrusted AI reply still can't inject a script this way,
// only a plain link.
const ALLOWED_TAGS = ['strong', 'b', 'em', 'i', 'br', 'div', 'span', 'ul', 'ol', 'li', 'a']

// The AI path (Groq) is told in SYSTEM_PROMPT to use <strong>/<br> instead
// of markdown, and to break a longer answer into separate paragraphs —
// but LLMs don't always follow formatting instructions consistently (e.g.
// a long free-form answer slipping back into **bold**/*italic* markdown,
// or running everything into one dense block with no paragraph breaks).
// Cleans that up before sanitizing, so spacing/readability stays
// consistent no matter what the model actually returned. Runs before
// sanitizeBotHtml, so any tags this introduces still pass through the
// same allowlist. A no-op for the rule-engine's own template strings
// (botEngine.js), which never contain markdown syntax or raw newlines.
function normalizeBotHtml(text) {
  return String(text)
    // **bold** / __bold__ -> <strong>. Non-greedy so multiple bolded
    // spans in one message don't collapse into a single overlong match.
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    // Leftover single *italic*/_italic_ (checked after the bold pass
    // above, so it doesn't eat the single asterisks bold already used).
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/(?<!\w)_(.+?)_(?!\w)/g, '<em>$1</em>')
    // Blank-line-separated paragraphs (model wrote real newlines) become
    // a visible paragraph gap; single newlines become a normal line break.
    .replace(/\n\s*\n/g, '<br><br>')
    .replace(/\n/g, '<br>')
}

export function sanitizeBotHtml(text) {
  return DOMPurify.sanitize(normalizeBotHtml(text), { ALLOWED_TAGS, ALLOWED_ATTR: ['class', 'href'] })
}


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