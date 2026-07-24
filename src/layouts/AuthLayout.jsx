import { useEffect } from 'react'
import { useTheme } from '@context/ThemeContext'
import ToastViewport from '@components/ui/ToastViewport'

export default function AuthLayout({ children }) {
  const { theme } = useTheme()

  // The login screen is the first, unauthenticated impression of the app
  // and its branded card/gradient design wasn't built with dark-mode
  // overrides in mind — it should always present in light mode,
  // regardless of the visitor's OS/browser color-scheme preference
  // (which is what ThemeProvider otherwise follows for the whole app).
  // Once inside the authenticated app, normal theme behavior resumes —
  // restored here on unmount rather than hardcoded, so a user who
  // manually toggled dark mode before logging out doesn't lose that
  // preference for the rest of their session.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'light')
    return () => {
      document.documentElement.setAttribute('data-theme', theme)
    }
  }, [theme])

  return (
    <div id="page-login">
      <div className="login-card">{children}</div>
      <ToastViewport />
    </div>
  )
}
