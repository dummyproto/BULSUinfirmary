import { NavLink } from 'react-router-dom'
import { useAuth } from '@context/AuthContext'
import { NAV_ITEMS } from '@routes/navItems'

// Shorter labels for the bottom bar specifically — "Document Requests"
// or "Consultation / Walk-in" comfortably fit the sidebar's full-width
// row, but each tab here only gets a narrow, fixed slice of the screen.
// Keyed by nav item `key` so this stays independent of NAV_ITEMS itself
// (that data is also what the Sidebar renders full labels from — this
// is a display-only override, not a second source of truth for the
// route/icon/permission info, which still comes entirely from
// NAV_ITEMS).
const SHORT_LABELS = {
  'doc-requests': 'Requests',
  'consultation': 'Consultation',
  'emergency-alerts': 'Alerts',
  'maintenance': 'Settings',
  'my-requests': 'Requests',
}

/**
 * Mounted once in AppShell alongside Sidebar/Topbar, visible only below
 * the mobile breakpoint (see .mobile-bottom-nav in legacy.css) — the
 * Sidebar's hamburger-triggered drawer still exists for less-common
 * actions (Logout, any item that doesn't fit here), this is just quick
 * one-tap access to the same primary nav items for a phone-sized screen,
 * matching the bottom-tab-bar pattern most mobile apps already use
 * instead of a slide-out drawer for primary navigation.
 */
export default function MobileBottomNav() {
  const { role } = useAuth()
  const items = NAV_ITEMS[role] || []

  // Tapping "Chat-Bot" while already ON /chatbot is a no-op for
  // react-router (NavLink to the current route doesn't navigate or
  // remount the page), so ChatbotPage.jsx's mobile Topic
  // Categories/Contacts/Disclaimer drawer — which can be open at that
  // point (opened via its own Info button, or open from a fresh visit)
  // — would otherwise just sit there covering the chat with nothing
  // acting on the tap. This window event is a lightweight way to reach
  // across to that page-local state without lifting it up through
  // AppShell/context just for this one interaction; ChatbotPage listens
  // for it and closes the drawer if it's open.
  function handleItemClick(item) {
    if (item.key === 'chatbot') window.dispatchEvent(new Event('mobile-chatbot-tab-tap'))
  }

  return (
    <nav className="mobile-bottom-nav" aria-label="Primary">
      {items.map((item) => (
        <NavLink
          key={item.key}
          to={item.path}
          onClick={() => handleItemClick(item)}
          title={SHORT_LABELS[item.key] || item.label}
          aria-label={SHORT_LABELS[item.key] || item.label}
          className={({ isActive }) => `mobile-bottom-nav-item${isActive ? ' active' : ''}${item.emg ? ' nav-item-emg' : ''}`}
        >
          <item.icon width={20} height={20} />
          <span>{SHORT_LABELS[item.key] || item.label}</span>
        </NavLink>
      ))}
    </nav>
  )
}