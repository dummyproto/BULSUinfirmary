import { useCallback, useState } from 'react'

function usesDrawer() {
  return window.matchMedia('(max-width: 768px), (orientation: portrait)').matches
}

/**
 * Mirrors the legacy toggleSidebar()/_sidebarOpen behavior:
 * - Desktop/landscape: collapses/expands a rail.
 * - Mobile/portrait: slides in a drawer with a backdrop overlay instead.
 *
 * NOTE: previously persisted the collapsed state to localStorage
 * ('cp_sidebar'). Per Phase 4's explicit instruction to remove every
 * localStorage usage, this is now in-memory only for the session — the
 * sidebar resets to expanded on every page reload.
 */
export function useSidebar() {
  const [open, setOpen] = useState(true)
  const [mobileOpen, setMobileOpen] = useState(false)

  const toggle = useCallback(() => {
    if (usesDrawer()) {
      setMobileOpen((v) => !v)
    } else {
      setOpen((v) => !v)
    }
  }, [])

  const closeDrawer = useCallback(() => setMobileOpen(false), [])

  return { open, mobileOpen, toggle, closeDrawer }
}
