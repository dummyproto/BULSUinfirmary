import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '@context/AuthContext'
import {
  BookOpenIcon,
  XIcon,
  GridIcon,
  DocumentIcon,
  InventoryIcon,
  ReportsIcon,
  EmergencyIcon,
  SettingsIcon,
  ConsultationIcon,
  ChatbotIcon,
  PeopleIcon,
  UserIcon,
} from '@components/ui/icons'

// Mirrors routes/navItems.js's NAV_ITEMS exactly, so "every tab" here
// always matches what the current role actually sees in the sidebar —
// a section is only shown if the corresponding nav item exists for this
// role. "Getting Started" and "Your Profile" are universal (every role
// has a Topbar and a Profile page regardless of their nav list), so
// they're not gated by role at all.
const SECTIONS = [
  {
    key: 'start',
    label: 'Getting Started',
    Icon: BookOpenIcon,
    roles: ['admin', 'staff', 'patient'],
    content: (
      <>
        <h4>Signing in</h4>
        <p>
          Sign in with your registered email and password, or tap <strong>Scan ID</strong> on the login screen to identify your
          account by scanning your school ID's QR/barcode — you'll still need to enter your password afterward.
        </p>
        <h4>If your password is entered wrong repeatedly</h4>
        <p>
          After 5 wrong attempts, the sign-in form locks for 60 seconds. After the cooldown, you get 10 more attempts before the
          account is automatically disabled for security. A disabled account shows <em>"Your account is disabled — contact
          admin"</em> — only an administrator can re-enable it (Maintenance → User Management), even if you later enter the
          correct password.
        </p>
        <h4>Emergency Alert (SOS)</h4>
        <p>
          The red <strong>SOS</strong> button in the top bar is available from every page, including the login screen before you
          even sign in. It opens a confirmation, then a short form to describe the emergency and send it directly to clinic
          staff.
        </p>
        <h4>Notifications &amp; dark mode</h4>
        <p>
          The bell icon in the top bar shows your notifications. Dark/light mode is no longer in the top bar — switch it from{' '}
          <strong>Profile → Account Settings → Appearance</strong>.
        </p>
        <h4>Mobile view</h4>
        <p>
          On phones, tap the ☰ menu icon (top-left) to open the sidebar. A floating up-arrow button appears in the bottom-right
          corner once you've scrolled down a page — tap it to jump back to the top instantly.
        </p>
      </>
    ),
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    Icon: GridIcon,
    roles: ['admin', 'staff', 'patient'],
    content: (
      <>
        <p>Your Dashboard is the first thing you see after signing in, and its contents depend on your role:</p>
        <ul>
          <li>
            <strong>Patients</strong> see their recent document requests, a summary of their own health record (if any
            consultations are on file), and their emergency alert status.
          </li>
          <li>
            <strong>Staff and Admin</strong> see clinic-wide activity — pending document requests, low-stock/expiring
            inventory alerts, and recent emergency alerts — so you can spot what needs attention without opening every tab.
          </li>
        </ul>
        <p>Widgets with a "View All" button jump straight to the relevant tab for more detail.</p>
      </>
    ),
  },
  {
    key: 'patients',
    label: 'Patients',
    Icon: PeopleIcon,
    roles: ['admin', 'staff'],
    content: (
      <>
        <p>Search and open any patient's profile to review their health record and consultation history.</p>
        <ul>
          <li>Use the search bar to find a patient by name, student number, or username.</li>
          <li>Opening a patient shows their EHR (past consultations, diagnoses, and medications given).</li>
          <li>This tab is read/reference-focused — new consultations are recorded from the Consultation tab, not here.</li>
        </ul>
      </>
    ),
  },
  {
    key: 'doc-requests',
    label: 'Document Requests',
    Icon: DocumentIcon,
    roles: ['admin', 'staff'],
    content: (
      <>
        <p>Review and process every document request patients submit (medical certificates, clearances, etc.).</p>
        <ul>
          <li>
            Filter by status — <strong>Pending</strong> (just submitted), <strong>Processing</strong> (you're working on it),{' '}
            <strong>Approved</strong> (ready for pickup), <strong>Claimed</strong>, or <strong>Declined</strong>.
          </li>
          <li>Open a request to view what the patient submitted, then move it forward with the action buttons.</li>
          <li>
            Declining or approving lets you attach a note — this shows up directly in the patient's own request list, so be
            specific (e.g. why something was declined) since that's the only explanation they'll see.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'my-requests',
    label: 'My Requests',
    Icon: DocumentIcon,
    roles: ['patient'],
    content: (
      <>
        <p>Submit and track your own document requests here.</p>
        <ul>
          <li>
            Tap <strong>New Request</strong>, choose the document type, and fill in the purpose/details.
          </li>
          <li>
            Track progress through the status tabs at the top — <strong>Pending → Processing → Approved → Claimed</strong> (or{' '}
            <strong>Declined</strong>, with a note explaining why).
          </li>
          <li>
            The <strong>Processing Information</strong> card at the bottom of this page shows typical turnaround time, what to
            bring, and pickup hours.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'consultation',
    label: 'Consultation / Walk-in',
    Icon: ConsultationIcon,
    roles: ['staff'],
    content: (
      <>
        <p>Record a walk-in or scheduled consultation and, if medicine is given, deduct it from inventory in the same step.</p>
        <ul>
          <li>Search for the patient (or record it as a non-patient/guest visit if applicable).</li>
          <li>Fill in chief complaint, vitals, diagnosis, and any medicine/dosage given.</li>
          <li>Add follow-up instructions if the patient needs to come back.</li>
          <li>
            <strong>Save to Health Records + Deduct Inventory</strong> does both at once — it writes the consultation to the
            patient's record AND reduces the medicine's stock count, so you don't need to also go update Inventory separately.
          </li>
          <li>The Analytics sub-tab shows visit-type breakdowns (Walk-in vs. Emergency) and common diagnoses/medicines.</li>
        </ul>
      </>
    ),
  },
  {
    key: 'inventory',
    label: 'Inventory',
    Icon: InventoryIcon,
    roles: ['admin', 'staff'],
    content: (
      <>
        <p>Inventory has several sub-tabs, each covering a different part of stock management:</p>
        <ul>
          <li>
            <strong>Items</strong> — the main stock list, grouped into Non-Expired, Expired, and Needs Maintenance sections.
            Use Category/Status/Search to filter, and <strong>Clear Filters</strong> to reset all three at once. Add Item
            creates new stock; Release deducts stock (e.g. dispensed to a patient); Edit changes an item's details.
          </li>
          <li>
            <strong>Batches</strong> — every batch is tracked separately (a new delivery is always a new batch, never merged
            into an existing one), grouped by medicine. This is how expiry dates and FIFO (first-expiring-first-out) dispensing
            work correctly even when the same medicine has multiple batches on hand.
          </li>
          <li>
            <strong>Suppliers</strong> — your supplier directory. A supplier that's linked to any batch can't be deleted until
            those batches are reassigned or archived.
          </li>
          <li>
            <strong>QR Scanner</strong> — scan a batch's QR code (printed from Batches → QR) to quickly look it up or verify it
            during receiving/dispensing.
          </li>
          <li>
            <strong>Log</strong> — a full audit trail of every stock movement (additions, releases, adjustments) with who did
            it and when.
          </li>
          <li>
            <strong>Alerts</strong> — low stock, near-expiry, and expired items surface here automatically so nothing gets
            missed.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'reports',
    label: 'Reports',
    Icon: ReportsIcon,
    roles: ['admin', 'staff'],
    content: (
      <>
        <p>Generate clinic reports — consultation summaries, inventory usage, document-request volume, and more.</p>
        <ul>
          <li>Choose a report type and date range, then generate a preview before exporting.</li>
          <li>Exported reports are formatted for printing/sharing (e.g. for monthly clinic summaries).</li>
        </ul>
      </>
    ),
  },
  {
    key: 'emergency-alerts',
    label: 'Emergency Alerts',
    Icon: EmergencyIcon,
    roles: ['admin', 'staff', 'patient'],
    content: (
      <>
        <p>
          Anyone — signed in or not — can send an emergency alert using the red <strong>SOS</strong> button in the top bar (or
          on the login screen).
        </p>
        <ul>
          <li>Confirm you want to proceed, then describe the emergency and location.</li>
          <li>
            If you trigger SOS from the Chatbot after describing a symptom or how you're feeling, that message is
            automatically carried into the emergency description for you — you can still edit it before sending.
          </li>
          <li>
            <strong>Staff and Admin</strong> see every incoming alert on the Emergency Alerts page in real time, with the
            sender's name and location, and can respond directly.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'maintenance',
    label: 'System Maintenance',
    Icon: SettingsIcon,
    roles: ['admin'],
    content: (
      <>
        <p>Admin-only settings for managing the system itself.</p>
        <ul>
          <li>
            <strong>User Management</strong> — create, edit, activate, or deactivate any account. This is also the only place
            to re-enable an account that got disabled from repeated failed logins.
          </li>
          <li>
            <strong>Permissions</strong> — control what staff accounts are allowed to do.
          </li>
          <li>
            <strong>Email Configuration</strong> — manage the outgoing email settings used for notifications.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'chatbot',
    label: 'Chat-Bot',
    Icon: ChatbotIcon,
    roles: ['patient'],
    content: (
      <>
        <p>MediBot answers questions about clinic hours, documents, services, and general health tips 24/7.</p>
        <ul>
          <li>Tap a topic tile, or just type your question naturally.</li>
          <li>
            On mobile, tap <strong>Info</strong> in the chat header to open Topic Categories, Clinic Contacts, and the Medical
            Disclaimer in a slide-out panel — it closes automatically once you pick a topic.
          </li>
          <li>
            Typing <strong>"sos"</strong> anywhere opens the Emergency Alert form immediately.
          </li>
          <li>MediBot provides general information only — it is not a medical diagnosis. For emergencies, use SOS or call 911.</li>
        </ul>
      </>
    ),
  },
  {
    key: 'profile',
    label: 'Your Profile',
    Icon: UserIcon,
    roles: ['admin', 'staff', 'patient'],
    content: (
      <>
        <p>Tap your avatar (top-right) to open your profile. It has up to three tabs:</p>
        <ul>
          <li>
            <strong>Personal Information</strong> — your name, contact details, and (for patients) academic info. Staff
            accounts can view but not edit this themselves — an admin manages it via Maintenance.
          </li>
          <li>
            <strong>Family Background</strong> (patients only) — father's, mother's, and guardian's contact information.
          </li>
          <li>
            <strong>Account Settings</strong> — includes <strong>Appearance</strong> (light/dark mode), your read-only account
            details, and <strong>Change Password</strong>.
          </li>
        </ul>
        <h4>Linking your School ID for Scan ID login</h4>
        <p>
          In Personal Information, the <strong>School ID / Barcode Code</strong> field has a <strong>Scan</strong> button — use
          your camera to scan your ID's QR code (or type the code manually) to link it. Once linked, you can identify your
          account by scanning your ID at login instead of typing your email.
        </p>
      </>
    ),
  },
]

export default function UserManualModal({ isOpen, onClose }) {
  const { role } = useAuth()
  const visibleSections = SECTIONS.filter((s) => s.roles.includes(role))
  const [activeKey, setActiveKey] = useState(visibleSections[0]?.key)
  const active = visibleSections.find((s) => s.key === activeKey) || visibleSections[0]

  if (!isOpen) return null

  return createPortal(
    <div className="manual-overlay open" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="manual-box">
        <div className="manual-header">
          <h3>
            <BookOpenIcon width={17} height={17} /> User Manual
          </h3>
          <button type="button" className="manual-close-btn" onClick={onClose} aria-label="Close" title="Close">
            <XIcon width={18} height={18} />
          </button>
        </div>
        <div className="manual-body">
          <nav className="manual-nav">
            {visibleSections.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`manual-nav-item${active?.key === s.key ? ' active' : ''}`}
                onClick={() => setActiveKey(s.key)}
              >
                <s.Icon width={14} height={14} /> {s.label}
              </button>
            ))}
          </nav>
          <div className="manual-content">
            <h2>{active?.label}</h2>
            {active?.content}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}