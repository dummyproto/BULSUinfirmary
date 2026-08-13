import { useCallback, useState } from 'react'

/**
 * Mirrors the legacy toggleSidebar()/_sidebarOpen behavior:
 * - Desktop/landscape: collapses/expands a rail.
 * - Mobile/portrait: slides in a drawer with a backdrop overlay instead.
 *
 * A narrow width or portrait orientation both already meant "drawer" —
 * but neither one alone caught a touch tablet held in LANDSCAPE (e.g. an
 * iPad at 1024px wide): it's not narrow enough for the max-width check
 * and it's not portrait, so it fell through to the desktop hover-rail
 * meant for a mouse-driven monitor. (hover:none) and (pointer:coarse) is
 * how a touch screen identifies itself regardless of width/orientation —
 * a real mouse/trackpad reports hover:hover + pointer:fine instead — so
 * adding it here catches that case without affecting actual desktops.
 *
 * NOTE: previously persisted the collapsed state to localStorage
 * ('cp_sidebar'). Per Phase 4's explicit instruction to remove every
 * localStorage usage, this is now in-memory only for the session — the
 * sidebar resets to expanded on every page reload.
 */
function usesDrawer() {
  return window.matchMedia(
    '(max-width: 768px), (orientation: portrait), (hover: none) and (pointer: coarse)'
  ).matches
}

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