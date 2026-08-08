export function validatePassword(pw) {
  if (!pw || pw.length < 8) return { ok: false, msg: 'Password must be at least 8 characters.' }
  if (!/[A-Z]/.test(pw)) return { ok: false, msg: 'Password must contain at least one uppercase letter.' }
  if (!/[0-9]/.test(pw)) return { ok: false, msg: 'Password must contain at least one number.' }
  if (!/[^A-Za-z0-9]/.test(pw)) return { ok: false, msg: 'Password must contain at least one special character (!@#$% etc.).' }
  return { ok: true, msg: 'Strong password' }
}

import { KeyIcon, BriefcaseIcon, GraduationCapIcon } from '@components/ui/icons'

export function roleBadgeInfo(role) {
  const color = { admin: 'red', staff: 'blue', patient: 'green' }[role] || 'gray'
  const label = { admin: 'Admin', staff: 'Staff', patient: 'Patient' }[role] || role
  const Icon = { admin: KeyIcon, staff: BriefcaseIcon, patient: GraduationCapIcon }[role] || null
  return { color, label, Icon }
}
export function initialsFor(name) {
  const fromParts = name
    .split(' ')
    .map((p) => p[0] || '')
    .join('')
    .toUpperCase()
    .substring(0, 2)
  return fromParts || name.substring(0, 2).toUpperCase()
}