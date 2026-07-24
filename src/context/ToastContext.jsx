import { createContext, useContext, useCallback, useRef, useState } from 'react'

const ToastContext = createContext(undefined)

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const idRef = useRef(0)

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id))
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

  return (
    <ToastContext.Provider value={{ toasts, show, dismiss }}>
      {children}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const ctx = useContext(ToastContext)
  if (ctx === undefined) throw new Error('useToast must be used within a ToastProvider')
  return ctx
}
