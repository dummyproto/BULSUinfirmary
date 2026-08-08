import { useEffect, useMemo, useRef, useState } from 'react'
import { LOCATION_GROUPS } from './data/emergencyLocations'
import { MapPinIcon } from '@components/ui/icons'

export default function LocationPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LOCATION_GROUPS
    return LOCATION_GROUPS.map((g) => ({
      ...g,
      options: g.options.filter((o) => o.label.toLowerCase().includes(q)),
    })).filter((g) => g.options.length > 0)
  }, [query])

  // Click-outside detection via a ref on the whole wrapper, instead of
  // onBlur+setTimeout — the previous approach closed the dropdown on
  // *any* blur, including the brief blur/refocus some browsers fire
  // mid-keystroke, which could make the dropdown flicker shut while
  // someone was still actively typing. Listening for clicks outside
  // the wrapper only closes it for the interaction that should actually
  // close it: clicking away. The input and dropdown now stay visible
  // together for the entire time the field has focus, typed or not.
  useEffect(() => {
    if (!open) return undefined
    function handleDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [open])

  function handleFocus() {
    setOpen(true)
    // Blank, not value — filteredGroups shows every location when query
    // is empty, so this is what actually makes "all locations visible"
    // true the moment the field is focused, rather than immediately
    // filtering down to whatever was already selected. inputValue above
    // still shows the current value regardless, via its own fallback.
    setQuery('')
  }

  function handleSelect(label) {
    // Selecting a new location fully replaces whatever was selected or
    // typed before — onChange overwrites the parent's value outright
    // (not merged/appended). Deliberately NOT closing the dropdown here
    // (no setOpen(false)) — clearing query resets the list back to
    // every location unfiltered, and leaving it open means a misclick
    // can be corrected immediately by picking a different one, rather
    // than needing to click back into the field first. It only actually
    // closes when the person clicks elsewhere (see the click-outside
    // handler above) or explicitly moves on.
    onChange(label)
    setQuery('')
  }

  function handleType(e) {
    setQuery(e.target.value)
    onChange(e.target.value)
  }

  // Input shows the active search text while typing, but falls back to
  // showing whatever's actually selected whenever there's no search
  // text — covers both "just opened, nothing typed yet" and "just
  // selected something, dropdown deliberately still open" the same way,
  // so the field never goes visually blank while a real selection
  // exists underneath it.
  const inputValue = query || value

  return (
    <div className="patient-search-wrap" ref={wrapRef}>
      <div className="patient-search-box" onClick={handleFocus} style={{ cursor: 'text' }}>
        <input
          type="text"
          className="patient-search-input"
          placeholder="-- Select Room / Location --"
          value={inputValue}
          onChange={handleType}
          onFocus={handleFocus}
          autoComplete="off"
        />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--text-3)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div className="patient-dropdown location-dropdown-up">
          {filteredGroups.length === 0 && (
            <div style={{ padding: '12px 14px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
              No matching locations — you can still type a custom one above.
            </div>
          )}
          {filteredGroups.map((group) => (
            <div key={group.label}>
              <div className="emg-location-group-header">{group.label}</div>
              {group.options.map((o) => (
                <div
                  key={o.value}
                  className="patient-dropdown-item"
                  style={{ paddingLeft: 22 }}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => handleSelect(o.label)}
                >
                  <div className="patient-item-info">
                    <div className="patient-item-name" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <MapPinIcon width={13} height={13} style={{ flexShrink: 0, color: 'var(--text-3)' }} /> {o.label}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}