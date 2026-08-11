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

/**
 * Generates a fresh, unique ID code for users.school_id_barcode —
 * used both for staff/admin accounts (which never had one, since only
 * patient self-registration via QR scan ever populated this column)
 * and for regenerating a patient's code from Maintenance -> Edit User.
 * Capped at 50 characters to match the column exactly (same reasoning
 * as the registration username fix — never produce a value the
 * database would reject outright).
 */
/**
 * Generates a fresh, unique ID code for users.school_id_barcode —
 * used both for staff/admin accounts (which never had one, since only
 * patient self-registration via QR scan ever populated this column)
 * and for regenerating a patient's code from Maintenance -> Edit User.
 * Capped at 50 characters to match the column exactly (same reasoning
 * as the registration username fix — never produce a value the
 * database would reject outright).
 */
export function generateSchoolIdCode() {
  // Same structure as the registration QR system's own code format
  // (generateCode('REG') there) — prefix, dash, then a 5-char time
  // segment and 5-char random segment concatenated with no second
  // dash. Only the prefix differs ('ID' here vs 'REG' there), so a code
  // from either system is immediately recognizable as the same kind of
  // identifier at a glance.
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase()
  const time = Date.now().toString(36).toUpperCase().slice(-5)
  return `ID-${time}${rand}`.slice(0, 50)
}

/**
 * Generates a staff/admin account's ID number (staff_profiles.staff_id_number).
 * Deliberately different from generateSchoolIdCode() above and from
 * patients' student_number: purely random, with no timestamp component
 * at all (unlike generateSchoolIdCode, which embeds a time segment) —
 * a timestamp-derived value is somewhat guessable if you know roughly
 * when an account was created, which is an acceptable tradeoff for a
 * QR login convenience code but not for the account identifier of a
 * role with materially more privileged system access. Also,
 * unlike patients' student_number (a real, admin-typed, often
 * sequential school-assigned number), this is never manually entered —
 * always system-generated, and shown read-only in the UI.
 */
export function generateStaffId() {
  const rand = Array.from({ length: 10 }, () => Math.random().toString(36)[2] || '0').join('').toUpperCase()
  return `STF-${rand}`.slice(0, 30)
}