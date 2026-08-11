// Matches this app's ACTUAL desktop/mobile layout switch — the sidebar,
// mobile bottom nav, hamburger menu, etc. all switch between
// @media(max-width:768px) (mobile) and @media(min-width:769px) (desktop)
// in legacy.css. This used to be set to 1024px, a stricter, different
// threshold — meaning a window between 769px and 1023px rendered the
// full desktop layout (sidebar visible) but still defaulted every "View
// More" table to collapsed, since by this constant's own math that
// width wasn't "desktop" yet. 769 (not 768) is deliberate — mirroring
// the CSS's own min-width:769px exactly, so there's no 1px window where
// the two disagree about which side of the line a width falls on.
export const DESKTOP_BREAKPOINT = 769

/**
 * Read once, at component mount, to pick a table's initial "View More"
 * state: expanded (true) on desktop, collapsed (false) on mobile/tablet.
 * Prefer useDefaultShowMore() (useDefaultShowMore.js) in new code — this
 * is kept for any caller that only needs the one-time initial value.
 */
export function defaultShowMore() {
  if (typeof window === 'undefined') return false
  return window.innerWidth >= DESKTOP_BREAKPOINT
}