// Same allowed character set as the legacy allowVitalsInput/cleanVitalsInput
// (digits, whitespace, . , / % + - ( )) — applied on each change instead of
// intercepting keydown, since these are now controlled React inputs.
export function sanitizeVitals(value) {
  return value.replace(/[^0-9\s.,/%+\-()]/g, '')
}
