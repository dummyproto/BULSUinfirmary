import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext(undefined)

// Theme is a per-device UI preference, not sensitive/account data, and
// ThemeProvider sits ABOVE AuthProvider in App.jsx (so login/register
// pages get themed too, before anyone's signed in) — there's no signed-in
// user to attach a server-side preference to at the point this needs to
// read its initial value anyway. localStorage is the correct, standard
// mechanism for exactly this ("keep this UI choice for this browser"),
// which is why it's used here specifically despite the project's general
// move away from localStorage elsewhere (that move was about not using it
// for session/app state that actually needs to be correct and secure —
// a cosmetic light/dark toggle is a different case).
const THEME_STORAGE_KEY = 'clinic_theme'

function readStoredTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY)
    return stored === 'dark' || stored === 'light' ? stored : null
  } catch {
    // localStorage can throw (Safari private browsing on older versions,
    // storage disabled by the browser/an extension, quota issues) — treat
    // exactly like "nothing stored" rather than crashing theme init.
    return null
  }
}

function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  const stored = readStoredTheme()
  if (stored) return stored
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme)
    } catch {
      // Persistence failing (see readStoredTheme's comment) shouldn't
      // block the theme from actually applying for the rest of this
      // session — it just won't survive the next refresh.
    }
  }, [theme])

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }, [])

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (ctx === undefined) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}