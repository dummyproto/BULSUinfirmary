import DOMPurify from 'dompurify'

export function toSpeechText(html) {
  const withPauses = (html || '').replace(/<br\s*\/?>/gi, '. ').replace(/<\/(div|li)>/gi, '. ')
  const plain = DOMPurify.sanitize(withPauses, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return plain.replace(/\s+/g, ' ').trim()
}

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

// Moved here from ChatMessage.jsx alongside toSpeechText above — this
// file exports plain helper functions only (no component), which is
// what react-refresh/only-export-components actually wants: a file
// that mixes a component's default export with named non-component
// exports breaks Fast Refresh's ability to hot-swap just that
// component without a full reload. ChatMessage.jsx and ChatLogModal.jsx
// both now import this from here instead of defining/re-exporting it
// themselves.
export function sanitizeBotHtml(text) {
  return DOMPurify.sanitize(normalizeBotHtml(text), { ALLOWED_TAGS, ALLOWED_ATTR: ['class', 'href'] })
}