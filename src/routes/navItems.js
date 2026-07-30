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
    { key: 'patients', label: 'Patients', path: '/patients', icon: PeopleIcon },
    { key: 'doc-requests', label: 'Document Requests', path: '/document-requests', icon: DocumentIcon },
    { key: 'inventory', label: 'Inventory', path: '/inventory', icon: InventoryIcon },
    { key: 'reports', label: 'Reports', path: '/reports', icon: ReportsIcon },
    { key: 'emergency-alerts', label: 'Emergency Alerts', path: '/emergency-alerts', icon: EmergencyIcon, emg: true },
    { key: 'maintenance', label: 'System Maintenance', path: '/maintenance', icon: SettingsIcon },
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

export const TOPBAR_GRADIENT = {
  admin: 'linear-gradient(135deg,#DC2626,#991B1B)',
  staff: 'linear-gradient(135deg,#1E7B5E,#6A3FA0)',
  patient: 'linear-gradient(135deg,#16A34A,#059669)',
}
