import { useAuth } from '@context/AuthContext'
import AdminDashboardPage from './AdminDashboardPage'
import StaffDashboardPage from './StaffDashboardPage'
import PatientDashboardPage from './PatientDashboardPage'

export default function DashboardPage() {
  const { role } = useAuth()

  if (role === 'admin') return <AdminDashboardPage />
  if (role === 'staff') return <StaffDashboardPage />
  if (role === 'patient') return <PatientDashboardPage />
  return null
}
