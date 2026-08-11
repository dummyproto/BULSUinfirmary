import { useAuth } from '@context/AuthContext'
import Spinner from '@components/ui/Spinner'
import AdminDashboardPage from './AdminDashboardPage'
import StaffDashboardPage from './StaffDashboardPage'
import PatientDashboardPage from './PatientDashboardPage'

export default function DashboardPage() {
  const { role } = useAuth()

  if (role === 'admin') return <AdminDashboardPage />
  if (role === 'staff') return <StaffDashboardPage />
  if (role === 'patient') return <PatientDashboardPage />
  // `role` briefly being null right after sign-in/reload (before
  // AuthContext's profile fetch resolves) used to render nothing here —
  // a blank flash between "logged in" and the actual dashboard showing
  // up. AuthContext now awaits that fetch before letting a caller
  // proceed (see signIn()/the initial session-check effect), so this
  // should be rare, but a spinner is a strictly better fallback than a
  // blank page for the moment it's still possible, matching the same
  // pattern ProtectedRoute already uses for its own loading state.
  return <Spinner label="Loading your dashboard…" />
}