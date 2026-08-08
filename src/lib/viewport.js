// 1024px matches this app's own established desktop breakpoint
// (see e.g. the sidebar's hover-to-expand behavior in legacy.css,
// @media(min-width:1025px)) — consistent with what the rest of the app
// already treats as "desktop" rather than introducing a new cutoff.
const DESKTOP_BREAKPOINT = 1024

/**
 * Read once, at component mount, to pick a table's initial "View More"
 * state: expanded (true) on desktop, collapsed (false) on mobile/tablet.
 * Deliberately NOT reactive to window resizing after mount — a table
 * that was opened wide and expanded shouldn't suddenly collapse (or
 * vice versa) just because the window was resized or a phone was
 * rotated; the person's own click still overrides this from that point
 * on either way, this only decides the starting state.
 */
export function defaultShowMore() {
  if (typeof window === 'undefined') return false
  return window.innerWidth >= DESKTOP_BREAKPOINT
}