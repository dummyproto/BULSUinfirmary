import { createContext, useContext, useCallback, useRef, useState } from 'react'
import Modal from '@components/ui/Modal'
import { AlertTriangleIcon } from '@components/ui/icons'

const ConfirmContext = createContext(undefined)

/**
 * Styled, promise-based replacement for window.confirm(). The browser's
 * native confirm() is functional but looks completely out of place next
 * to the rest of this app's dark, custom-styled UI (see the delete-user
 * flow, which was the original report) — this reuses the existing Modal
 * component so every confirmation dialog matches the app's actual design
 * instead of the OS/browser's own dialog chrome.
 *
 * Usage mirrors window.confirm's call sites almost exactly:
 *   if (!window.confirm('Delete this?')) return
 * becomes:
 *   if (!(await confirm('Delete this?'))) return
 * (the enclosing function just needs to already be async, which every
 * call site in this codebase already was, since a real await always
 * followed the old confirm() check anyway.)
 */
export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null) // { message, title, confirmLabel, danger }
  const resolveRef = useRef(null)

  const confirm = useCallback((message, options = {}) => {
    return new Promise((resolve) => {
      resolveRef.current = resolve
      setState({
        message,
        title: options.title ?? 'Please Confirm',
        confirmLabel: options.confirmLabel ?? 'OK',
        // Matches the old window.confirm() default: every existing call
        // site is a destructive/irreversible action, so red is the safe
        // default rather than something callers all had to opt into.
        danger: options.danger ?? true,
      })
    })
  }, [])

  function settle(result) {
    resolveRef.current?.(result)
    resolveRef.current = null
    setState(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal isOpen={!!state} onClose={() => settle(false)} title={state?.title || 'Please Confirm'} icon={<AlertTriangleIcon width={16} height={16} />}
        actions={
          <>
            <button type="button" className="btn btn-outline" onClick={() => settle(false)}>
              Cancel
            </button>
            <button type="button" className={`btn ${state?.danger ? 'btn-red' : 'btn-blue'}`} onClick={() => settle(true)}>
              {state?.confirmLabel}
            </button>
          </>
        }
      >
        <p style={{ fontSize: 13.5, lineHeight: 1.6, color: 'var(--text-2)', whiteSpace: 'pre-line', margin: 0 }}>{state?.message}</p>
      </Modal>
    </ConfirmContext.Provider>
  )
}

// Returns the `confirm(message, options?) => Promise<boolean>` function
// directly (not wrapped in an object) — every call site just needs the
// one function, so this skips the extra `.confirm` property access every
// caller would otherwise repeat.
export function useConfirm() {
  const ctx = useContext(ConfirmContext)
  if (ctx === undefined) throw new Error('useConfirm must be used within a ConfirmProvider')
  return ctx
}