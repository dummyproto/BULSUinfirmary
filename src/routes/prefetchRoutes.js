// Every page in AppRoutes.jsx (and several frequently-used modals
// elsewhere) is behind React.lazy() — a deliberate, worthwhile trade for
// initial load size (see AppRoutes.jsx's own comment: brought a single
// ~1.07MB bundle down to a small shared chunk + per-page chunks). The
// cost of that trade is that the VERY FIRST time any given page or modal
// is opened, the browser has to fetch and parse its chunk before
// anything appears — which is exactly the "click a nav item/button ->
// slow loading before it pops up" delay this file exists to fix.
//
// The fix isn't to un-lazy everything (that would bring back the large
// initial bundle this was split up to avoid) — it's to fetch those same
// chunks proactively, in the background, during the browser's idle time
// after the app has already finished its own initial render, so that by
// the time the person actually clicks something, its chunk is already
// sitting in the browser's cache and resolves instantly instead of
// triggering a fresh network request.
//
// Calling the same dynamic import() a second time (here, vs. whenever
// React.lazy() itself eventually calls it) is safe and cheap — the
// bundler/browser dedupes it to the already-in-flight-or-cached module,
// never double-downloads, and never causes a duplicate side effect.

// Role-scoped on purpose — prefetching a page someone can never actually
// navigate to (e.g. warming Maintenance's chunk for a patient) would
// just waste their bandwidth for no benefit. `common` runs for every
// authenticated role; the rest only run for roles that can reach them
// (matches the exact same role gates AppRoutes.jsx itself enforces).
const PREFETCHERS = {
  common: [
    () => import('@features/dashboard/DashboardPage'),
    () => import('@features/profile/ProfilePage'),
    // EmergencyReportModal (Topbar.jsx's SOS button) is reachable from
    // every page regardless of role — moved here from the staffAdmin
    // bucket below, which would have left patients without this warmed.
    () => import('@features/emergency-alerts/EmergencyReportModal'),
  ],
  staff: [() => import('@features/patients/PatientsPage'), () => import('@features/consultations/ConsultationPage')],
  staffAdmin: [
    () => import('@features/document-requests/DocumentRequestsPage'),
    () => import('@features/inventory/InventoryPage'),
    () => import('@features/reports/ReportsPage'),
    () => import('@features/emergency-alerts/EmergencyAlertsPage'),
  ],
  admin: [
    () => import('@features/patients/UserPresenceMonitoringPage'),
    () => import('@features/maintenance/MaintenancePage'),
    () => import('@features/audit-trail/AuditTrailPage'),
  ],
  patient: [() => import('@features/document-requests/MyRequestsPage'), () => import('@features/chatbot/ChatbotPage')],
}

function prefetchersForRole(role) {
  const list = [...PREFETCHERS.common]
  if (role === 'staff') list.push(...PREFETCHERS.staff, ...PREFETCHERS.staffAdmin)
  if (role === 'admin') list.push(...PREFETCHERS.staffAdmin, ...PREFETCHERS.admin)
  if (role === 'patient') list.push(...PREFETCHERS.patient)
  return list
}

// requestIdleCallback runs this only when the browser genuinely has spare
// time (after the current page has finished its own render/paint work) —
// exactly what's wanted here: never compete with or slow down whatever
// the person is actually doing right now. Safari has no
// requestIdleCallback at all, hence the setTimeout fallback (a short
// delay approximates the same "let the current work finish first" idea).
function whenIdle(fn) {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(fn, { timeout: 2000 })
  } else {
    setTimeout(fn, 300)
  }
}

// Spread out one-per-idle-slot rather than fired all at once — even in
// idle time, kicking off 5-10 simultaneous chunk downloads the instant
// the dashboard mounts could still noticeably compete with real network
// requests the page itself is making (loading the dashboard's own data).
// Trickling them in, one per idle callback, keeps this genuinely
// background-priority the whole way through instead of just at the start.
//
// Exported directly (not just prefetchRoutesForRole below) so
// LoginPage.jsx and RegisterModal.jsx — which each have their own small
// set of lazy-loaded modals (QrLoginScan, ForgotPasswordModal,
// EmergencyReportModal, RegisterQrScan) that exist BEFORE anyone is
// authenticated, so prefetchRoutesForRole below can never reach them —
// can warm those up the same way, with the same background-priority
// behavior, without duplicating this scheduling logic.
export function prefetchOnIdle(importers) {
  const queue = [...importers]
  function next() {
    const importer = queue.shift()
    if (!importer) return
    importer().catch(() => {
      // A prefetch failing (offline, flaky connection, etc.) is never
      // worth surfacing — the normal lazy-load at actual use time is
      // still there as the real fallback either way.
    })
    if (queue.length) whenIdle(next)
  }
  whenIdle(next)
}

export function prefetchRoutesForRole(role) {
  prefetchOnIdle(prefetchersForRole(role))
}