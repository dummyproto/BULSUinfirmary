// Same allowed character set as the legacy allowVitalsInput/cleanVitalsInput
// — kept as a general-purpose fallback, though every vital field below now
// has its own dedicated, exact-limit function instead of relying on this
// alone.
export function sanitizeVitals(value) {
  return value.replace(/[^0-9\s.,/%+\-()]/g, '')
}

/**
 * Blood Pressure — "systolic/diastolic". Systolic capped at 200,
 * diastolic capped at 10 (per exact spec). Only one slash allowed; each
 * side is clamped down to its ceiling the instant it's exceeded, not
 * just after the field loses focus.
 */
export function maskBloodPressure(value) {
  let cleaned = value.replace(/[^0-9/]/g, '')
  const firstSlash = cleaned.indexOf('/')
  if (firstSlash !== -1) {
    cleaned = cleaned.slice(0, firstSlash + 1) + cleaned.slice(firstSlash + 1).replace(/\//g, '')
  }
  const [sysRaw, diaRaw] = cleaned.split('/')

  let sys = (sysRaw || '').slice(0, 3)
  if (sys && parseInt(sys, 10) > 200) sys = '200'

  if (diaRaw === undefined) return sys

  let dia = diaRaw.slice(0, 2)
  if (dia && parseInt(dia, 10) > 10) dia = '10'
  return `${sys}/${dia}`
}

/**
 * Temperature — at most 3 digits before the decimal, 2 after, and the
 * resulting number is never allowed to exceed 120.10 exactly.
 */
export function maskTemperature(value) {
  let cleaned = value.replace(/[^0-9.]/g, '')
  const firstDot = cleaned.indexOf('.')
  if (firstDot !== -1) {
    cleaned = cleaned.slice(0, firstDot + 1) + cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  const parts = cleaned.split('.')
  let whole = (parts[0] || '').slice(0, 3)
  let decimal = parts.length > 1 ? parts[1].slice(0, 2) : undefined
  let result = decimal !== undefined ? `${whole}.${decimal}` : whole

  const num = parseFloat(result)
  if (!Number.isNaN(num) && num > 120.1) {
    result = '120.10'
  }
  return result
}

/** Pulse Rate — digits only, capped at exactly 200. */
export function capPulse(value) {
  let cleaned = value.replace(/[^0-9]/g, '').slice(0, 3)
  const num = parseInt(cleaned, 10)
  if (!Number.isNaN(num) && num > 200) cleaned = '200'
  return cleaned
}

/** O₂ Saturation (%) — digits only, capped at exactly 100. */
export function capO2Sat(value) {
  let cleaned = value.replace(/[^0-9]/g, '').slice(0, 3)
  const num = parseInt(cleaned, 10)
  if (!Number.isNaN(num) && num > 100) cleaned = '100'
  return cleaned
}