import { createContext, useContext, useCallback, useMemo, useRef, useState } from 'react'

const ToastContext = createContext(undefined)

// Matches .toast.leaving's animation duration in legacy.css — the toast is
// marked "leaving" (to play its exit animation) before it's actually
// removed from state, instead of vanishing mid-transition.
export const EXIT_DURATION = 200

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, leaving: true } : t)))
    setTimeout(() => {
      setToasts((list) => list.filter((t) => t.id !== id))
    }, EXIT_DURATION)
  }, [])

  // Mirrors the legacy Toast.show(msg, type, dur) signature so callers
  // migrating from core.js need minimal changes.
  const show = useCallback(
    (message, type = 'info', duration = 3200) => {
      const id = ++idRef.current
      setToasts((list) => [...list, { id, message, type }])
      if (duration > 0) {
        setTimeout(() => dismiss(id), duration)
      }
      return id
    },
    [dismiss]
  )

    const value = useMemo(() => ({ toasts, show, dismiss }), [toasts, show, dismiss])

  return <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useToast() {
  const ctx = useContext(ToastContext)
  if (ctx === undefined) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
