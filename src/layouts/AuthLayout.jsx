import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useTheme } from '@context/ThemeContext'
import ToastViewport from '@components/ui/ToastViewport'
import LoginHelpModal from '@features/auth/LoginHelpModal'
import { HelpCircleIcon } from '@components/ui/icons'

export default function AuthLayout({ children }) {
  const { theme } = useTheme()
  const { pathname } = useLocation()
  const [helpOpen, setHelpOpen] = useState(false)
  // Scoped to the actual login screen only — Reset Password and Register
  // also render inside this same layout, but this button's content
  // (registration, login, forgot password, remember me, scan ID, SOS)
  // is specifically about the login screen itself.
  const showHelpButton = pathname === '/login'

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
      {showHelpButton && (
        <>
          <button
            type="button"
            className="login-help-btn"
            onClick={() => setHelpOpen(true)}
            title="Login Help"
            aria-label="Login Help"
          >
            <HelpCircleIcon width={22} height={22} />
          </button>
          <LoginHelpModal isOpen={helpOpen} onClose={() => setHelpOpen(false)} />
        </>
      )}
      <ToastViewport />
    </div>
  )
}