import { useMemo, useRef, useState } from 'react'
import { useDelayedUnmount } from '@hooks/useDelayedUnmount'

const EXIT_DURATION = 120

// Highlights the matched substring the same way legacy _highlightMatch() did.
function highlightMatch(text, q) {
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx === -1) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark style={{ background: 'var(--primary-light,#dbeafe)', color: 'var(--primary)', borderRadius: 2, padding: '0 1px' }}>
        {text.slice(idx, idx + q.length)}
      </mark>
      {text.slice(idx + q.length)}
    </>
  )
}

/**
 * Controlled searchable combobox. Replaces the legacy patient-search,
 * diagnosis-search, and medicine-search dropdowns, which were three copies
 * of the same open/filter/select/clear/click-outside pattern built around
 * raw DOM ids. One component, driven by props:
 *
 *   options: [{ value, label, sub?, icon? }]
 *   value: currently selected option's `value` (or '')
 *   onSelect(value): fired when an option is chosen
 *   onClear(): fired when the clear (×) button is clicked
 *   displayValue: text shown in the input when a value is selected
 */
export default function SearchableSelect({
  options,
  value,
  onSelect,
  onClear,
  displayValue,
  placeholder,
  iconLabel, // e.g. 'DX' / 'RX' badge shown per row instead of an avatar
  iconClassName = 'diagnosis-item-icon',
  emptyLabel = 'No results found',
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef(null)
  const { shouldRender: showDropdown, closing: dropdownClosing } = useDelayedUnmount(open, EXIT_DURATION)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.sub || '').toLowerCase().includes(q)
    )
  }, [options, query])

  const inputValue = open ? query : query || displayValue || ''

  function handleFocus() {
    setOpen(true)
    setQuery('')
  }

  function handleBlur() {
    // Delay so a click on a dropdown item registers before we close it.
    setTimeout(() => setOpen(false), 150)
  }

  function handleSelect(opt) {
    onSelect(opt.value)
    setQuery('')
    setOpen(false)
  }

  function handleClear(e) {
    e.stopPropagation()
    setQuery('')
    onClear()
  }

  return (
    <div className="patient-search-wrap" ref={wrapRef}>
      <div className="patient-search-box" onClick={handleFocus}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ flexShrink: 0, color: 'var(--text-3)' }}>
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.35-4.35" />
        </svg>
        <input
          type="text"
          className="patient-search-input"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          autoComplete="off"
        />
        {(value || query) && (
          <span className="patient-search-clear" onClick={handleClear}>
            ×
          </span>
        )}
      </div>
      {showDropdown && (
        <div className={`patient-dropdown${dropdownClosing ? ' closing' : ''}`} style={{ display: 'block' }}>
          <div>
            {filtered.length === 0 && (
              <div style={{ padding: '12px 14px', color: 'var(--text-3)', fontSize: 13, textAlign: 'center' }}>
                {emptyLabel}
              </div>
            )}
            {filtered.map((opt) => (
              <div
                key={opt.value}
                className="patient-dropdown-item"
                onMouseDown={(e) => e.preventDefault()} // keep input focus until click registers
                onClick={() => handleSelect(opt)}
              >
                {iconLabel ? (
                  <div className={iconClassName}>{iconLabel}</div>
                ) : (
                  <div className="patient-item-avatar">{opt.icon || opt.label.slice(0, 2).toUpperCase()}</div>
                )}
                <div className="patient-item-info">
                  <div className="patient-item-name">{highlightMatch(opt.label, query)}</div>
                  <div className="patient-item-sub">{highlightMatch(opt.sub || '', query)}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
