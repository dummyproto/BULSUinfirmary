import { useEffect, useState } from 'react'
import { ChevronUpIcon } from './icons'
import { useDelayedUnmount } from '@hooks/useDelayedUnmount'

const EXIT_DURATION = 150
// Hysteresis gap: once visible, stay visible until scrolled back up past
// (threshold - HYSTERESIS), not just threshold — otherwise scroll jitter
// right at the threshold line repeatedly mounts/unmounts (and restarts)
// the entrance keyframe.
const HYSTERESIS = 40

/**
 * Floating "back to top" button — appears once the given scrollable
 * element has been scrolled past `threshold` px, and smooth-scrolls it
 * back to the top on click. Rendered once in AppShell.jsx (targeting
 * `.page-content`, the single scrollable wrapper every page's content
 * sits inside — see AppShell.jsx), so it works the same way on every
 * page automatically rather than needing to be added per-page. Most
 * noticeable on pages with long lists/tables (Inventory's Items,
 * Batches, and Log tabs in particular), where scrolling all the way
 * back up by hand after reviewing a long list is the exact friction
 * this is meant to remove.
 */
export default function ScrollToTopButton({ targetRef, threshold = 300 }) {
  const [visible, setVisible] = useState(false)
  const { shouldRender, closing } = useDelayedUnmount(visible, EXIT_DURATION)

  useEffect(() => {
    const el = targetRef.current
    if (!el) return undefined

    const onScroll = () => {
      const top = el.scrollTop
      setVisible((wasVisible) => (wasVisible ? top > threshold - HYSTERESIS : top > threshold))
    }
    onScroll() // in case the page loads already scrolled (e.g. restored position)
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [targetRef, threshold])

  function handleClick() {
    targetRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!shouldRender) return null

  return (
    <button
      type="button"
      className={`scroll-to-top-btn${closing ? ' closing' : ''}`}
      onClick={handleClick}
      title="Back to top"
      aria-label="Scroll to top"
    >
      <ChevronUpIcon width={16} height={16} />
    </button>
  )
}