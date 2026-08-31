export const THEME_STORAGE_KEY = 'bulsu-infirmary-theme'

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    return null
  }
}

export function getInitialTheme() {
  const stored = readStoredTheme()
  if (stored) return stored

  try {
    if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  } catch {
    // matchMedia unavailable/throwing — fall through to the default below.
  }

  return 'light'
}