import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const ThemeContext = createContext(undefined)

// NOTE: previously persisted to localStorage ('clinic_theme'). Per Phase 4's
// explicit instruction to remove every localStorage usage, this now only
// reads the OS-level color-scheme preference on first load and otherwise
// lives in memory for the session — the theme choice no longer survives a
// page reload. A real cross-device/persisted preference would need a
// `user_prefs` table (not part of the current schema) written through
// Supabase once a user is signed in.
function getInitialTheme() {
  if (typeof window === 'undefined') return 'light'
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches
  return prefersDark ? 'dark' : 'light'
}

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(getInitialTheme)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
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
