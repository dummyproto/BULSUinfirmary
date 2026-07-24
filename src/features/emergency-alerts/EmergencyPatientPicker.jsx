import { useEffect, useRef, useState } from 'react'
import { searchPatientsPublic } from '@services/usersService'
import { UserIcon } from '@components/ui/icons'

export default function EmergencyPatientPicker({ selected, onSelect, onClear, placeholder, excludeUserId }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [open, setOpen] = useState(false)
  const [searching, setSearching] = useState(false)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (query.trim().length < 2) return undefined
    debounceRef.current = setTimeout(() => {
      setSearching(true)
      searchPatientsPublic(query)
        .then((data) => setResults(data.filter((p) => p.user_id !== excludeUserId)))
        .catch(() => setResults([]))
        .finally(() => setSearching(false))
    }, 300)
    return () => clearTimeout(debounceRef.current)
  }, [query, excludeUserId])

  if (selected) {
    return (
      <div className="emg-reporter-chip" style={{ display: 'flex', marginTop: 8, padding: '8px 12px', borderRadius: 8, background: 'rgba(220,38,38,.12)', border: '1px solid rgba(220,38,38,.6)', alignItems: 'center', gap: 10 }}>
        <UserIcon width={18} height={18} />
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{selected.name}</div>
          <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{selected.student_number}</div>
        </div>
        <span onClick={onClear} style={{ cursor: 'pointer', fontSize: 18, lineHeight: 1, opacity: 0.6 }} title="Clear">
          ×
        </span>
      </div>
    )
  }

  return (
    <div style={{ position: 'relative' }}>
      <input
        className="emg-input"
        placeholder={placeholder}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
      />
      {open && query.trim().length >= 2 && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, maxHeight: 180, overflowY: 'auto', zIndex: 50, boxShadow: '0 6px 20px rgba(0,0,0,.15)' }}>
          {searching && <div style={{ padding: 12, fontSize: 12, color: 'var(--text-3)' }}>Searching…</div>}
          {!searching && results.length === 0 && <div style={{ padding: 12, fontSize: 12, color: 'var(--text-3)' }}>No students found</div>}
          {results.map((p) => (
            <div
              key={p.user_id}
              className="patient-dropdown-item"
              onMouseDown={() => {
                onSelect(p)
                setQuery('')
                setOpen(false)
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }}
            >
              <div style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(220,38,38,.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0, color: '#FCA5A5' }}>
                {p.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.student_number}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
