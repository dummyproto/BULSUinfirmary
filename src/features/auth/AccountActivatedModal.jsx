import { createPortal } from 'react-dom'

// Shown right after a patient clicks "Confirm your email address" in
// their registration email (see LoginPage.jsx's justConfirmedEmail
// state). Deliberately NOT built on the shared Modal component
// (@components/ui/Modal) — that component's header bar (title + X close
// button) doesn't match this specific celebratory, chrome-free card
// design. There's still exactly one way through it (the "Go to Login"
// button, or clicking the backdrop) — both call the same onConfirm,
// which LoginPage.jsx wires to its handleBackToSignIn (signs out the
// session the confirmation link auto-created, then reveals the login
// form underneath, requiring real credentials).
export default function AccountActivatedModal({ isOpen, onConfirm, loading }) {
  if (!isOpen) return null

  return createPortal(
    <div
      onMouseDown={(e) => e.target === e.currentTarget && !loading && onConfirm()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'radial-gradient(circle at 50% 25%, rgba(240,253,244,0.98), rgba(236,253,245,0.98))',
        padding: 20,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account Activated"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 380,
          background: '#FFFFFF',
          borderRadius: 20,
          boxShadow: '0 20px 50px rgba(16,24,40,0.14)',
          padding: '44px 32px 36px',
          textAlign: 'center',
        }}
      >
        <Sparkle style={{ top: 14, left: 44 }} size={9} />
        <Sparkle style={{ top: 54, right: 38 }} size={7} />
        <Sparkle style={{ top: 92, left: 32 }} size={6} />
        <Sparkle style={{ top: 26, right: 66 }} size={5} />

        <div
          style={{
            width: 96,
            height: 96,
            margin: '0 auto 24px',
            borderRadius: '50%',
            background: 'var(--success-light)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            style={{
              width: 68,
              height: 68,
              borderRadius: '50%',
              background: 'var(--success)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 8px 20px rgba(46,125,82,0.35)',
            }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          </div>
        </div>

        <h2 style={{ margin: '0 0 10px', fontSize: 22, fontWeight: 800, color: 'var(--success)' }}>Your account is activated!</h2>
        <div style={{ width: 40, height: 3, borderRadius: 2, background: 'var(--success)', margin: '0 auto 18px' }} />

        <p style={{ margin: '0 0 28px', fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)' }}>
          Your account has been successfully activated.
          <br />
          You can now log in and access your account.
        </p>

        <button
          type="button"
          onClick={onConfirm}
          disabled={loading}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            width: '100%',
            padding: '12px 20px',
            borderRadius: 999,
            border: 'none',
            background: 'var(--success)',
            color: 'white',
            fontSize: 14,
            fontWeight: 700,
            cursor: loading ? 'default' : 'pointer',
            opacity: loading ? 0.75 : 1,
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
          </svg>
          {loading ? 'One moment…' : 'Go to Login'}
        </button>
      </div>
    </div>,
    document.body
  )
}

function Sparkle({ style, size = 8 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="var(--success)" style={{ position: 'absolute', opacity: 0.45, ...style }}>
      <path d="M12 0 L14 10 L24 12 L14 14 L12 24 L10 14 L0 12 L10 10 Z" />
    </svg>
  )
}