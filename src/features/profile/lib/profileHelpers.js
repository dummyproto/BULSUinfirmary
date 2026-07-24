export const COURSES = ['BS Computer Science', 'BS Information Technology', 'BS Nursing', 'BS Education', 'BS Business Administration', 'BS Accountancy', 'BS Engineering', 'BS Architecture', 'BS Medicine', 'BS Psychology', 'AB Communication', 'AB Political Science']
export const YEAR_LEVELS = ['1st Year', '2nd Year', '3rd Year', '4th Year', '5th Year']
export const GENDERS = ['Male', 'Female', 'Prefer not to say']
export const CIVIL_STATUSES = ['Single', 'Married', 'Widowed', 'Separated', 'Annulled']
export const BLOOD_TYPES = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']
export const RELATIONS = ['Father', 'Mother', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Sibling', 'Guardian', 'Other']

export const ROLE_LABELS = { admin: 'System Administrator', staff: 'Clinic Personnel', patient: 'Patient' }
export const ROLE_GRADIENTS = {
  admin: 'linear-gradient(135deg,#DC2626,#991B1B)',
  staff: 'linear-gradient(135deg,#1E7B5E,#6A3FA0)',
  patient: 'linear-gradient(135deg,#16A34A,#059669)',
}

export function buildFullName({ surname, givenName, mi, ext }, fallback) {
  if (!surname || !givenName) return fallback || ''
  const miPart = mi ? `${mi}. ` : ''
  const extPart = ext ? `, ${ext}` : ''
  return `${givenName} ${miPart}${surname}${extPart}`.trim()
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
