import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useDelayedUnmount } from '@hooks/useDelayedUnmount'
import { ChevronDownIcon } from './icons'

/**
 * Mobile-only status filter dropdown. Originally built for My Requests
 * (patient) and now also used by Document Requests (staff/admin) — both
 * pages pair this with the existing chip-row <Tabs> component: <Tabs>
 * stays visible on desktop/tablet, this replaces it on phone widths
 * where the chips wrap to two rows.
 *
 * The open menu is rendered through a portal into document.body (same
 * technique Modal.jsx already uses) rather than positioned in place.
 * Every page renders inside .main-area, which has both overflow:hidden
 * and its own position:relative + z-index — that combination seals off
 * a stacking context, so no z-index value on a normal in-place
 * descendant can ever paint above a sibling further down the page (e.g.
 * the "Request History" card), regardless of how high it's set. A
 * portal sidesteps the problem entirely by escaping that ancestor chain;
 * position is computed from the trigger button's actual screen
 * coordinates instead of relying on CSS position:absolute.
 *
 *   options: [{ key, label }]  — same shape as <Tabs>'s `tabs` prop
 *   value: currently active option's `key`
 *   onChange(key): fired when an option is chosen
 */
export default function StatusFilterDropdown({ options, value, onChange }) {
  const [open, setOpen] = useState(false)
  const [menuRect, setMenuRect] = useState(null)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const { shouldRender: showMenu, closing: menuClosing } = useDelayedUnmount(open, 120)
  const active = options.find((o) => o.key === value)

  // Recompute the trigger's on-screen position every time the menu opens
  // (and on scroll/resize while it's open) — the portaled menu has no
  // other way to know where the trigger actually is, since it's no
  // longer a DOM descendant of it.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return undefined
    function updateRect() {
      const r = triggerRef.current.getBoundingClientRect()
      setMenuRect({ top: r.bottom + 6, left: r.left, width: r.width })
    }
    updateRect()
    window.addEventListener('scroll', updateRect, true)
    window.addEventListener('resize', updateRect)
    return () => {
      window.removeEventListener('scroll', updateRect, true)
      window.removeEventListener('resize', updateRect)
    }
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    function handleOutside(e) {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target) &&
        menuRef.current && !menuRef.current.contains(e.target)
      ) {
        setOpen(false)
      }
    }
    function handleEscape(e) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('keydown', handleEscape)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('keydown', handleEscape)
    }
  }, [open])

  function handleSelect(key) {
    onChange(key)
    setOpen(false)
  }

  return (
    <div className="status-filter-dropdown">
      <button
        type="button"
        ref={triggerRef}
        className={`status-filter-trigger${open ? ' open' : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span>{active?.label}</span>
        <ChevronDownIcon width={14} height={14} className="status-filter-chevron" />
      </button>
      {showMenu && menuRect &&
        createPortal(
          <div
            ref={menuRef}
            className={`status-filter-menu status-filter-menu-portal${menuClosing ? ' closing' : ''}`}
            role="listbox"
            style={{ top: menuRect.top, left: menuRect.left, width: menuRect.width }}
          >
            {options.map((opt) => (
              <div
                key={opt.key}
                role="option"
                aria-selected={opt.key === value}
                className={`status-filter-option${opt.key === value ? ' selected' : ''}`}
                onClick={() => handleSelect(opt.key)}
              >
                {opt.label}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  )
}