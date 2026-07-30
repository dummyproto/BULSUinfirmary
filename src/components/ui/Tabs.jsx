/**
 * Controlled tab bar. `tabs` = [{ key, label }], `active` = current key,
 * `onChange(key)` fires on click. Visual host page decides what to render
 * for the active tab — this component is just the switcher.
 */
export default function Tabs({ tabs, active, onChange }) {
  return (
    <div className="tab-row" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          role="tab"
          className={`tab-btn${active === tab.key ? ' active' : ''}`}
          aria-selected={active === tab.key}
          onClick={() => onChange(tab.key)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}
