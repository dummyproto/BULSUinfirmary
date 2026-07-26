import { useMemo, useState } from 'react'
import { LOCATION_GROUPS } from './data/emergencyLocations'

export default function LocationPicker({ value, onChange }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const filteredGroups = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return LOCATION_GROUPS
    return LOCATION_GROUPS.map((g) => ({
      ...g,
      options: g.options.filter((o) => o.label.toLowerCase().includes(q)),
    })).filter((g) => g.options.length > 0)
  }, [query])

  function handleFocus() {
    setOpen(true)
    setQuery(value || '')
  }
  function handleBlur() {
    setTimeout(() => setOpen(false), 150)
  }
  function handleSelect(label) {
    onChange(label)
    setQuery('')
    setOpen(false)
  }
  function handleType(e) {
    setQuery(e.target.value)
    onChange(e.target.value)
  }

  const inputValue = open ? query : value

  return (
    <div className="patient-search-wrap">
      <div className="patient-search-box" onClick={handleFocus} style={{ cursor: 'text' }}>
        <input
          type="text"
          className="patient-search-input"
          placeholder="-- Select Room / Location --"
          value={inputValue}
          onChange={handleType}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
        />
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0, color: 'var(--text-3)' }}>
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>
      {open && (
        <div className="patient-dropdown">
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
                    <div className="patient-item-name">{o.label}</div>
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