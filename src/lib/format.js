// Display-only formatting for a User Number field — the underlying stored
// value stays plain alphanumeric characters (no dashes); this only formats
// what's rendered in an input or read-only display. Two shapes supported:
//  - Student numbers: digits only, formatted 4-3-3 (e.g. 2023-400-878).
//  - Instructor / campus personnel numbers: a short letter prefix followed
//    by digits, formatted LETTERS-DIGITS (e.g. CMP-123456).
// Shared by RegisterModal (Step 1's User Number field) and
// EmergencyReportModal (the pre-login "that's you" self-identify field) so
// both format/parse User Numbers identically.
export function formatUserNumber(raw) {
  const clean = String(raw || '').toUpperCase()
  const letters = clean.match(/^[A-Z]+/)?.[0] || ''
  if (letters) {
    const digits = clean.slice(letters.length)
    return digits ? `${letters}-${digits}` : letters
  }
  const parts = [clean.slice(0, 4), clean.slice(4, 7), clean.slice(7, 10)].filter(Boolean)
  return parts.join('-')
}
// Partial masking for a User Number shown somewhere browsable by people
// who aren't necessarily that patient — e.g. the pre-login Emergency
// Alert's "Select Patient" list, which lets anyone (signed in or not)
// see every registered patient's name to pick who the alert is about.
// Keeps the first 4 and last 2 characters visible (enough to recognize/
// confirm your own number) and always masks the middle with a fixed 4
// asterisks, e.g. "2023004889" -> "2023****89", regardless of the actual
// hidden-character count — a fixed mask length doesn't leak the real
// number's length the way a 1-asterisk-per-character mask would.
export function maskUserNumber(raw) {
  const clean = String(raw || '')
  if (clean.length <= 6) return clean.replace(/./g, '*')
  return `${clean.slice(0, 4)}****${clean.slice(-2)}`
}

export function formatDate(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function formatDateTime(value) {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return (
    d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit', hour12: true })
  )
}