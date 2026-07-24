import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import Spinner from '@components/ui/Spinner'

/**
 * Two jobs, mirroring the legacy Router.go():
 *  1. No `roles` prop -> just requires *some* authenticated session.
 *  2. `roles` prop -> also requires the signed-in user's role to be in it;
 *     otherwise shows a toast ("Access denied") and redirects to /dashboard
 *     instead of rendering the page.
 */
export default function ProtectedRoute({ roles }) {
  const { isAuthenticated, role, loading } = useAuth()
  const { show } = useToast()
  const location = useLocation()

  const forbidden = isAuthenticated && !!roles && !roles.includes(role)

  useEffect(() => {
    if (forbidden) show('Access denied', 'error')
  }, [forbidden, show])

  if (loading) return <Spinner label="Loading session…" />
  if (!isAuthenticated) return <Navigate to="/login" state={{ from: location }} replace />
  if (forbidden) return <Navigate to="/dashboard" replace />

  return <Outlet />
}
