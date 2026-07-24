import { XIcon } from './icons'

export default function SearchInput({ value, onChange, placeholder, width = 210 }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <input
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
