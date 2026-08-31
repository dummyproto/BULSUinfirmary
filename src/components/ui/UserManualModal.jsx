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
  HistoryIcon,
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
          Sign in with your registered email or username and password, or tap <strong>Scan ID</strong> on the login screen to
          identify your account by scanning your school ID's QR/barcode — you'll still need to enter your password afterward.
        </p>
        <h4>Creating an account</h4>
        <p>
          New patients register from the <strong>Register</strong> link on the login page — First Name, Last Name,
          Student/User ID, phone, course, year level, email, a username, and a password. Scanning a school ID's QR code
          during registration can pre-fill some of these fields automatically.
        </p>
        <h4>If your password is entered wrong repeatedly</h4>
        <p>
          After 5 wrong attempts, the sign-in form locks for 60 seconds. After the cooldown, you get 10 more attempts before the
          account is automatically disabled for security. A disabled account shows <em>"Your account is disabled — contact
          admin"</em> — only staff can re-enable it (System Management → User Management), even if you later enter the
          correct password.
        </p>
        <h4>Emergency Alert (SOS)</h4>
        <p>
          The red <strong>SOS</strong> button in the top bar is available from every page, including the login screen before you
          even sign in. It opens a confirmation, then a short form to describe the emergency and send it directly to clinic
          staff.
        </p>
        <h4>Notifications, dark mode &amp; live updates</h4>
        <p>
          The bell icon in the top bar shows your notifications. To delete one or several, tap <strong>Delete</strong> next to
          Mark All Read — this reveals checkboxes so you can select exactly which ones to remove. The sun/moon icon next to it
          switches between light and dark mode instantly.
        </p>
        <p>
          Most of what you see — document request statuses, your profile, notifications — updates live in real time. If
          someone else (or you, on another device) changes something, you'll usually see it update on screen without needing
          to refresh the page.
        </p>
        <h4>Mobile view</h4>
        <p>
          On phones, use the bottom navigation bar to access the main features and pages. A floating up-arrow button appears in the bottom-right corner once you've scrolled down a page — tap it to jump back to the top instantly.
        </p>
        
      
        <h4>If you're suddenly signed out</h4>
        <p>
          If a staff member deletes or deactivates your account while you're signed in, you'll be signed out immediately
          with a message explaining why — this isn't a bug, it's a deliberate security measure.
        </p>
      </>
    ),
  },
  {
    key: 'dashboard',
    label: 'Dashboard',
    Icon: GridIcon,
    roles: ['admin', 'staff', 'patient'],
    // A function of the viewer's own role, not static content — a
    // patient only ever sees their own patient-dashboard description,
    // not also a bullet about a staff/admin dashboard they don't have
    // access to (and vice versa for staff/admin).
    content: (role) => (
      <>
        <p>Your Dashboard is the first thing you see after signing in.</p>
        {role === 'patient' ? (
          <p>
            You'll see your recent document requests, a summary of your own health record (if any consultations are on
            file), and your emergency alert status.
          </p>
        ) : (
          <p>
            You'll see clinic-wide activity — pending document requests, low-stock/expiring inventory alerts, and recent
            emergency alerts — so you can spot what needs attention without opening every tab.
          </p>
        )}
        <p>Widgets with a "View All" button jump straight to the relevant tab for more detail.</p>
      </>
    ),
  },
  {
    key: 'patients',
    label: 'Patients',
    Icon: PeopleIcon,
    // Staff-only — admin's equivalent is the separate User Presence
    // Monitoring page below, which covers patient, staff, AND admin
    // accounts (not patients only), so it's kept as its own section
    // rather than folded into this one.
    roles: ['staff'],
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
    key: 'consultation',
    label: 'Consultation / Walk-in',
    Icon: ConsultationIcon,
    roles: ['staff'],
    content: (
      <>
        <p>Has five sub-tabs covering recording a visit and reviewing past ones:</p>
        <ul>
          <li>
            <strong>New Consultation</strong> — search for the registered patient (or use the{' '}
            <strong>Unregistered</strong> tab's own entry for a guest/walk-in with no account), fill in chief complaint,
            vitals, diagnosis, and any medicine/dosage given, and add follow-up instructions if they need to come back.{' '}
            <strong>Save to Health Records + Deduct Inventory</strong> does both at once — writes the consultation to the
            record AND reduces the medicine's stock, so you don't need to separately update Inventory. If you're offline
            when you save, it's queued instead of lost — see "If you lose your internet connection" in Getting Started.
          </li>
          <li>
            <strong>Health Records</strong> — every past consultation for registered patients, searchable, with{' '}
            <strong>View</strong> opening the full visit detail (vitals, diagnosis, medicines given, and who attended).
          </li>
          <li>
            <strong>Unregistered</strong> — the same record view, filtered to visits logged for someone without a patient
            account (a guest or walk-in).
          </li>
          <li>
            <strong>Case Listing</strong> — every consultation in one filterable table (by date range, visit type, or
            diagnosis) for a quick clinic-wide overview rather than searching per patient.
          </li>
          <li>
            <strong>Analytics</strong> — visit-type breakdowns (Walk-in vs. Emergency) and the most common
            diagnoses/medicines given.
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
            Once a request is <strong>Approved</strong>, open it and you'll see <strong>Print</strong>,{' '}
            <strong>Save as PNG</strong>, and <strong>Save as Word</strong> options — a ready-made copy of your request to
            bring when you go claim the actual document.
          </li>
          <li>
            Tap <strong>Select</strong> to check requests and delete them — only requests already marked{' '}
            <strong>Claimed</strong> can be removed this way; anything still active or pending can't be deleted, since it's
            still an open request staff are tracking.
          </li>
          <li>
            The <strong>Processing Information</strong> card at the bottom of this page shows typical turnaround time, what to
            bring, pickup hours, and the clinic's phone number and Facebook page.
          </li>
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
    key: 'inventory',
    label: 'Inventory',
    Icon: InventoryIcon,
    roles: ['admin', 'staff'],
    content: (
      <>
        <p>Inventory has several sub-tabs, each covering a different part of stock management:</p>
        <ul>
          <li>
            <strong>Dashboard</strong> — an at-a-glance overview: stock alert cards (Expiring in 90/30/7 Days, Expired
            Items, Damaged Inventory — tap any card to jump straight to that filtered view), Recently Received and
            Recently Released activity, a monthly movement chart, and the most-used medicines over the last 30 days.
          </li>
          <li>
            <strong>Items</strong> — the main stock list, grouped into Non-Expired, Expired, and Needs Maintenance
            sections. Use Category/Status/Search to filter, and <strong>Clear Filters</strong> to reset all three at once.
            Add Item creates new stock; Release deducts stock (e.g. dispensed to a patient); Edit changes an item's
            details. A pill toggle at the top switches this same tab to <strong>Batches</strong>: every batch tracked
            separately (a new delivery is always a new batch, never merged into an existing one), grouped by medicine —
            this is how expiry dates and FIFO (first-expiring-first-out) dispensing work correctly even when the same
            medicine has multiple batches on hand. A batch can also be marked <strong>Damaged</strong> (removes a quantity
            from usable stock) or <strong>Archived</strong> (removed from active stock but kept for history) — archived
            batches can be restored later. If you're offline when you Release or Add Stock, it's queued instead of
            failing — see "If you lose your internet connection" in Getting Started.
          </li>
          <li>
            <strong>Suppliers</strong> — your supplier directory. A supplier that's linked to any batch can't be deleted until
            those batches are reassigned or archived.
          </li>
          <li>
            <strong>QR Scanner</strong> — scan a batch's QR code (printed from the Batches view → QR) to quickly look it up
            or verify it during receiving/dispensing. No code to scan? <strong>Upload an image</strong> instead (iPhone
            photos convert automatically), or use <strong>Read Text</strong> to pull text off a handwritten label for you to
            review before typing it in — either way, nothing is saved until you confirm it on the verification screen.
          </li>
          <li>
            <strong>Log</strong> — a full audit trail of every stock movement (additions, releases, adjustments) with who did
            it and when. Staff with the delete permission (granted from System Management → Staff Permissions) can remove entries
            individually or in bulk with the Delete button.
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
          <li>Choose a report type and date range, then <strong>Generate</strong> to preview it on screen first.</li>
          <li>
            Once generated, <strong>Print</strong> opens a print-ready preview, or export it directly as{' '}
            <strong>PDF</strong>, <strong>Excel</strong>, or <strong>CSV</strong> — pick whichever format fits how you need
            to share or archive it.
          </li>
          <li>
            The <strong>Reset</strong> button clears the current report and filters — staff need it granted in System Management → Staff Permissions.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'emergency-alerts',
    label: 'Emergency Alerts',
    Icon: EmergencyIcon,
    // Patients still learn how to use the SOS button itself in
    // "Getting Started" (universal to every role) — this dedicated
    // section is staff/admin-only now, since its actual content is
    // about reviewing/responding to incoming alerts and notifying
    // parents, not something a patient does.
    roles: ['admin', 'staff'],
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
            <strong>Staff</strong> see every incoming alert on the Emergency Alerts page in real time, with the
            sender's name and location, and can respond directly. A loud alert sound plays automatically when a new one
            arrives — it keeps sounding until the alert is <strong>acknowledged</strong> or <strong>dismissed</strong>, from
            either the live pop-up or the Alert List tab.
          </li>
          <li>
            After sending, the confirmation screen also shows the clinic's direct phone number as a backup way to reach
            someone right away.
          </li>
        </ul>
        <h4>Notify Parent/Guardian (Staff)</h4>
        <p>
          Sends a real SMS text message straight to a patient's parent/guardian — this is an actual message delivery, not just
          an in-app notice.
        </p>
        <ul>
          <li>
            The Compose &amp; Preview panel walks you through it step by step: choose the patient, choose what happened, then
            confirm pickup instructions (already set to a sensible default). The message preview builds itself automatically as
            you go.
          </li>
          <li>
            Every message is sent in <strong>both English and Tagalog</strong>, so it's understandable to parents who may not
            read English — the Tagalog translation appears in italics in the preview.
          </li>
          <li>
            If a patient has no valid guardian number on file, you can enter one manually right there before sending.
          </li>
          <li>
            <strong>SMS Log</strong> and <strong>Alert Log</strong> keep a full history of everything sent — tap{' '}
            <strong>View</strong> on any entry to see the complete message. Staff specifically granted the
            permission in System Management → Staff Permissions can delete entries individually or select several at once with the{' '}
            <strong>Delete</strong> button.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'user-presence',
    label: 'User Presence Monitoring',
    Icon: PeopleIcon,
    roles: ['admin'],
    content: (
      <>
        <p>A directory of every account in the system — patients, staff, and other admins — in one table.</p>
        <ul>
          <li>Filter by role (All / Patients / Staff / Admins) and search by name, student number, or username.</li>
          <li>
            The <strong>Status</strong> column shows whether that person is <strong>Online</strong> right now — a live,
            real-time signal (do they currently have the app open in a connected session), separate from whether their
            account is enabled to sign in at all.
          </li>
          <li>
            Opening a row shows the same record view as the Patients tab — consultation history and health record details
            for patients; for staff/admin accounts it's mainly identifying info, since they don't have a clinical record.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'maintenance',
    label: 'System Management',
    Icon: SettingsIcon,
    roles: ['admin'],
    content: (
      <>
        <p>Staff-only settings for managing the system itself.</p>
        <ul>
          <li>
            <strong>User Management</strong> — create, edit, activate, or deactivate any account. This is also the only place
            to re-enable an account that got disabled from repeated failed logins. For patient accounts, Add/Edit User uses
            separate Surname and First Name fields (not one combined "Full Name" box), and the User ID follows the same
            2023-000-000 format used at registration.
          </li>
          <li>
            <strong>Staff Permissions</strong> — grant individual staff accounts specific abilities beyond their default role:
            printing inventory reports, document requests, or health records; resetting the Reports page; and deleting
            entries — one toggle covers deletion across all of the Alert Log, SMS Log, Inventory Transaction Log, Inventory
            Notifications, Scan History, and Document Requests. These toggles are what actually control what a staff
            account can do — an account without a toggle granted won't have that ability.
          </li>
        </ul>
      </>
    ),
  },
  {
    key: 'audit-trail',
    label: 'Audit Trail',
    Icon: HistoryIcon,
    roles: ['admin'],
    content: (
      <>
        <p>
          A complete, read-only history of who did what across the whole system — every tab lists date/time, the user, the
          action, and any relevant detail, with search and an action-type filter on each.
        </p>
        <ul>
          <li>
            <strong>System Activity Log</strong> — everything, unfiltered. Every other tab below is this same data,
            narrowed to one category.
          </li>
          <li>
            <strong>User Management Logs</strong> — accounts created, edited, deleted, activated/deactivated, and
            permission changes.
          </li>
          <li>
            <strong>Inventory Logs</strong> — the same stock-movement history as Inventory → Log, shown here alongside
            everything else for a full-system view.
          </li>
          <li>
            <strong>Authentication Logs</strong> — every sign-in attempt (successful or failed), sign-outs, and password
            changes/resets, filterable by role (Admin/Staff/Patient) as well as by action.
          </li>
          <li>
            <strong>Document Requests Logs</strong> — every request submitted, approved, rejected, or completed, plus when
            a resulting document was printed or downloaded.
          </li>
          <li>
            <strong>System Configuration Logs</strong> — staff permission changes, and a record of every backup generated
            (see Backup &amp; Export below).
          </li>
          <li>
            <strong>Backup &amp; Export</strong> — the only tab here that isn't a log. <strong>Back Up Audit Log (CSV)</strong>{' '}
            downloads the audit trail itself (up to the 500 most recent entries) as a spreadsheet-ready CSV. Below that,{' '}
            <strong>Create System Backup</strong> downloads a full JSON snapshot of the system's core data — Users,
            Document Requests, Consultations, Inventory, Inventory Logs, and Audit Logs, each capped at its usual list
            limit (a snapshot of recent activity, not the entire historical database).
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
        <p>
          MediBot is the clinic's virtual assistant, available 24/7 — including outside clinic hours. It replies in
          whichever language you write in (English, Filipino/Tagalog, Bisaya, or a mix), and keeps every answer short and
          in plain language.
        </p>
        <h4>Getting started</h4>
        <ul>
          <li>
            Tap one of the topic tiles — <strong>Clinic Hours</strong>, <strong>Location</strong>, <strong>Services</strong>,{' '}
            <strong>Documents</strong>, <strong>Symptom Check</strong>, <strong>Health Tips</strong>,{' '}
            <strong>Emergency</strong>, and <strong>Pre-Clinic</strong> (what to bring/prepare before a visit) — or just
            type your question naturally instead.
          </li>
          <li>
            <strong>Voice Mode</strong> (the switch at the top of the chat) has MediBot read its replies out loud
            automatically as they arrive. Tap the speaker icon on any individual message to replay it, or to stop it
            early.
          </li>
          <li>
            On mobile, tap <strong>Info</strong> in the chat header to open Topic Categories, Clinic Contacts, and the
            Medical Disclaimer in a slide-out panel — it closes automatically once you pick a topic.
          </li>
          <li>
            <strong>Logs</strong> shows your past conversations, and <strong>Clear</strong> lets you start a fresh one.
          </li>
        </ul>
        <h4>Everything MediBot can help with</h4>
        <ul>
          <li>Clinic hours, exact location (with directions), staff availability, and the clinic's contact number/Facebook page.</li>
          <li>
            What documents you can request (medical certificate, excuse letter, consultation record, incident report), what
            each one requires, and the step-by-step process to get one.
          </li>
          <li>
            The status of your <strong>own</strong> document requests, checked live from your account — MediBot can tell
            you directly, no need to switch to My Requests to check.
          </li>
          <li>Available clinic services — consultations, check-ups, first aid, minor-ailment medication, referrals, and health education.</li>
          <li>
            <strong>Symptom Check</strong> — describe what you're feeling (e.g. "I have fever, headache, and body pain")
            for a Symptom Analysis: commonly-associated conditions and a general risk level (Low/Medium/High), plus a
            suggested next step. This is a summary of what you typed, <strong>not a diagnosis</strong> — only a
            healthcare provider can properly evaluate symptoms.
          </li>
          <li>Basic first aid steps for minor cuts, scrapes, burns, and sprains.</li>
          <li>General wellness and preventive health tips, and a pre-visit checklist of what to prepare before coming in.</li>
          <li>Guidance on what to do in an urgent or emergency situation.</li>
          <li>
            How to use this app itself — registering, logging in, resetting a password, submitting/tracking document
            requests, sending an emergency alert, viewing/editing your profile, notifications, and similar questions.
          </li>
        </ul>
        <h4>Emergencies &amp; sensitive topics</h4>
        <ul>
          <li>
            Typing <strong>"sos"</strong> anywhere in the chat opens the Emergency Alert form immediately. If you trigger
            SOS after describing a symptom or how you're feeling, that message carries over into the alert description
            automatically — you can still edit it before sending. You can also just tap the red <strong>SOS</strong>{' '}
            button in the top bar at any time instead.
          </li>
          <li>
            If a symptom you describe sounds urgent, MediBot tells you right away to go to the clinic or seek emergency
            care, instead of continuing with general self-care tips.
          </li>
          <li>
            If you write about feeling sad, anxious, lonely, or overwhelmed, MediBot responds supportively rather than
            just factually — and if a message suggests you may be thinking about harming yourself, it immediately shows
            crisis resources (the clinic, campus security, a national crisis hotline, and emergency services) alongside
            its reply.
          </li>
        </ul>
        <h4>What MediBot won't do</h4>
        <p>
          It never gives a confirmed diagnosis, prescribes medicine or dosages, or replaces an actual doctor, nurse, or
          psychologist — it always points you to the clinic for a real assessment. It also won't discuss staff-only
          screens, or anyone's personal staff information, regardless of who's asking. MediBot provides general
          information only — for emergencies, use SOS or call 911.
        </p>
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
            <strong>Personal Information</strong> — your name (Surname, First Name, M.I., and a Jr./Sr./II/III extension
            dropdown), contact details, address, and (for patients) academic info. Staff accounts can view but not edit this
            themselves — a staff member manages it via System Management.
          </li>
          <li>
            <strong>Family Background</strong> (patients only) — father's, mother's, and guardian's contact information.
          </li>
          <li>
            <strong>Account Settings</strong> — your username, email, read-only account details, and{' '}
            <strong>Change Password</strong>. Input your current password, enter your new password, confirm it, and click the Update Password button.
          </li>
        </ul>
        <h4>Address</h4>
        <p>
          Region, Province, City/Municipality, and Barangay are cascading dropdowns using real Philippine location data —
          pick a Region to see its actual Provinces, pick a Province to see its actual Cities/Municipalities, and so on. Zip
          Code is a 4-digit field.
        </p>
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
            {typeof active?.content === 'function' ? active.content(role) : active?.content}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}