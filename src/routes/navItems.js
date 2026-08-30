import {
  GridIcon,
  DocumentIcon,
  InventoryIcon,
  ReportsIcon,
  EmergencyIcon,
  SettingsIcon,
  ConsultationIcon,
  ChatbotIcon,
  PeopleIcon,
  HistoryIcon,
} from '@components/ui/icons'

// Mirrors the legacy buildSidebar() menus object + Router.go's
// adminOnly/staffAdmin/patientOnly permission arrays, but as one config so
// the Sidebar links and the route guards can never silently drift apart.
//
// NOTE: badge counts (pending doc requests, inventory alerts, active
// emergencies) are wired to live Supabase data in Phase 3 once each
// feature's service layer exists — omitted here on purpose.
export const NAV_ITEMS = {
  admin: [
    { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: GridIcon },
    { key: 'user-presence', label: 'User Presence Monitoring', path: '/user-presence', icon: PeopleIcon },
    { key: 'doc-requests', label: 'Document Requests', path: '/document-requests', icon: DocumentIcon },
    { key: 'inventory', label: 'Inventory', path: '/inventory', icon: InventoryIcon },
    { key: 'reports', label: 'Reports', path: '/reports', icon: ReportsIcon },
    { key: 'emergency-alerts', label: 'Emergency Alerts', path: '/emergency-alerts', icon: EmergencyIcon, emg: true },
        { key: 'maintenance', label: 'System Management', path: '/maintenance', icon: SettingsIcon },
    { key: 'audit-trail', label: 'Audit Trail', path: '/audit-trail', icon: HistoryIcon },
  ],
  staff: [
    { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: GridIcon },
    { key: 'patients', label: 'Patients', path: '/patients', icon: PeopleIcon },
    { key: 'doc-requests', label: 'Document Requests', path: '/document-requests', icon: DocumentIcon },
    { key: 'consultation', label: 'Consultation / Walk-in', path: '/consultation', icon: ConsultationIcon },
    { key: 'inventory', label: 'Inventory', path: '/inventory', icon: InventoryIcon },
    { key: 'reports', label: 'Reports', path: '/reports', icon: ReportsIcon },
    { key: 'emergency-alerts', label: 'Emergency Alerts', path: '/emergency-alerts', icon: EmergencyIcon, emg: true },
  ],
  patient: [
    { key: 'dashboard', label: 'Dashboard', path: '/dashboard', icon: GridIcon },
    { key: 'my-requests', label: 'My Requests', path: '/my-requests', icon: DocumentIcon },
    { key: 'chatbot', label: 'Chat-Bot', path: '/chatbot', icon: ChatbotIcon },
  ],
}

export const ROLE_LABELS = {
  admin: 'Administrator Portal',
  staff: 'Clinic Staff Portal',
  patient: 'Patient Portal',
}

// Purely a display grouping for the sidebar — organizes admin/staff's
// longer nav lists into labeled sections so they're easier to scan at a
// glance instead of one long undifferentiated list. References items by
// `key` rather than duplicating their path/icon/label, so this can never
// drift out of sync with NAV_ITEMS above (the actual source of truth
// used everywhere else — route guards, MobileBottomNav, the page-title
// lookup in AppShell.jsx).
export const NAV_GROUPS = {
  admin: [
    { section: 'Overview', keys: ['dashboard'] },
    { section: 'Clinic Operations', keys: ['doc-requests', 'inventory', 'reports', 'emergency-alerts'] },
    { section: 'Administration', keys: ['user-presence', 'maintenance', 'audit-trail'] },
  ],
  staff: [
    { section: 'Overview', keys: ['dashboard'] },
    { section: 'Patient Care', keys: ['patients', 'consultation', 'doc-requests'] },
    { section: 'Operations', keys: ['inventory', 'reports', 'emergency-alerts'] },
  ],
  // Patient's list is short (3 items) — this grouping exists purely so
  // the same "Overview" section-header convention admin/staff use is
  // consistent across every role, not because 3 items genuinely needs
  // grouping to stay scannable. This also means Sidebar.jsx's `groups ?
  // 'always-expanded' : ''` now applies to patient too — patient's
  // sidebar behaves the same as admin/staff's (stays at full width by
  // default rather than the icon-only hover-rail it used to fall back
  // to) — and the section-header labels correctly hide when the sidebar
  // IS collapsed via the width-based @container rule in legacy.css,
  // exactly like admin/staff's already do.
  patient: [
    { section: 'Overview', keys: ['dashboard'] },
    { section: 'Patient Services', keys: ['my-requests', 'chatbot'] },
  ],
}

export const TOPBAR_GRADIENT = {
  admin: 'linear-gradient(135deg,#DC2626,#991B1B)',
  staff: 'linear-gradient(135deg,#1E7B5E,#6A3FA0)',
  patient: 'linear-gradient(135deg,#16A34A,#059669)',
}