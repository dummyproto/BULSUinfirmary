# Project Structure

```
clinic-system-react/
├── .env.example              # copy to .env.local, fill in Supabase URL + anon key
├── supabase/
│   ├── clinic_schema_v2_consolidated.sql   # fresh-install schema (original + migration + RLS in one)
│   ├── functions/
│   │   ├── create-user/
│   │   │   └── index.ts   # Edge Function: server-side user provisioning (service-role key lives ONLY here)
│   │   └── chat-completion/
│   │       ├── index.ts       # Edge Function: Groq-backed AI chatbot replies (GROQ_API_KEY lives ONLY here)
│   │       └── knowledge.ts   # system prompt / knowledge base, ported from the MediBot package
│   └── migrations/
│       ├── 001_phase_a_schema_and_rls.sql   # closes schema-vs-UI gaps + adds RLS to every table
│       ├── 002_phase_j_qr_login.sql          # narrow email-lookup RPC for QR/barcode login
│       ├── 003_phase_k_registration_rls.sql   # widens RLS to allow patient self-registration
│       ├── 004_login_emergency_sos.sql          # anonymous access for the pre-login SOS button
│       ├── 005_chatbot_persistence.sql           # chat_conversations + chat_messages, strict per-user RLS
│       ├── 006_registration_profile_repair.sql   # self-cleanup delete policy + idempotent RLS re-affirmation
│       ├── 007_medicine_normalization.sql        # additive medicines/medicine_batches/suppliers + backfill (interface not yet migrated)
│       ├── 008_medicine_view_and_unit_fields.sql  # medicines.unit/min_stock + medicine_inventory_view (Phase 3 — interface now reads/writes these tables)
│       ├── 009_archive_batch_support.sql          # adds 'Archived' as a valid medicine_batches.status (Phase 4)
│       ├── 010_supplier_delete_protection.sql     # medicine_batches.supplier_id: ON DELETE SET NULL → RESTRICT (Phase 5)
│       ├── 011_receiving_records.sql               # new receiving_records table — immutable "what was received" event (Phase 6)
│       ├── 012_movement_tracking_improvements.sql   # previous/new quantity columns, canonical action_type set, inventory_id FK bug fix (Phase 7)
│       ├── 013_inventory_status_expansion.sql       # 'Damaged' batch status + medicine_inventory_view.latest_batch_status (Phase 8)
│       ├── 014_batch_qr_codes.sql                   # scan_history.medicine_batch_id + 'BatchView' result (Phase 9)
│       ├── 015_dashboard_aggregations.sql            # get_monthly_inventory_movement / get_top_used_medicines RPCs + created_at index (Phase 10)
│       ├── 016_final_review_fixes.sql                # consultation_medications FK bug fix + 3 missing indexes (Phase 12)
│       ├── 017_inventory_notifications.sql           # new inventory_notifications table — dedicated, medicine/batch-linked (Notification System Phase 2)
│       └── 018_expiration_check_automation.sql       # run_expiration_check() SQL function (single source of truth) + optional daily pg_cron schedule (Notification System Phase 8)
├── vercel.json                # Vercel SPA rewrite + asset caching
├── netlify.toml                # Netlify build config + SPA redirect + asset caching
├── vite.config.js              # path aliases, React plugin
├── eslint.config.js            # flat config, react-hooks + react-refresh rules
├── jsconfig.json               # editor path-alias resolution (mirrors vite.config.js)
├── index.html                  # shell: #root, #toast-container, fonts
├── README.md / DEPLOYMENT.md / KNOWN_ISSUES.md / RECOMMENDATIONS.md
│
└── src/
    ├── main.jsx                # entry point, imports legacy.css + app.css
    ├── App.jsx                 # provider tree (Theme -> Toast -> Auth -> Router)
    │
    ├── routes/
    │   ├── AppRoutes.jsx        # route tree; every page below is React.lazy-loaded
    │   ├── ProtectedRoute.jsx   # auth + role guard
    │   ├── NotFoundPage.jsx
    │   └── navItems.js          # single source of truth: sidebar links + role access
    │
    ├── layouts/
    │   ├── AppShell.jsx          # sidebar + topbar + routed content wrapper
    │   ├── Sidebar.jsx, Topbar.jsx (incl. real-time notification bell)
    │   └── AuthLayout.jsx        # centered wrapper for /login
    │
    ├── context/
    │   ├── AuthContext.jsx       # Supabase session + flattened user/profile row
    │   ├── ThemeContext.jsx      # light/dark, session-only (no localStorage)
    │   └── ToastContext.jsx      # toast queue
    │
    ├── services/                 # the Supabase data-access layer -- one file per
    │   │                            table/domain, all async, all thrown-on-error
    │   ├── supabaseClient.js      # the one Supabase client instance (env-var only)
    │   ├── documentRequestsService.js
    │   ├── consultationsService.js
    │   ├── inventoryService.js
    │   ├── medicineService.js
    │   ├── inventoryNotificationsService.js
    │   ├── appointmentsService.js
    │   ├── emergencyAlertsService.js
    │   ├── auditLogsService.js
    │   ├── notificationsService.js
    │   ├── usersService.js
    │   └── chatService.js         # chatbot conversation persistence + AI-reply Edge Function call
    │
    ├── components/ui/            # generic, reusable, no business logic
    │   ├── Modal.jsx              # focus-trapped, Escape-to-close, portal-rendered
    │   ├── Toggle.jsx             # accessible switch (role=switch, keyboard support)
    │   ├── SearchableSelect.jsx   # combobox used by patient/diagnosis/medicine pickers
    │   ├── Avatar.jsx, Card.jsx, Tabs.jsx, StatusBadge.jsx, SearchInput.jsx
    │   ├── Spinner.jsx, ToastViewport.jsx, icons.jsx
    │
    ├── hooks/
    │   └── useSidebar.js          # collapsed/drawer state (session-only)
    │
    ├── lib/                       # cross-feature pure helpers
    │   ├── format.js               # date/datetime formatting
    │   └── vitals.js               # vitals-input sanitizer
    │
    ├── features/                  # one folder per page/domain
    │   ├── auth/                   # LoginPage
    │   ├── dashboard/               # 3 role dashboards + shared appt detail modal
    │   ├── patients/                 # patient directory + record modal
    │   ├── document-requests/         # DocumentRequestsPage (staff/admin) + MyRequestsPage (patient)
    │   ├── consultations/              # EHR: New/Records/Cases/Analytics tabs + lib/
    │   ├── inventory/                   # Items/Scan/Log/Alerts tabs + lib/
    │   ├── emergency-alerts/             # Active/Log/Composer/SMS Log tabs + lib/
    │   ├── reports/                       # report generator + print + lib/
    │   ├── maintenance/                    # user management + permissions + lib/, data/
    │   ├── notifications/                   # NotificationsModal
    │   ├── chatbot/                          # MediBot: engine + data + UI
    │   └── profile/                           # personal info / family / settings + lib/
    │
    └── styles/
        ├── legacy.css              # ported design system (verbatim from the original app)
        ├── app.css                 # additive-only: spinner, route-loading states
        └── bulsu.png                # asset legacy.css references via url()
```

## Key Architectural Notes

- **`src/services/` is the only place that talks to Supabase.** Every page fetches/mutates through a service function — no page ever calls `supabase.from(...)` directly. This is what makes the schema-gap workarounds (diagnosis encoding, consultation-log markers, etc.) auditable in one place per domain instead of scattered across UI code.
- **`navItems.js` is the single source of truth** for both the Sidebar's visible links and the route guards' allowed roles — they cannot silently drift apart the way the legacy `buildSidebar()` menus and `Router.go()` permission arrays could.
- **Every route-level page is lazy-loaded** (`AppRoutes.jsx`) — this is what took the initial bundle from ~1.07MB to ~250KB.
- **No file in `src/` uses `localStorage`** — verified via `grep -rn localStorage src/` returning zero API calls (only explanatory comments).
