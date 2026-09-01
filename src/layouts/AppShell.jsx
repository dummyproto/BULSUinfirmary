import { useEffect, useRef, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import MobileBottomNav from './MobileBottomNav'
import EmergencyAlertListener from './EmergencyAlertListener'
import SessionTimeoutManager from './SessionTimeoutManager'
import AccountStatusGuard from './AccountStatusGuard'
import ToastViewport from '@components/ui/ToastViewport'
import OfflineBanner from '@components/ui/OfflineBanner'
import PendingSyncIndicator from '@components/ui/PendingSyncIndicator'
import ScrollToTopButton from '@components/ui/ScrollToTopButton'
import UserManualModal from '@components/ui/UserManualModal'
import { useSidebar } from '@hooks/useSidebar'
import { useAuth } from '@context/AuthContext'
import { NAV_ITEMS } from '@routes/navItems'
import { prefetchRoutesForRole } from '@routes/prefetchRoutes'

function useCurrentPageTitle() {
  const { role } = useAuth()
  const { pathname } = useLocation()
  const items = NAV_ITEMS[role] || []
  const match = items.find((item) => item.path === pathname)
  // /profile isn't a NAV_ITEMS entry (it's reached via the Topbar profile
  // dropdown, not the sidebar/bottom-nav), so it always fell through to
  // the generic "Dashboard" fallback meant for genuinely unmatched
  // paths — misleading here specifically, since it looks like the actual
  // Dashboard page rather than the profile page it actually is.
  if (pathname === '/profile') return 'Personal Dashboard'
  return match?.label || 'Dashboard'
}

export default function AppShell() {
  const { open, mobileOpen, toggle, closeDrawer } = useSidebar()
  const { role } = useAuth()
  const title = useCurrentPageTitle()
  const pageContentRef = useRef(null)
  const [manualOpen, setManualOpen] = useState(false)

  useEffect(() => {
    if (role) prefetchRoutesForRole(role)
  }, [role])

  return (
    <>
      <div className="app-container">
        <Sidebar
          collapsed={!open}
          mobileOpen={mobileOpen}
          onToggle={toggle}
          onNavigate={closeDrawer}
          onOpenManual={() => setManualOpen(true)}
        />
        <div className="main-area">
          <Topbar title={title} onToggleSidebar={toggle} />
          <div className="page-content" ref={pageContentRef}>
            <Outlet />
          </div>
        </div>
      </div>
      <div
        className={`sidebar-overlay${mobileOpen ? ' active' : ''}`}
        onClick={closeDrawer}
      />
      <ToastViewport />
      <OfflineBanner />
      <PendingSyncIndicator />
      <EmergencyAlertListener />
      <SessionTimeoutManager />
      <AccountStatusGuard />
      <MobileBottomNav onOpenManual={() => setManualOpen(true)} />
      <ScrollToTopButton targetRef={pageContentRef} />
      <UserManualModal isOpen={manualOpen} onClose={() => setManualOpen(false)} />
    </>
  )
}