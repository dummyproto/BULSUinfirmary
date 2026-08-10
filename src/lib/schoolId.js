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
  // Capped at 50 to match users.school_id_barcode's VARCHAR(50) column —
  // without this, a QR code that doesn't match any of the patterns
  // above falls through to returning the ENTIRE raw scanned text
  // uncapped, which the database then rejects outright rather than
  // just truncating it, breaking registration/login for that person
  // entirely.
  return (labelMatch ? labelMatch[1] : text).slice(0, 50)
}

/**
 * Registration counterpart to `extractSchoolIdCode` (Phase Q) — a student
 * ID QR code used for registration is expected to carry more than just the
 * bare code: student number, name, and course, at minimum. Handles the
 * same three shapes (JSON, query-param URL, labeled lines) the login flow
 * already handles, but returns the whole set of fields instead of a single
 * code — falling back gracefully (empty string) per field when the QR
 * payload doesn't contain it, since `RegisterQrScan` still has to work with
 * partial data (see its "unknown/unseeded code" path).
 *
 * `rawCode` in the return value is always populated (via
 * `extractSchoolIdCode`) — it's what gets looked up against
 * `registration_qr_codes` and, later, written to `users.school_id_barcode`
 * so scan-to-login works for this account afterward.
 */
export function extractRegistrationPayload(raw) {
  const text = String(raw || '').trim()
  const rawCode = extractSchoolIdCode(text)
  const empty = { studentNumber: '', fullName: '', course: '', yearLevel: '', rawCode }
  if (!text) return empty

  try {
    const data = JSON.parse(text)
    if (data && typeof data === 'object') {
      return {
        studentNumber: data.studentNumber || data.studentId || data.userId || data.id || '',
        fullName: data.fullName || data.name || '',
        course: data.course || data.program || '',
        yearLevel: data.yearLevel || data.year || '',
        rawCode,
      }
    }
  } catch {
    // Not JSON — fall through to the other extraction strategies.
  }

  const params = {}
  const paramRe = /[?&](studentNumber|studentId|userId|id|fullName|name|course|program|yearLevel|year)=([^&]+)/gi
  let m
  while ((m = paramRe.exec(text))) {
    params[m[1].toLowerCase()] = decodeURIComponent(m[2])
  }
  if (Object.keys(params).length) {
    return {
      studentNumber: params.studentnumber || params.studentid || params.userid || params.id || '',
      fullName: params.fullname || params.name || '',
      course: params.course || params.program || '',
      yearLevel: params.yearlevel || params.year || '',
      rawCode,
    }
  }

  // Labeled-line shape, e.g.:
  //   Student No: 2021-00123
  //   Name: Juan dela Cruz
  //   Course: BS Computer Science
  const line = (labelPattern) => {
    const match = text.match(labelPattern)
    return match ? match[1].trim() : ''
  }
  return {
    studentNumber: line(/(?:STUDENT[-_\s]*(?:NO|NUMBER|ID)|SCHOOL[-_\s]*ID)\s*[:=]\s*([A-Za-z0-9\-_.]+)/i),
    fullName: line(/(?:NAME|FULL[-_\s]*NAME)\s*[:=]\s*([^\n\r]+)/i),
    course: line(/(?:COURSE|PROGRAM)\s*[:=]\s*([^\n\r]+)/i),
    yearLevel: line(/(?:YEAR[-_\s]*LEVEL|YEAR)\s*[:=]\s*([^\n\r]+)/i),
    rawCode,
  }
}