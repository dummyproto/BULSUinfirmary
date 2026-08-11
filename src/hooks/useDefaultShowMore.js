import { useEffect, useRef, useState } from 'react'
import { DESKTOP_BREAKPOINT, defaultShowMore } from '@lib/viewport'

/**
 * Same intent as defaultShowMore() (viewport.js) — expanded ("View
 * More" already applied) on desktop, collapsed ("View Less") on
 * mobile/tablet — but reactive to the ACTUAL current viewport instead
 * of only the value at first mount.
 *
 * The plain defaultShowMore() was deliberately snapshot-once, reasoning
 * that a table shouldn't suddenly collapse/expand out from under someone
 * mid-session just because the window resized. In practice that meant a
 * page loaded once at a narrow width (e.g. opened inside a resized
 * devtools panel, or a browser window later maximized) stayed stuck on
 * the wrong default even once the viewport was genuinely desktop-sized,
 * since nothing ever re-checked. This keeps that same "don't yank a
 * table shut on someone who's using it" protection, but only once
 * THEY'VE made an explicit choice by clicking View More/Less
 * themselves — before that, it keeps following the real breakpoint, so
 * a page that's actually being viewed at desktop width always ends up
 * expanded (and mobile width always ends up collapsed), regardless of
 * what width the page happened to first render at.
 *
 * Usage is a drop-in swap for `useState(defaultShowMore)`:
 *   const [showMore, setShowMore] = useDefaultShowMore()
 */
export function useDefaultShowMore() {
  const [showMore, setShowMoreState] = useState(defaultShowMore)
  const manualRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mql = window.matchMedia(`(min-width: ${DESKTOP_BREAKPOINT}px)`)
    function handleChange(e) {
      if (manualRef.current) return // person already chose explicitly this session — their choice wins
      setShowMoreState(e.matches)
    }
    mql.addEventListener('change', handleChange)
    return () => mql.removeEventListener('change', handleChange)
  }, [])

  function setShowMore(next) {
    manualRef.current = true
    setShowMoreState(next)
  }

  return [showMore, setShowMore]
}