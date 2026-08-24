import DOMPurify from 'dompurify'
import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { AlertOctagonIcon, Volume2Icon, VolumeXIcon } from '@components/ui/icons'
import BotFace from './BotFace'

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

function sanitizeBotHtml(text) {
  return DOMPurify.sanitize(text, { ALLOWED_TAGS, ALLOWED_ATTR: ['class', 'href'] })
}

// Plain-text version of a bot reply, for the "tap to listen" button
// (useSpeechSynthesis.js) — speaking the raw HTML string directly would
// read the tags themselves aloud (literally saying "strong", "br", the
// angle brackets, etc.). <br>/</div>/</li> become ". " first so a line
// break or list item still reads as a natural pause instead of running
// straight into the next one with no gap at all once the tags are gone.
export function toSpeechText(html) {
  const withPauses = (html || '').replace(/<br\s*\/?>/gi, '. ').replace(/<\/(div|li)>/gi, '. ')
  const plain = DOMPurify.sanitize(withPauses, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return plain.replace(/\s+/g, ' ').trim()
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