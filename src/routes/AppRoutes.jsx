import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import AppShell from '@layouts/AppShell'
import AuthLayout from '@layouts/AuthLayout'
import ProtectedRoute from './ProtectedRoute'
import NotFoundPage from './NotFoundPage'
import Spinner from '@components/ui/Spinner'
import LoginPage from '@features/auth/LoginPage'

// Route-level code splitting: every page below is its own chunk, loaded
// only when its route is visited. LoginPage stays a static import since
// it's the very first thing an unauthenticated visitor needs — no point
// deferring it. This is what brought the single ~1.07MB bundle down to a
// small shared chunk + per-page chunks (see the Phase 6 delivery notes for
// before/after numbers).
const DashboardPage = lazy(() => import('@features/dashboard/DashboardPage'))
const DocumentRequestsPage = lazy(() => import('@features/document-requests/DocumentRequestsPage'))
const MyRequestsPage = lazy(() => import('@features/document-requests/MyRequestsPage'))
const PatientsPage = lazy(() => import('@features/patients/PatientsPage'))
const ConsultationPage = lazy(() => import('@features/consultations/ConsultationPage'))
const InventoryPage = lazy(() => import('@features/inventory/InventoryPage'))
const ReportsPage = lazy(() => import('@features/reports/ReportsPage'))
const EmergencyAlertsPage = lazy(() => import('@features/emergency-alerts/EmergencyAlertsPage'))
const MaintenancePage = lazy(() => import('@features/maintenance/MaintenancePage'))
const ChatbotPage = lazy(() => import('@features/chatbot/ChatbotPage'))
const ProfilePage = lazy(() => import('@features/profile/ProfilePage'))
const ResetPasswordPage = lazy(() => import('@features/auth/ResetPasswordPage'))

const STAFF_ADMIN = ['admin', 'staff']

function LazyPage({ children }) {
  return <Suspense fallback={<Spinner label="Loading…" />}>{children}</Suspense>
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AuthLayout>
            <LoginPage />
          </AuthLayout>
        }
      />

      <Route
        path="/reset-password"
        element={
          <AuthLayout>
            <LazyPage>
              <ResetPasswordPage />
            </LazyPage>
          </AuthLayout>
        }
      />

      {/* Any authenticated role */}
      <Route element={<ProtectedRoute />}>
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<LazyPage><DashboardPage /></LazyPage>} />
          <Route path="/profile" element={<LazyPage><ProfilePage /></LazyPage>} />

          {/* Admin + Staff only */}
<Route element={<ProtectedRoute roles={STAFF_ADMIN} />}>
  <Route path="/patients" element={<LazyPage><PatientsPage /></LazyPage>} />
  <Route path="/document-requests" element={<LazyPage><DocumentRequestsPage /></LazyPage>} />
  <Route path="/inventory" element={<LazyPage><InventoryPage /></LazyPage>} />
  <Route path="/reports" element={<LazyPage><ReportsPage /></LazyPage>} />
  <Route path="/emergency-alerts" element={<LazyPage><EmergencyAlertsPage /></LazyPage>} />
</Route>

          {/* Staff only */}
          <Route element={<ProtectedRoute roles={['staff']} />}>
            <Route path="/consultation" element={<LazyPage><ConsultationPage /></LazyPage>} />
          </Route>

          {/* Admin only */}
          <Route element={<ProtectedRoute roles={['admin']} />}>
            <Route path="/maintenance" element={<LazyPage><MaintenancePage /></LazyPage>} />
          </Route>

          {/* Patient only */}
          <Route element={<ProtectedRoute roles={['patient']} />}>
            <Route path="/my-requests" element={<LazyPage><MyRequestsPage /></LazyPage>} />
            <Route path="/chatbot" element={<LazyPage><ChatbotPage /></LazyPage>} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
