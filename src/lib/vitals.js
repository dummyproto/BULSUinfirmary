// Vital Signs — input sanitization (character/format/length limits only)
// plus real-time status classification, per the clinic's defined normal
// ranges and maximum physically-typable limits. See
// NewConsultationTab/index.jsx for how these drive the red input-box
// styling and remark text shown under each field, and why Save is
// blocked only for the 'invalid' tier, not the 'warning' tier.

// ── Input sanitizers — format/length only, never rewrite the number ──
// Earlier versions of these functions silently clamped an over-limit
// value down to the ceiling as you typed (e.g. typing "350" for
// systolic instantly became "200") — which meant an out-of-range entry
// could never actually be SEEN or flagged, since it was rewritten before
// the person even finished typing it. The spec calls for the opposite:
// let the out-of-range number stay on screen, flag it red with an
// explicit "out of range" remark, and block Save — silent clamping
// defeats all of that. These now only strip disallowed characters and
// cap digit COUNT generously (enough that every stated maximum always
// fits with room to spare, so a genuinely out-of-range value is still
// typable and visible, not just the maximum itself), never the number.

export function maskBloodPressure(value) {
  let cleaned = value.replace(/[^0-9/]/g, '')
  const firstSlash = cleaned.indexOf('/')
  if (firstSlash !== -1) {
    cleaned = cleaned.slice(0, firstSlash + 1) + cleaned.slice(firstSlash + 1).replace(/\//g, '')
  }
  const [sysRaw, diaRaw] = cleaned.split('/')
  const sys = (sysRaw || '').slice(0, 3)
  if (diaRaw === undefined) return sys
  const dia = diaRaw.slice(0, 3)
  return `${sys}/${dia}`
}

export function maskTemperature(value) {
  let cleaned = value.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  const parts = cleaned.split('.')
  const whole = (parts[0] || '').slice(0, 3)
  const decimal = parts.length > 1 ? parts[1].slice(0, 1) : undefined
  return decimal !== undefined ? `${whole}.${decimal}` : whole
}

export function capPulse(value) {
  return value.replace(/[^0-9]/g, '').slice(0, 3)
}

export function capO2Sat(value) {
  return value.replace(/[^0-9]/g, '').slice(0, 3)
}

// ── Absolute maximum input limits ──
export const BP_MAX_SYSTOLIC = 300
export const BP_MAX_DIASTOLIC = 200
export const TEMP_MAX = 45.0
export const PULSE_MAX = 250
export const O2_MAX = 100

// ── Real-time status classification ──
// Each returns { tier, remark }:
//   'empty'   — field hasn't been filled in yet. No remark, no red
//               border, never blocks Save (vitals stay optional, same
//               as before this feature existed).
//   'normal'  — within the healthy range.
//   'warning' — outside the healthy range but medically plausible
//               (High/Low/Fever/etc.) — shown red, does NOT block Save.
//   'invalid' — exceeds the absolute maximum above, or isn't a
//               well-formed value at all — shown red, DOES block Save.

export function bpStatus(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return { tier: 'empty', remark: '' }
  const match = trimmed.match(/^(\d+)\/(\d+)$/)
  if (!match) return { tier: 'invalid', remark: 'Enter as systolic/diastolic, e.g. 120/80.' }
  const sys = parseInt(match[1], 10)
  const dia = parseInt(match[2], 10)
  if (sys === 0 || dia === 0) return { tier: 'invalid', remark: 'Enter a valid blood pressure reading.' }
  if (sys > BP_MAX_SYSTOLIC || dia > BP_MAX_DIASTOLIC) {
    return { tier: 'invalid', remark: `Out of range — maximum is ${BP_MAX_SYSTOLIC}/${BP_MAX_DIASTOLIC} mmHg.` }
  }
  if (sys >= 140 || dia >= 90) return { tier: 'warning', remark: 'High BP' }
  if (sys < 90 || dia < 60) return { tier: 'warning', remark: 'Low BP' }
  return { tier: 'normal', remark: 'Normal BP' }
}

export function temperatureStatus(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return { tier: 'empty', remark: '' }
  const num = parseFloat(trimmed)
  if (Number.isNaN(num) || num <= 0) return { tier: 'invalid', remark: 'Enter a valid temperature.' }
  if (num > TEMP_MAX) return { tier: 'invalid', remark: `Out of range — maximum is ${TEMP_MAX.toFixed(1)}°C.` }
  if (num >= 38.0) return { tier: 'warning', remark: 'Fever' }
  if (num < 36.0) return { tier: 'warning', remark: 'Low Temperature' }
  return { tier: 'normal', remark: 'Normal Temperature' }
}

export function pulseStatus(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return { tier: 'empty', remark: '' }
  const num = parseInt(trimmed, 10)
  if (Number.isNaN(num) || num <= 0) return { tier: 'invalid', remark: 'Enter a valid pulse rate.' }
  if (num > PULSE_MAX) return { tier: 'invalid', remark: `Out of range — maximum is ${PULSE_MAX} bpm.` }
  if (num > 100) return { tier: 'warning', remark: 'High Pulse Rate' }
  if (num < 60) return { tier: 'warning', remark: 'Low Pulse Rate' }
  return { tier: 'normal', remark: 'Normal Pulse' }
}

export function o2satStatus(value) {
  const trimmed = (value || '').trim()
  if (!trimmed) return { tier: 'empty', remark: '' }
  const num = parseInt(trimmed, 10)
  if (Number.isNaN(num) || num <= 0) return { tier: 'invalid', remark: 'Enter a valid oxygen saturation.' }
  if (num > O2_MAX) return { tier: 'invalid', remark: `Out of range — maximum is ${O2_MAX}%.` }
  if (num < 90) return { tier: 'warning', remark: 'Low O₂ Saturation' }
  return { tier: 'normal', remark: 'Normal O₂ Saturation' }
}

// Convenience map so the form component can loop over all four fields
// generically instead of hardcoding four separate if/else branches.
export const VITAL_STATUS_FNS = {
  bp: bpStatus,
  temp: temperatureStatus,
  pulse: pulseStatus,
  o2sat: o2satStatus,
}