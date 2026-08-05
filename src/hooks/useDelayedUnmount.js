import { useEffect, useState } from 'react'

/**
 * Keeps content mounted for `exitDuration` ms after `active` goes false, so
 * its CSS can play an exit animation instead of the element disappearing
 * mid-transition. Render while `shouldRender` is true; add a "closing"
 * class/state while `closing` is true.
 */
export function useDelayedUnmount(active, exitDuration) {
  const [prevActive, setPrevActive] = useState(active)
  const [state, setState] = useState({ shouldRender: active, closing: false })

  // Derive state during render (not in an effect) when the `active` prop
  // itself changes — the documented React pattern for reacting to a prop
  // change without an extra render's worth of flicker.
  if (active !== prevActive) {
    setPrevActive(active)
    setState(active ? { shouldRender: true, closing: false } : { shouldRender: true, closing: true })
  }

  useEffect(() => {
    if (!state.closing) return undefined
    const timer = setTimeout(() => {
      setState({ shouldRender: false, closing: false })
    }, exitDuration)
    return () => clearTimeout(timer)
  }, [state.closing, exitDuration])

  return state
}
