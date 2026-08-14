import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { useConfirm } from '@context/ConfirmContext'
import { useTheme } from '@context/ThemeContext'
import { TOPBAR_GRADIENT, ROLE_LABELS as PORTAL_LABELS } from '@routes/navItems'
import { MenuIcon, BellIcon, ChevronDownIcon, SettingsIcon, LogoutIcon, SunIcon, MoonIcon, QrCodeIcon } from '@components/ui/icons'
import { ROLE_LABELS } from '@features/profile/lib/profileHelpers'
import NotificationsModal from '@features/notifications/NotificationsModal'
import MyQrCodeModal from '@features/profile/MyQrCodeModal'
import logo from '@/assets/logo.png'
import { countUnread, listForUser, markRead, markAllRead, deleteNotification } from '@services/notificationsService'
import {
  listInventoryNotifications,
  countUnreadInventoryNotifications,
  markInventoryNotificationRead,
  markAllInventoryNotificationsRead,
  deleteInventoryNotification,
} from '@services/inventoryNotificationsService'
import EmergencyConfirmModal from '@features/emergency-alerts/EmergencyConfirmModal'
import EmergencySuccessOverlay from '@features/emergency-alerts/EmergencySuccessOverlay'
import { stopEmergencySiren } from '@lib/emergencySound'

// Lazy — this is global chrome loaded on every route, but the full report
// form (with its patient search) is only ever needed if a patient actually
// confirms they want to file one.
const EmergencyReportModal = lazy(() => import('@features/emergency-alerts/EmergencyReportModal'))

// The bell was mechanically wired correctly (RLS, queries, notify() call
// sites were all verified sound) but staff/admin would still very
// plausibly see it as permanently empty: the general `notifications`
// table only ever receives a narrow, deliberate cross-post of HIGH/
// CRITICAL inventory alerts (see inventoryNotificationsService.js) — the
// everyday stuff (received/released/adjusted/archived stock, or a
// low/medium-priority stock alert) never lands there at all, on purpose,
// to avoid duplicating the same data in two tables. In practice that
// meant a staff/admin user doing completely normal inventory work all
// day would open the bell and see nothing, ever, unless something
// happened to hit critical/expired specifically. Merged in here — at the
// component layer, not inside either service — rather than having
// notificationsService.js import from inventoryNotificationsService.js,
// which already imports the other way (notifyIfNew, for its own
// cross-post) and would create a real circular dependency between the
// two files.
const PRIORITY_TO_TYPE = { low: 'info', medium: 'info', high: 'warning', critical: 'danger' }
const INV_ID_PREFIX = 'inv:'

function normalizeInventoryNotification(n) {
  return {
    notification_id: `${INV_ID_PREFIX}${n.id}`,
    message: n.title,
    type: PRIORITY_TO_TYPE[n.priority] || 'info',
    is_read: n.is_read,
    created_at: n.created_at,
    module: '/inventory',
  }
}

function mergeNotifications(general, inventory) {
  return [...general, ...inventory.map(normalizeInventoryNotification)].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
}

export default function Topbar({ title, subtitle, onToggleSidebar }) {
  const { profile, role, signOut } = useAuth()
  const { show } = useToast()
  const { theme, toggleTheme } = useTheme()
  const confirm = useConfirm()
  const navigate = useNavigate()
  // Built directly from Surname + First Name (patient_profiles) rather
  // than trusting profile.name (users.name) on its own — those two are
  // supposed to stay in sync (EditProfileModal recomputes name via
  // buildFullName on every patient save), but a since-fixed bug in
  // toFormShape (ProfilePage.jsx) meant givenName always looked blank
  // on the edit form, which made buildFullName silently fall back to
  // the OLD name instead of the newly-saved one — so anyone who edited
  // their name before that fix is stuck with a stale profile.name no
  // matter what Personal Info now correctly shows. Deriving the topbar
  // display straight from the same two fields Personal Info itself
  // shows means it can never drift out of sync with that page again,
  // regardless of whether name-sync elsewhere holds up perfectly.
  const displayName = profile?.givenName && profile?.surname
    ? `${profile.givenName} ${profile.surname}`.trim()
    : profile?.name
  const location = useLocation()

  const [unread, setUnread] = useState(0)
  const [notifOpen, setNotifOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [emgConfirmOpen, setEmgConfirmOpen] = useState(false)
  const [emgFormOpen, setEmgFormOpen] = useState(false)
  const [emgSuccess, setEmgSuccess] = useState(null)
  const [profileMenuOpen, setProfileMenuOpen] = useState(false)
  const [qrModalOpen, setQrModalOpen] = useState(false)
  const profileMenuRef = useRef(null)

  const userId = profile?.user_id ?? null
  const includesInventory = role === 'staff' || role === 'admin'

  async function combinedUnreadCount() {
    if (includesInventory) {
      const [generalCount, invCount] = await Promise.all([countUnread(userId, role), countUnreadInventoryNotifications()])
      return generalCount + invCount
    }
    return countUnread(userId, role)
  }

  async function combinedList() {
    if (includesInventory) {
      const [general, inv] = await Promise.all([listForUser(userId, role), listInventoryNotifications({ unreadOnly: false })])
      return mergeNotifications(general, inv)
    }
    return listForUser(userId, role)
  }

  async function refreshUnreadCount() {
    if (!userId || !role) return
    try {
      setUnread(await combinedUnreadCount())
    } catch {
      // Non-critical — the bell just won't show a badge if this fails.
    }
  }

  // Badge count freshness: the count was previously fetched once on mount
  // and never again, so it went stale the moment any new notification
  // arrived later in the session. Refreshing on every route change covers
  // the common case (navigating is a natural moment to re-check); the
  // 60s interval is a safety net for someone sitting on one page a while.
  useEffect(() => {
    if (!userId || !role) return undefined
    let cancelled = false
    combinedUnreadCount()
      .then((n) => {
        if (!cancelled) setUnread(n)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role, location.pathname])

  useEffect(() => {
    if (!userId || !role) return undefined
    const interval = setInterval(() => {
      combinedUnreadCount()
        .then(setUnread)
        .catch(() => {})
    }, 60000)
    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role])

  async function openNotifications() {
    if (!userId || !role) return
    try {
      setNotifications(await combinedList())
      setNotifOpen(true)
    } catch (err) {
      show(`Failed to load notifications: ${err.message}`, 'error')
    }
  }

  async function silentRefresh() {
    if (!userId || !role) return
    try {
      const [list] = await Promise.all([combinedList(), refreshUnreadCount()])
      setNotifications(list)
    } catch {
      // Non-critical.
    }
  }

  // Routes a mark-read/mark-all-read action to whichever underlying table
  // a given notification actually came from — general notifications keep
  // their real integer notification_id; merged-in inventory ones were
  // given a string-prefixed id (see normalizeInventoryNotification above)
  // specifically so this routing is unambiguous, since both tables are
  // independent SERIAL sequences and would otherwise collide (e.g. row 5
  // in each table both being "5").
  async function handleMarkRead(id) {
    if (typeof id === 'string' && id.startsWith(INV_ID_PREFIX)) {
      await markInventoryNotificationRead(Number(id.slice(INV_ID_PREFIX.length)))
    } else {
      await markRead(id)
    }
  }

  async function handleDelete(ids) {
    const idList = Array.isArray(ids) ? ids : [ids]
    await Promise.all(
      idList.map((id) =>
        typeof id === 'string' && id.startsWith(INV_ID_PREFIX)
          ? deleteInventoryNotification(Number(id.slice(INV_ID_PREFIX.length)))
          : deleteNotification(id)
      )
    )
  }

  async function handleMarkAllRead() {
    if (includesInventory) {
      await Promise.all([markAllRead(userId, role), markAllInventoryNotificationsRead()])
    } else {
      await markAllRead(userId, role)
    }
  }

  // Click-outside detection, same pattern as LocationPicker.jsx — closes
  // the dropdown when clicking anywhere else, without the flicker a
  // naive onBlur+setTimeout approach can cause.
  useEffect(() => {
    if (!profileMenuOpen) return undefined
    function handleDocClick(e) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) setProfileMenuOpen(false)
    }
    document.addEventListener('mousedown', handleDocClick)
    return () => document.removeEventListener('mousedown', handleDocClick)
  }, [profileMenuOpen])

  function goToProfileTab(tabName) {
    setProfileMenuOpen(false)
    navigate(`/profile?tab=${tabName}`)
  }

  async function handleLogout() {
    setProfileMenuOpen(false)
    if (!(await confirm('Log out of your account?', { confirmLabel: 'Log Out' }))) return
    await signOut()
    navigate('/login', { replace: true })
  }

  const avatarContent = profile?.profile_img_url ? (
    <img src={profile.profile_img_url} alt={profile?.avatar_initials || ''} />
  ) : (
    profile?.avatar_initials || '?'
  )

  return (
    <div className="topbar">
      <button
        className="hamburger-btn"
        onClick={onToggleSidebar}
        title="Menu"
        aria-label="Open or close menu"
        type="button"
      >
        <MenuIcon strokeWidth={2.5} />
      </button>

      {/* Mobile-only brand header, replacing both the hamburger AND the
          page title specifically on mobile (see legacy.css's final
          override block) — matches Sidebar.jsx's own .sidebar-logo
          structure exactly (icon + name + role subtitle), just reused
          here since the sidebar itself collapses to icon-only on mobile
          and isn't visible by default there. Static, not a toggle —
          the bottom nav + profile dropdown already cover navigation and
          Logout on mobile without needing a drawer trigger here. */}
      <div className="topbar-mobile-logo">
        <div className="topbar-mobile-logo-mark">
          <img src={logo} alt="Bulsu Infirmary" />
        </div>
        <div className="topbar-mobile-logo-text">
          <h2>Bulsu Infirmary</h2>
          <p>{PORTAL_LABELS[role] || role}</p>
        </div>
      </div>

      <div className="topbar-page-title-wrap">
        <div className="topbar-title">{title}</div>
        {subtitle && <div className="topbar-breadcrumb">{subtitle}</div>}
      </div>

      <div className="topbar-right">
        {/* Empty slot pages can portal their own contextual action
            buttons into (e.g. Inventory Items' Add Item/Release) via
            <TopbarActions>, instead of hardcoding page-specific buttons
            into this shared, every-page component. Content only appears
            here while the page that rendered it is actually mounted —
            switching tabs/pages naturally clears it, no manual cleanup
            needed. */}
        <div id="topbar-page-actions" className="topbar-page-actions" />

        {role === 'patient' && (
          <button
            className="emg-login-header-btn"
            title="Send Emergency Alert"
            type="button"
            onClick={() => setEmgConfirmOpen(true)}
            style={{ marginLeft: 0 }}
          >
            <span className="sos-label">SOS</span>
          </button>
        )}

        <div
          className="icon-btn"
          role="button"
          tabIndex={0}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          onClick={toggleTheme}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggleTheme())}
        >
          {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
        </div>

        <div
          className="icon-btn"
          role="button"
          tabIndex={0}
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
          title="Notifications"
          onClick={openNotifications}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), openNotifications())}
        >
          <BellIcon />
          {unread > 0 && <span className="notif-dot">{unread > 9 ? '9+' : unread}</span>}
        </div>

        <div className={`topbar-profile-wrap${profileMenuOpen ? ' open' : ''}`} ref={profileMenuRef}>
          <div
            className="topbar-profile"
            role="button"
            tabIndex={0}
            aria-label="My Profile"
            aria-haspopup="true"
            aria-expanded={profileMenuOpen}
            title="My Profile"
            onClick={() => setProfileMenuOpen((v) => !v)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setProfileMenuOpen((v) => !v))}
          >
            <div className="topbar-avatar" style={{ background: TOPBAR_GRADIENT[role] || TOPBAR_GRADIENT.patient }}>
              {avatarContent}
            </div>
            <div className="topbar-profile-info">
              <span className="topbar-profile-name">{displayName || 'My Profile'}</span>
              <span className="topbar-profile-role">{ROLE_LABELS[role] || role}</span>
            </div>
            <ChevronDownIcon width={15} height={15} className={`topbar-profile-chevron${profileMenuOpen ? ' open' : ''}`} />
          </div>

          {/* Always rendered now (no more {profileMenuOpen && ...}) — same
              approach the sidebar itself uses: the element stays in the
              DOM permanently, and CSS :hover alone controls whether it's
              actually visible (see .topbar-profile-menu in legacy.css).
              The .open class above still exists too, purely for click/
              keyboard support (touch devices and keyboard nav don't get
              a real :hover state) — hovering and clicking both work,
              same dual-path pattern the sidebar's own hover-expand needs
              a click for on touch-only devices without true hover. */}
          <div className="topbar-profile-menu" role="menu">
            <div className="topbar-profile-menu-header" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <strong style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{displayName || 'My Profile'}</strong>
                <span style={{ display: 'block' }}>{ROLE_LABELS[role] || role}</span>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="My QR Code"
                aria-label="Show my QR code"
                style={{ flexShrink: 0 }}
                onClick={(e) => {
                  e.stopPropagation()
                  setProfileMenuOpen(false)
                  setQrModalOpen(true)
                }}
              >
                <QrCodeIcon width={17} height={17} />
              </button>
            </div>
            <button type="button" className="topbar-profile-menu-item" role="menuitem" onClick={() => goToProfileTab('personal')}>
              <SettingsIcon width={15} height={15} /> Account Settings
            </button>
            <div className="topbar-profile-menu-divider" />
            <button type="button" className="topbar-profile-menu-item danger" role="menuitem" onClick={handleLogout}>
              <LogoutIcon width={15} height={15} /> Logout
            </button>
          </div>
        </div>
      </div>

      <MyQrCodeModal isOpen={qrModalOpen} onClose={() => setQrModalOpen(false)} profile={profile} />

      <NotificationsModal
        isOpen={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onMarkRead={handleMarkRead}
        onMarkAllRead={handleMarkAllRead}
        onDelete={handleDelete}
        onRefresh={silentRefresh}
        onError={(msg) => show(msg, 'error')}
      />

      <EmergencyConfirmModal
        isOpen={emgConfirmOpen}
        onCancel={() => setEmgConfirmOpen(false)}
        onProceed={() => {
          setEmgConfirmOpen(false)
          setEmgFormOpen(true)
        }}
      />

      <Suspense fallback={null}>
        <EmergencyReportModal
          isOpen={emgFormOpen}
          profile={profile}
          onClose={() => setEmgFormOpen(false)}
          onError={(msg) => show(msg, 'error')}
          onSuccess={(name, location) => setEmgSuccess({ name, location })}
        />
      </Suspense>

      <EmergencySuccessOverlay
        result={emgSuccess}
        onClose={() => {
          stopEmergencySiren()
          setEmgSuccess(null)
        }}
      />
    </div>
  )
}