import Modal from '@components/ui/Modal'
import { HelpCircleIcon, UserIcon, MailIcon, KeyIcon, CheckCircleIcon, CreditCardIcon, AlertOctagonIcon } from '@components/ui/icons'

const TOPICS = [
  {
    title: 'Creating an account',
    Icon: UserIcon,
    body: (
      <p>
        New patients tap <strong>Register</strong> at the bottom of this page. You'll provide your First Name, Last Name,
        Student/User ID, phone number, course, year level, email, a username, and a password. Scanning your school ID's QR
        code during registration can pre-fill some of these fields automatically.
      </p>
    ),
  },
  {
    title: 'Signing in',
    Icon: MailIcon,
    body: (
      <p>
        Use the <strong>Email &amp; Password</strong> tab with your registered email or username and password, or switch to
        the <strong>Scan ID</strong> tab (below) as a faster alternative.
      </p>
    ),
  },
  {
    title: 'Forgot Password',
    Icon: KeyIcon,
    body: (
      <p>
        Tap <strong>Forgot Password?</strong> below the password field. Enter your registered email and we'll send a link to
        reset it — follow the instructions in that email to set a new password.
      </p>
    ),
  },
  {
    title: 'Remember Me',
    Icon: CheckCircleIcon,
    body: (
      <p>
        The <strong>Remember Me</strong> checkbox keeps you signed in on this device/browser between visits, so you won't
        need to log in again every time. Leave it unchecked on a shared or public computer.
      </p>
    ),
  },
  {
    title: 'Scan ID',
    Icon: CreditCardIcon,
    body: (
      <p>
        Switch to the <strong>Scan ID</strong> tab and use your camera to scan your school ID's QR/barcode to identify your
        account instantly, instead of typing your email. If you've set a quick-login PIN (from your profile once signed in),
        this brings up a 4-digit PIN pad instead of your password — a faster way to sign in. Without a PIN set, you'll still
        enter your password as usual afterward.
      </p>
    ),
  },
  {
    title: 'SOS Button',
    Icon: AlertOctagonIcon,
    accent: true,
    body: (
      <p>
        The red <strong>SOS</strong> button (top of this page) is available even before signing in. Tap it to confirm, then
        describe the emergency and your location — it's sent directly to clinic staff right away. Use this any time you or
        someone nearby needs urgent help.
      </p>
    ),
  },
]

/**
 * Quick-reference help for the login screen itself — separate from the
 * full in-app User Manual (UserManualModal.jsx), which only exists once
 * someone is actually signed in. Covers just the handful of things
 * visible right here: registration, signing in, forgot password,
 * remember me, scan ID, and the SOS button.
 */
export default function LoginHelpModal({ isOpen, onClose }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Login Help" icon={<HelpCircleIcon width={17} height={17} />}>
      <div className="login-help-list">
        {TOPICS.map((t) => (
          <div key={t.title} className={`login-help-item${t.accent ? ' accent' : ''}`}>
            <div className="login-help-item-icon">
              <t.Icon width={16} height={16} />
            </div>
            <div className="login-help-item-body">
              <h4>{t.title}</h4>
              {t.body}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}