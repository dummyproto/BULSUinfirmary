import DOMPurify from 'dompurify'

export function toSpeechText(html) {
  const withPauses = (html || '').replace(/<br\s*\/?>/gi, '. ').replace(/<\/(div|li)>/gi, '. ')
  const plain = DOMPurify.sanitize(withPauses, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] })
  return plain.replace(/\s+/g, ' ').trim()
}