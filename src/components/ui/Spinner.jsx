export default function Spinner({ label }) {
  return (
    <div className="route-loading">
      <span className="spinner" aria-hidden="true" />
      {label && <span>{label}</span>}
    </div>
  )
}
