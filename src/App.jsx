import { BrowserRouter } from 'react-router-dom'
import { AuthProvider } from '@context/AuthContext'
import { PresenceProvider } from '@context/PresenceContext'
import { ThemeProvider } from '@context/ThemeContext'
import { ToastProvider } from '@context/ToastContext'
import { ConfirmProvider } from '@context/ConfirmContext'
import AppRoutes from '@routes/AppRoutes'

function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <ConfirmProvider>
          <AuthProvider>
            <PresenceProvider>
              <BrowserRouter>
                <AppRoutes />
              </BrowserRouter>
            </PresenceProvider>
          </AuthProvider>
        </ConfirmProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export default App