import { useId } from 'react'
import { XIcon } from './icons'

export default function SearchInput({ value, onChange, placeholder, width = 210, id, name }) {
  // useId() generates a stable, unique id per rendered instance — this
  // component is reused across most tables/pages in the app (Items, Log,
  // Patients, Reports, Batches, Suppliers, etc.), so a single hardcoded
  // id would collide the moment two instances render on the same page.
  // Callers can still pass their own id/name explicitly when they need
  // to (e.g. to target this field from a label's htmlFor elsewhere);
  // this is only the fallback for the common case where they don't.
  const autoId = useId()
  const fieldId = id || `search-input-${autoId}`

  return (
    <div className="search-input-wrap" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
        id={fieldId}
        name={name || fieldId}
        className="search-input"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width }}
      />
      {value && (
        <button
          type="button"
          className="btn btn-sm btn-outline"
          title="Clear filter"
          onClick={() => onChange('')}
        >
          <XIcon width={11} height={11} /> Clear
        </button>
      )}
    </div>
  )
}