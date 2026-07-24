import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'
import Topbar from './Topbar'
import EmergencyAlertListener from './EmergencyAlertListener'
import ToastViewport from '@components/ui/ToastViewport'
import { useSidebar } from '@hooks/useSidebar'
import { useAuth } from '@context/AuthContext'
import { NAV_ITEMS } from '@routes/navItems'

function useCurrentPageTitle() {
  const { role } = useAuth()
  const { pathname } = useLocation()
  const items = NAV_ITEMS[role] || []
  const match = items.find((item) => item.path === pathname)
  return match?.label || 'Dashboard'
}

export default function AppShell() {
  const { open, mobileOpen, toggle, closeDrawer } = useSidebar()
  const title = useCurrentPageTitle()

  return (
    <>
      <div className="app-container">
        <Sidebar
          collapsed={!open}
          mobileOpen={mobileOpen}
          onToggle={toggle}
          onNavigate={closeDrawer}
        />
        <div className="main-area">
          <Topbar title={title} onToggleSidebar={toggle} />
          <div className="page-content">
            <Outlet />
          </div>
        </div>
      </div>
      <div
        className={`sidebar-overlay${mobileOpen ? ' active' : ''}`}
        onClick={closeDrawer}
      />
      <ToastViewport />
      <EmergencyAlertListener />
    </>
  )
}
