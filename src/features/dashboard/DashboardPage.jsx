import { useAuth } from '@context/AuthContext'
import Spinner from '@components/ui/Spinner'
import AdminDashboardPage from './AdminDashboardPage'
import StaffDashboardPage from './StaffDashboardPage'
import PatientDashboardPage from './PatientDashboardPage'

export default function DashboardPage() {
  const { role, profileError, refreshProfile, signOut } = useAuth()

  if (role === 'admin') return <AdminDashboardPage />
  if (role === 'staff') return <StaffDashboardPage />
  if (role === 'patient') return <PatientDashboardPage />

  // `role` briefly being null right after sign-in/reload (before
  // AuthContext's profile fetch resolves) used to render nothing here —
  // a blank flash between "logged in" and the actual dashboard showing
  // up. AuthContext now awaits that fetch before letting a caller
  // proceed (see signIn()/the initial session-check effect), so that
  // brief flash is rare — but if the fetch itself definitively FAILED
  // (profileError set, in AuthContext.jsx's loadProfile), that's a
  // different, PERMANENT state, not a passing loading flash: showing
  // this same spinner regardless used to leave someone stuck staring at
  // "Loading your dashboard…" forever, indistinguishable from still
  // loading, with nothing telling them anything had actually gone wrong
  // and no way to recover short of knowing to open DevTools. This shows
  // what actually happened instead, with a way to retry the fetch or
  // sign out and back in.
  if (profileError) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', textAlign: 'center', padding: 24, gap: 14 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-1)' }}>We couldn&apos;t load your account</div>
        <div style={{ fontSize: 13, color: 'var(--text-2)', maxWidth: 420, lineHeight: 1.6 }}>{profileError}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
          <button type="button" className="btn btn-sm btn-blue" onClick={() => refreshProfile()}>
            Try Again
          </button>
          <button type="button" className="btn btn-sm btn-outline" onClick={() => signOut()}>
            Sign Out
          </button>
        </div>
      </div>
    )
  }

  return <Spinner label="Loading your dashboard…" />
}