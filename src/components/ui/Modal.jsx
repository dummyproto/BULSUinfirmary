import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { XIcon } from './icons'

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Controlled modal dialog. Replaces the legacy Modal.open/close(id) +
 * classList('open') pattern with React state — same visual classes
 * (modal-overlay / modal / modal-header / modal-close / modal-actions)
 * so it drops straight into the existing legacy.css.
 *
 * `icon` is optional and purely decorative (rendered next to the title in
 * the header) — `title` stays a plain string always, since it also feeds
 * `aria-label` on the dialog, which requires text, not a ReactNode.
 */
export default function Modal({ isOpen, onClose, title, icon, children, actions }) {
  const dialogRef = useRef(null)
  const previouslyFocused = useRef(null)

  // Move focus into the dialog on open, and back to whatever triggered it
  // on close — standard modal focus-management expectation for screen
  // reader and keyboard users.
  useEffect(() => {
    if (!isOpen) return undefined
    previouslyFocused.current = document.activeElement
    const focusable = dialogRef.current?.querySelectorAll(FOCUSABLE_SELECTOR)
    ;(focusable?.[0] || dialogRef.current)?.focus()
    return () => {
      previouslyFocused.current?.focus?.()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return undefined
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose?.()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusable = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR))
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  return createPortal(
    <div
      className="modal-overlay open"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} ref={dialogRef} tabIndex={-1}>
        <div className="modal-header">
          <h3 style={icon ? { display: 'flex', alignItems: 'center', gap: 8 } : undefined}>
            {icon}
            {title}
          </h3>
          <button
            type="button"
            className="modal-close"
            aria-label="Close"
            onClick={() => onClose?.()}
          >
            <XIcon width={14} height={14} />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {actions && <div className="modal-actions">{actions}</div>}
      </div>
    </div>,
    document.body
  )
}
