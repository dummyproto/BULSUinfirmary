export const COURSES = ['BS Computer Science', 'BS Information Technology', 'BS Nursing', 'BS Education', 'BS Business Administration', 'BS Accountancy', 'BS Engineering', 'BS Architecture', 'BS Medicine', 'BS Psychology', 'AB Communication', 'AB Political Science']
export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year']
export const GENDERS = ['Male', 'Female', 'Prefer not to say']
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled']
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
// No periods — the previous free-text field stripped non-letter
// characters (including periods) via its own onChange handler, so any
// value already saved for an existing patient is plain letters only
// (e.g. "Jr", not "Jr."). Matching that here means existing saved
// values still match one of these options instead of falling through
// to the dropdown's blank "-- Select --" state.
export const EXTENSIONS = ['Jr', 'Sr', 'II', 'III', 'IV', 'V']
export const RELATIONS = ['Father', 'Mother', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Sibling', 'Guardian', 'Other']

export const ROLE_LABELS = { admin: 'System Administrator', staff: 'Clinic Personnel', patient: 'Patient' }
export const ROLE_GRADIENTS = {
  admin: 'linear-gradient(135deg,rgba(220,38,38,.38),rgba(153,27,27,.38))',
  staff: 'linear-gradient(135deg,rgba(30,123,94,.38),rgba(106,63,160,.38))',
  patient: 'linear-gradient(135deg,rgba(22,163,74,.38),rgba(5,150,105,.38))',
}

export function buildFullName({ surname, givenName, mi, ext }, fallback) {
  if (!surname || !givenName) return fallback || ''
  const miPart = mi ? `${mi}. ` : ''
  const extPart = ext ? `, ${ext}` : ''
  return `${givenName} ${miPart}${surname}${extPart}`.trim()
}

// Same personnel-ID pattern RegisterModal.jsx uses at registration (letter
// prefix + digits, e.g. CMP-123456) vs. a plain 10-digit student number —
// reused here so Account Settings can tell the two apart from the stored
// User/ID Number alone, without a separate role/type column.
export function isPersonnelNumber(userId) {
  return /^[A-Z]{2,6}\d{4,10}$/.test(String(userId || '').trim().toUpperCase())
}

export function calcAge(dob) {
  if (!dob) return '—'
  const today = new Date()
  const b = new Date(dob)
  let age = today.getFullYear() - b.getFullYear()
  const m = today.getMonth() - b.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < b.getDate())) age--
  return `${age} years old`
}