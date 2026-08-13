import { useNavigate } from 'react-router-dom'
import RegisterModal from './RegisterModal'

// Registration used to live as an in-page modal toggled from within
// LoginPage (registerOpen/registerMounted state there). It now has its own
// route (/register) so it's bookmarkable/shareable and gets a real
// back-button history entry, while still reusing RegisterModal exactly as
// it was — same fixed, portal-rendered overlay, same step logic/validation
// — just driven by navigation instead of local show/hide state.
export default function RegisterPage() {
  const navigate = useNavigate()

  return (
    <RegisterModal
      isOpen
      onClose={() => navigate('/login')}
      onRegistered={(email, message) =>
        // Hand the just-registered email + success message back to
        // LoginPage via router state so it can prefill the sign-in form,
        // same as handleRegistered() used to do locally before this was
        // split into its own route.
        navigate('/login', { state: { registeredEmail: email, registeredMessage: message } })
      }
    />
  )
}