export function normalizeSchoolIdCode(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, '')
    .toUpperCase()
}

/**
 * Pulls a school ID / barcode value out of whatever a QR code actually
 * encoded — could be raw text, a JSON payload, a URL with the code as a
 * query param, or a labeled line like "Student ID: 2021-00123".
 */
export function extractSchoolIdCode(raw) {
  const text = String(raw || '').trim()
  if (!text) return ''

  try {
    const data = JSON.parse(text)
    if (data && typeof data === 'object') {
      return data.schoolIdBarcode || data.barcode || data.userId || data.studentId || data.id || text
    }
  } catch {
    // Not JSON — fall through to the other extraction strategies.
  }

  const paramMatch = text.match(/[?&](?:schoolIdBarcode|barcode|userId|studentId|id)=([^&]+)/i)
  if (paramMatch) return decodeURIComponent(paramMatch[1])

  const labelMatch = text.match(/(?:SCHOOL[-_\s]*ID|STUDENT[-_\s]*(?:NO|NUMBER|ID)|BARCODE)\s*[:=]\s*([A-Za-z0-9\-_.]+)/i)
  return labelMatch ? labelMatch[1] : text
}
