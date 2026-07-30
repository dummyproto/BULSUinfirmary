import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <div className="page-placeholder">
      <p>Page not found.</p>
      <Link to="/dashboard">Back to dashboard</Link>
    </div>
  )
}
