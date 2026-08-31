import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { getInitialTheme, THEME_STORAGE_KEY } from './themeUtils'

const ThemeContext = createContext(undefined)

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

    const value = useMemo(() => ({ theme, setTheme, toggleTheme }), [theme, toggleTheme])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (ctx === undefined) throw new Error('useTheme must be used within a ThemeProvider')
  return ctx
}