-- ═══════════════════════════════════════════════════════════════════════════
-- University Clinic Services System — Consolidated Schema (v2)
-- Target: PostgreSQL 14+ / Supabase
--
-- This is `clinic_schema.sql` (the original design) with
-- `supabase/migrations/001_phase_a_schema_and_rls.sql` merged directly into
-- the CREATE TABLE statements, plus RLS enabled from the start — written
-- for spinning up a BRAND NEW, EMPTY Supabase project in one shot.
--
-- If you already have a project running the original schema with real
-- data in it, do NOT run this file — keep using clinic_schema.sql (already
-- applied) + supabase/migrations/001_phase_a_schema_and_rls.sql instead.
-- This file has no backfill logic for existing data; migration 001 does.
--
-- What changed vs. the original clinic_schema.sql (see KNOWN_ISSUES.md for
-- the full history of why):
--   • users: added auth_user_id (bridges Supabase Auth <-> this table)
--   • patient_profiles: added father_*/mother_*/guardian_address/parent_phone_2
--   • document_requests: status now allows 'Claimed'
--   • consultations: added diagnosis, follow_up_notes; visit_type now allows 'Emergency'
--   • inventory_logs: action_type widened; added consultation_id FK
--   • emergency_alerts: added sms_sent
--   • Row Level Security enabled + policies on every table
-- ═══════════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────────────────
-- 1. USERS  (core account for every role: admin / staff / patient)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE users (
    user_id         SERIAL PRIMARY KEY,
    username        VARCHAR(50)  NOT NULL UNIQUE,
    email           VARCHAR(150) NOT NULL UNIQUE,
    password_hash   VARCHAR(255) NOT NULL,
    role            VARCHAR(10)  NOT NULL CHECK (role IN ('admin','staff','patient')),
    name            VARCHAR(150) NOT NULL,          -- display name
    avatar_initials VARCHAR(5),
    profile_img_url TEXT,
    phone           VARCHAR(20),
    school_id_barcode VARCHAR(50) UNIQUE,           -- barcode/QR login for students
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    auth_user_id    UUID UNIQUE,                     -- bridges to Supabase Auth's auth.users(id)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX idx_users_role ON users(role);

-- Staff/admin-only employment attributes (1:1 with users where role IN admin/staff)
CREATE TABLE staff_profiles (
    user_id     INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    department  VARCHAR(100),
    position    VARCHAR(100)
);

-- Fixed 3-flag permission set granted to staff by admin (admin implicitly has all)
CREATE TABLE staff_permissions (
    user_id             INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    print_inventory     BOOLEAN NOT NULL DEFAULT FALSE,
    print_appointments  BOOLEAN NOT NULL DEFAULT FALSE,
    print_health        BOOLEAN NOT NULL DEFAULT FALSE
);

-- Patient-only demographic / enrollment attributes (1:1 with users where role='patient')
CREATE TABLE patient_profiles (
    user_id         INTEGER PRIMARY KEY REFERENCES users(user_id) ON DELETE CASCADE,
    student_number  VARCHAR(20) NOT NULL UNIQUE,     -- e.g. 2021-00123
    surname         VARCHAR(100) NOT NULL,
    given_name      VARCHAR(100) NOT NULL,
    middle_initial  VARCHAR(5),
    suffix          VARCHAR(10),
    course          VARCHAR(150),
    year_level      VARCHAR(20),
    date_of_birth   DATE,
    birth_place     VARCHAR(150),
    gender          VARCHAR(20),
    civil_status    VARCHAR(20),
    religion        VARCHAR(50),
    nationality     VARCHAR(50),
    blood_type      VARCHAR(5),
    -- primary guardian / emergency contact (used by Emergency Alerts' SMS composer)
    parent_name     VARCHAR(150),
    parent_phone    VARCHAR(20),
    parent_phone_2  VARCHAR(20),
    parent_relation VARCHAR(30),
    guardian_address VARCHAR(255),
    -- separate father/mother contacts (Profile page's Family Background tab)
    father_name     VARCHAR(150),
    father_phone    VARCHAR(20),
    father_address  VARCHAR(255),
    mother_name     VARCHAR(150),
    mother_phone    VARCHAR(20),
    mother_address  VARCHAR(255),
    -- address
    addr_region     VARCHAR(100),
    addr_province   VARCHAR(100),
    addr_city       VARCHAR(100),
    addr_barangay   VARCHAR(100),
    addr_zip        VARCHAR(10)
);
CREATE INDEX idx_patient_profiles_student_number ON patient_profiles(student_number);

-- ─────────────────────────────────────────────────────────────────────────
-- 2. DOCUMENT REQUESTS  (patient requests medical cert / clearance / etc.)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE document_requests (
    doc_request_id  SERIAL PRIMARY KEY,
    patient_id      INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- nullable + SET NULL (Phase 3 / migration 019): historical record survives account deletion
    doc_type        VARCHAR(100) NOT NULL,   -- Medical Certificate, Health Clearance, ...
    purpose         VARCHAR(255),
    date_requested  DATE NOT NULL,
    date_needed     DATE,
    status          VARCHAR(20) NOT NULL DEFAULT 'Pending'
                     CHECK (status IN ('Pending','Processing','Approved','Declined','Claimed')),
    processed_by    INTEGER REFERENCES users(user_id) ON DELETE SET NULL,   -- staff/admin who acted on it
    notes           TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX idx_docreq_patient ON document_requests(patient_id);
CREATE INDEX idx_docreq_status  ON document_requests(status);

-- ─────────────────────────────────────────────────────────────────────────
-- 3. CONSULTATIONS  (walk-in / appointment visit records — the EHR entry)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE consultations (
    consultation_id SERIAL PRIMARY KEY,
    patient_id      INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- nullable + SET NULL (Phase 3 / migration 019): a medical record must survive account deletion
    visit_type      VARCHAR(20) NOT NULL CHECK (visit_type IN ('Walk-in','Appointment','Emergency')),
    chief_complaint TEXT,
    bp              VARCHAR(15),             -- e.g. '120/80'
    temp_celsius    NUMERIC(4,1),
    pulse_bpm       SMALLINT,
    o2_sat_pct      SMALLINT,
    diagnosis       VARCHAR(150),
    assessment      TEXT,
    medications     TEXT,                    -- free-text prescription summary
    attended_by     INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- staff/physician
    visit_date      DATE NOT NULL,
    follow_up_date  DATE,
    follow_up_notes TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_consult_patient ON consultations(patient_id);
CREATE INDEX idx_consult_date    ON consultations(visit_date);

-- Diagnosis reference list (Phase 8) — was static, client-side-only data
-- with a form ("Add New Diagnosis") that looked like it persisted but
-- never actually wrote anywhere; now a real table. A plain `category`
-- column, not a separate lookup table — categories here are just a
-- label with no other metadata, verified 1:1 with no overlaps against
-- the original 67-entry reference list before choosing this design.
CREATE TABLE diagnoses (
    diagnosis_id SERIAL PRIMARY KEY,
    name         VARCHAR(150) NOT NULL UNIQUE,
    category     VARCHAR(50) NOT NULL DEFAULT 'Other',
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diagnoses_category ON diagnoses(category);
CREATE INDEX idx_diagnoses_active ON diagnoses(active);

-- (consultation_medications table is defined in section 4, after `inventory`
--  exists, since it holds a foreign key into it)

-- ─────────────────────────────────────────────────────────────────────────
-- 4. INVENTORY  (medicine / supply / equipment items + FIFO batch tracking)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE inventory (
    inventory_id     SERIAL PRIMARY KEY,
    name             VARCHAR(150) NOT NULL,
    category         VARCHAR(20) NOT NULL CHECK (category IN ('Medicine','Supply','Equipment')),
    quantity         INTEGER NOT NULL DEFAULT 0,     -- aggregate on-hand qty (sum of open batches)
    unit             VARCHAR(30) NOT NULL,           -- Tablets, Bottles, Units, ...
    min_stock        INTEGER NOT NULL DEFAULT 0,
    expiration_date  DATE,                           -- soonest active batch expiry (display cache)
    received_date    DATE,
    is_fifo          BOOLEAN NOT NULL DEFAULT FALSE,  -- whether item is batch/FIFO-tracked
    batch_no         VARCHAR(50),                     -- most-recent batch, quick reference
    supplier         VARCHAR(150),
    needs_maintenance BOOLEAN NOT NULL DEFAULT FALSE,  -- equipment only
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ
);
CREATE INDEX idx_inventory_category ON inventory(category);

-- FIFO batches belonging to an inventory item (multiple deliveries of the same item)
CREATE TABLE inventory_batches (
    batch_id         SERIAL PRIMARY KEY,
    inventory_id     INTEGER NOT NULL REFERENCES inventory(inventory_id) ON DELETE CASCADE,
    batch_code       VARCHAR(50) NOT NULL,            -- human-readable batch/lot number
    quantity         INTEGER NOT NULL DEFAULT 0,      -- remaining qty in this batch
    expiration_date  DATE,
    received_date    DATE,
    supplier         VARCHAR(150),
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (inventory_id, batch_code, expiration_date, received_date)
);
CREATE INDEX idx_batches_inventory ON inventory_batches(inventory_id);
CREATE INDEX idx_batches_expiration ON inventory_batches(expiration_date);

-- Stock movement audit trail (replenish / release / adjustment / ...)
CREATE TABLE inventory_logs (
    inventory_log_id SERIAL PRIMARY KEY,
    inventory_id     INTEGER REFERENCES inventory(inventory_id) ON DELETE SET NULL,  -- SET NULL, not the implicit default: deleteInventoryItem() would otherwise fail for any item with prior log history (Phase 7 bug fix)
    batch_id         INTEGER REFERENCES inventory_batches(batch_id),
    consultation_id  INTEGER REFERENCES consultations(consultation_id) ON DELETE SET NULL,
    action_type      VARCHAR(20) NOT NULL CHECK (action_type IN (
                        -- canonical Phase 7 set, used by the normalized Medicine path
                        'Received', 'Released', 'Adjustment', 'Damaged', 'Expired', 'Archived',
                        -- legacy values — still actively used by the Supply/Equipment path
                        -- (inventoryService.js), which was never part of the Medicine
                        -- normalization in Phases 2-6 and still inserts these directly
                        'Replenish', 'Release', 'Edit', 'Merge', 'Remove Expired', 'Removed',
                        'Maintained', 'Maintenance Hold'
                      )),
    quantity_change  INTEGER NOT NULL,        -- signed: + for received, - for released/damaged/expired
    previous_quantity INTEGER,                -- quantity immediately before this movement (Phase 7)
    new_quantity      INTEGER,                -- quantity immediately after this movement (Phase 7)
    staff_id         INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- nullable + SET NULL (Phase 3 / migration 019): movement history survives account deletion
    log_date         DATE NOT NULL,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_invlog_inventory ON inventory_logs(inventory_id);
CREATE INDEX idx_invlog_consultation ON inventory_logs(consultation_id);

-- QR/barcode scan history for restocking workflow
CREATE TABLE scan_history (
    scan_id      SERIAL PRIMARY KEY,
    scanned_by   INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    item_name    VARCHAR(150),
    category     VARCHAR(20),
    quantity     INTEGER,
    result       VARCHAR(20) NOT NULL CHECK (result IN ('Saved','Invalid','Duplicate','BatchView')),  -- BatchView: Phase 9, a batch's own QR was scanned and its details opened (a pure lookup, not a stock-in outcome)
    raw_data     TEXT,                        -- raw scanned payload
    scanned_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Medications dispensed during a consultation, linked to inventory for stock deduction

CREATE TABLE consultation_medications (
    consultation_medication_id SERIAL PRIMARY KEY,
    consultation_id INTEGER NOT NULL REFERENCES consultations(consultation_id) ON DELETE CASCADE,
    inventory_id    INTEGER REFERENCES inventory(inventory_id) ON DELETE SET NULL,  -- SET NULL, not the implicit default: same bug class as inventory_logs (Phase 7), found during the Phase 12 review — item_name is already a denormalized snapshot, so nothing is lost
    item_name       VARCHAR(150) NOT NULL,   -- denormalized snapshot at time of dispensing
    quantity        INTEGER NOT NULL,
    dosage_instructions VARCHAR(255)
);

-- ─────────────────────────────────────────────────────────────────────────
-- 5. APPOINTMENTS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE appointments (
    appointment_id SERIAL PRIMARY KEY,
    patient_id     INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- nullable + SET NULL (Phase 3 / migration 019)
    appt_type      VARCHAR(100) NOT NULL,     -- General Consultation, Follow-up, ...
    appt_date      DATE NOT NULL,
    appt_time      TIME NOT NULL,
    status         VARCHAR(20) NOT NULL DEFAULT 'Pending'
                    CHECK (status IN ('Pending','Scheduled','Confirmed','Completed','Cancelled')),
    attended_by    INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    notes          TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_appt_patient ON appointments(patient_id);
CREATE INDEX idx_appt_date    ON appointments(appt_date);

-- ─────────────────────────────────────────────────────────────────────────
-- 6. NOTIFICATIONS  (in-app; targets either a specific user or a whole role)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id         INTEGER REFERENCES users(user_id) ON DELETE CASCADE,   -- NULL = broadcast to target_role; CASCADE not SET NULL (Phase 3 / migration 019) — a nulled user_id here would be indistinguishable from a real broadcast
    target_role     VARCHAR(10) CHECK (target_role IN ('admin','staff','patient')),
    message         TEXT NOT NULL,
    type            VARCHAR(10) NOT NULL DEFAULT 'info'
                     CHECK (type IN ('info','success','warning','danger')),
    module          VARCHAR(30),              -- full app route, e.g. /document-requests
    is_read         BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_id IS NOT NULL OR target_role IS NOT NULL)
);
CREATE INDEX idx_notif_user ON notifications(user_id);
CREATE INDEX idx_notif_role_unread ON notifications(target_role, is_read);

-- ─────────────────────────────────────────────────────────────────────────
-- 7. EMERGENCY ALERTS (SOS) + SMS NOTIFICATIONS TO GUARDIANS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE emergency_alerts (
    emergency_alert_id SERIAL PRIMARY KEY,
    reported_by         INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- who submitted the SOS; nullable + SET NULL (Phase 3 / migration 019): a safety-incident record survives account deletion
    subject_id           INTEGER REFERENCES users(user_id) ON DELETE SET NULL,           -- who the emergency is about
    subject_student_num  VARCHAR(20),      -- denormalized snapshot (works even if not yet a user)
    subject_name          VARCHAR(150),
    emergency_type        VARCHAR(10) NOT NULL CHECK (emergency_type IN ('myself','another')),
    location               VARCHAR(255) NOT NULL,
    description             TEXT NOT NULL,
    status                  VARCHAR(15) NOT NULL DEFAULT 'Active'
                             CHECK (status IN ('Active','Acknowledged','Resolved')),
    acknowledged_by         INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    sms_sent                BOOLEAN NOT NULL DEFAULT FALSE,
    resolved_at             TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_emerg_status ON emergency_alerts(status);

CREATE TABLE sms_log (
    sms_log_id         SERIAL PRIMARY KEY,
    emergency_alert_id  INTEGER REFERENCES emergency_alerts(emergency_alert_id),
    student_name         VARCHAR(150) NOT NULL,
    student_number       VARCHAR(20) NOT NULL,
    parent_name           VARCHAR(150),
    parent_phone          VARCHAR(20) NOT NULL,
    relation               VARCHAR(30),
    situation               VARCHAR(150),
    message                 TEXT NOT NULL,
    sent_by                 INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
    sent_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_smslog_alert ON sms_log(emergency_alert_id);

-- ─────────────────────────────────────────────────────────────────────────
-- 8. AUDIT LOGS  (system-wide action trail)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE audit_logs (
    audit_log_id SERIAL PRIMARY KEY,
    user_id      INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- the audit trail itself must never lose entries or block a delete (Phase 3 / migration 019)
    action       VARCHAR(50) NOT NULL,       -- LOGIN, APPROVE_DOC, ADD_USER, ...
    details      TEXT,
    ip_address   VARCHAR(45),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);

-- ─────────────────────────────────────────────────────────────────────────
-- 9. SYSTEM CONFIGURATION  (single-row email/SMTP settings, admin-managed)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE email_config (
    email_config_id     SERIAL PRIMARY KEY,
    smtp_host            VARCHAR(150) NOT NULL,
    smtp_port             INTEGER NOT NULL,
    smtp_user              VARCHAR(150) NOT NULL,
    from_name               VARCHAR(150) NOT NULL,
    enable_notifications     BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);


-- ─────────────────────────────────────────────────────────────────────────
-- 10. CHATBOT CONVERSATIONS  (persistent MediBot history, one row per message)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE chat_conversations (
    conversation_id SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'staff', 'patient')),
    title           VARCHAR(150),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);

CREATE TABLE chat_messages (
    message_id      SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    sender_type     VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'bot')),
    message         TEXT NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);


-- ─────────────────────────────────────────────────────────────────────────
-- 11. MEDICINE NORMALIZATION  (Medicine only — Supply/Equipment stay on the
--     `inventory`/`inventory_batches` tables above; see migration 007 for
--     the full reasoning). Purely additive alongside the existing
--     inventory tables — the interface still reads/writes those for now.
--     `inventory_logs` doubles as the "Inventory Movement" table from the
--     Medicine → Batch → Movement relationship — extended with nullable
--     medicine_id/medicine_batch_id columns rather than duplicating a
--     second movement-log table with the same purpose.
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
    supplier_id     SERIAL PRIMARY KEY,
    supplier_name   VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(150),
    phone           VARCHAR(20),
    email           VARCHAR(150),
    address         VARCHAR(255),
    remarks         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX idx_suppliers_name ON suppliers(supplier_name);

CREATE TABLE medicines (
    medicine_id          SERIAL PRIMARY KEY,
    medicine_name        VARCHAR(150) NOT NULL,
    generic_name         VARCHAR(150),
    brand_name           VARCHAR(150),
    dosage               VARCHAR(50),   -- e.g. "500mg", "10ml"
    strength             VARCHAR(50),   -- e.g. "500mg/tablet"
    form                 VARCHAR(50),   -- Tablet, Capsule, Syrup, Injection, Ointment, ...
    category             VARCHAR(50),   -- pharmacological class, e.g. Analgesic, Antibiotic — open text, not a fixed list
    storage_requirement  VARCHAR(150),  -- e.g. "Store below 25°C", "Refrigerate"
    description          TEXT,
    image_url            TEXT,          -- consistent with users.profile_img_url's TEXT-column pattern
    unit                 VARCHAR(30) NOT NULL DEFAULT 'Units',  -- Tablets, Bottles, Units, ... (added migration 008 — a Phase 3 blocker, not in the original Phase 2 spec)
    min_stock            INTEGER NOT NULL DEFAULT 0,             -- reorder threshold (added migration 008, same reason)
    active               BOOLEAN NOT NULL DEFAULT TRUE,  -- soft-deactivation, same pattern as users.is_active
    legacy_inventory_id  INTEGER,       -- migration bridge only (maps back to inventory.inventory_id); not a business field
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ
);
CREATE INDEX idx_medicines_name ON medicines(medicine_name);
CREATE INDEX idx_medicines_active ON medicines(active);
CREATE INDEX idx_medicines_legacy ON medicines(legacy_inventory_id);

CREATE TABLE medicine_batches (
    medicine_batch_id   SERIAL PRIMARY KEY,
    medicine_id         INTEGER NOT NULL REFERENCES medicines(medicine_id) ON DELETE CASCADE,
    batch_number        VARCHAR(50) NOT NULL,   -- internal/clinic batch tracking number
    lot_number          VARCHAR(50),            -- manufacturer's lot number (distinct from batch_number)
    supplier_id         INTEGER REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
    received_date       DATE,
    expiration_date     DATE,
    quantity            INTEGER NOT NULL DEFAULT 0,
    unit_cost           NUMERIC(10,2),          -- per-unit cost at time of purchase
    purchase_reference  VARCHAR(100),           -- PO number / invoice reference
    status              VARCHAR(20) NOT NULL DEFAULT 'Active'
                         CHECK (status IN ('Active', 'Depleted', 'Expired', 'Recalled', 'On Hold', 'Archived', 'Damaged')),
    legacy_batch_id     INTEGER,                -- migration bridge only (maps back to inventory_batches.batch_id)
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ
);
CREATE INDEX idx_medbatch_medicine ON medicine_batches(medicine_id);
CREATE INDEX idx_medbatch_supplier ON medicine_batches(supplier_id);
CREATE INDEX idx_medbatch_expiration ON medicine_batches(expiration_date);
CREATE INDEX idx_medbatch_batch_number ON medicine_batches(batch_number);
CREATE INDEX idx_medbatch_legacy ON medicine_batches(legacy_batch_id);

-- Live, computed aggregate — never stored/cached, always recomputed from
-- medicine_batches directly (this is what "no duplicated values" means in
-- practice: there is no second copy of quantity/expiry to drift out of
-- sync, unlike the old inventory.quantity cache it replaces for Medicine).
CREATE OR REPLACE VIEW medicine_inventory_view AS
SELECT
    m.medicine_id,
    m.medicine_name AS name,
    'Medicine'::VARCHAR(20) AS category,
    COALESCE((
        SELECT SUM(mb.quantity) FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id AND mb.status = 'Active'
    ), 0) AS quantity,
    m.unit,
    m.min_stock,
    (
        SELECT MIN(mb.expiration_date) FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id AND mb.status = 'Active' AND mb.expiration_date IS NOT NULL
    ) AS expiration_date,
    (
        SELECT mb.received_date FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS received_date,
    (
        SELECT mb.batch_number FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS batch_no,
    (
        SELECT mb.purchase_reference FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS purchase_reference,
    (
        SELECT s.supplier_name FROM medicine_batches mb
        LEFT JOIN suppliers s ON s.supplier_id = mb.supplier_id
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS supplier,
    (SELECT COUNT(*) FROM medicine_batches mb WHERE mb.medicine_id = m.medicine_id) AS batch_count,
    -- Phase 8: most recent batch's status, so the aggregate item-level
    -- status logic can tell "ran out normally" apart from "everything
    -- was archived/damaged" — real batch-availability data.
    (
        SELECT mb.status FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS latest_batch_status,
    TRUE AS is_fifo,
    FALSE AS needs_maintenance,
    m.generic_name, m.brand_name, m.dosage, m.strength, m.form,
    m.storage_requirement, m.description, m.image_url,
    m.active, m.created_at, m.updated_at
FROM medicines m
WHERE m.active = TRUE;
GRANT SELECT ON medicine_inventory_view TO authenticated;

-- Immutable "what was received" event, deliberately separate from
-- medicine_batches (whose quantity is mutable — it decreases as stock is
-- released). One receiving record always creates exactly one batch; see
-- migration 011 for the full reasoning.
CREATE TABLE receiving_records (
    receiving_record_id  SERIAL PRIMARY KEY,
    medicine_id           INTEGER NOT NULL REFERENCES medicines(medicine_id) ON DELETE CASCADE,
    medicine_batch_id      INTEGER NOT NULL REFERENCES medicine_batches(medicine_batch_id) ON DELETE CASCADE,
    supplier_id             INTEGER REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
    invoice_number            VARCHAR(100),
    purchase_reference          VARCHAR(100),
    quantity                     INTEGER NOT NULL CHECK (quantity > 0),
    received_date                 DATE NOT NULL,
    received_by                    INTEGER REFERENCES users(user_id) ON DELETE SET NULL,  -- nullable + SET NULL (Phase 3 / migration 019)
    remarks                          TEXT,
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                         TIMESTAMPTZ
);
CREATE INDEX idx_receiving_medicine ON receiving_records(medicine_id);
CREATE INDEX idx_receiving_batch ON receiving_records(medicine_batch_id);
CREATE INDEX idx_receiving_supplier ON receiving_records(supplier_id);
CREATE INDEX idx_receiving_received_by ON receiving_records(received_by);
CREATE INDEX idx_receiving_date ON receiving_records(received_date);

-- Dedicated inventory notification table (Notification System, Phase 2)
-- — not a duplicate of the general `notifications` table, which has no
-- medicine_id/batch_id FK and so can't support opening a specific
-- record from a notification or filtering by category. No inventory
-- data is duplicated: only FK references plus human-readable text.
CREATE TABLE inventory_notifications (
    id                 SERIAL PRIMARY KEY,
    notification_type  VARCHAR(30) NOT NULL CHECK (notification_type IN (
                          'low_stock', 'critical_stock', 'out_of_stock',
                          'expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired',
                          'received', 'released', 'damaged', 'adjustment', 'archived'
                        )),
    medicine_id        INTEGER REFERENCES medicines(medicine_id) ON DELETE SET NULL,
    batch_id           INTEGER REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL,
    title              VARCHAR(150) NOT NULL,
    message            TEXT NOT NULL,
    priority           VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    is_read            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         INTEGER REFERENCES users(user_id) ON DELETE SET NULL  -- nullable: NULL = system-generated (or the creator's account was later deleted, Phase 3 / migration 019)
);
CREATE INDEX idx_invnotif_medicine ON inventory_notifications(medicine_id);
CREATE INDEX idx_invnotif_batch ON inventory_notifications(batch_id);
CREATE INDEX idx_invnotif_type ON inventory_notifications(notification_type);
CREATE INDEX idx_invnotif_unread ON inventory_notifications(is_read);
CREATE INDEX idx_invnotif_created_at ON inventory_notifications(created_at);
CREATE INDEX idx_invnotif_dedup ON inventory_notifications(medicine_id, notification_type, is_read);

-- inventory_logs — reused as the "Inventory Movement" table. Gains the
-- ability to log against the new structure without a second, duplicate
-- movement table; the CHECK constraint guarantees every row still logs
-- against SOMETHING (either the old generic item or the new medicine).
ALTER TABLE inventory_logs ALTER COLUMN inventory_id DROP NOT NULL;
ALTER TABLE inventory_logs ADD COLUMN medicine_id INTEGER REFERENCES medicines(medicine_id) ON DELETE SET NULL;
ALTER TABLE inventory_logs ADD COLUMN medicine_batch_id INTEGER REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL;
ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_has_subject
  CHECK (inventory_id IS NOT NULL OR medicine_id IS NOT NULL);
CREATE INDEX idx_invlog_staff ON inventory_logs(staff_id);
CREATE INDEX idx_invlog_medicine ON inventory_logs(medicine_id);
CREATE INDEX idx_invlog_medbatch ON inventory_logs(medicine_batch_id);
CREATE INDEX idx_invlog_created_at ON inventory_logs(created_at);

-- consultation_medications — medicine dispensing can (later) point at the
-- normalized tables instead of/alongside the generic inventory row.
ALTER TABLE consultation_medications ADD COLUMN medicine_id INTEGER REFERENCES medicines(medicine_id);
ALTER TABLE consultation_medications ADD COLUMN medicine_batch_id INTEGER REFERENCES medicine_batches(medicine_batch_id);
CREATE INDEX idx_consmed_medicine ON consultation_medications(medicine_id);
CREATE INDEX idx_consmed_inventory ON consultation_medications(inventory_id);
CREATE INDEX idx_consmed_medbatch ON consultation_medications(medicine_batch_id);

-- scan_history — flagged in the Phase 1 analysis as having NO foreign key
-- at all; fixed here alongside the same category of change.
ALTER TABLE scan_history ADD COLUMN inventory_id INTEGER REFERENCES inventory(inventory_id) ON DELETE SET NULL;
ALTER TABLE scan_history ADD COLUMN medicine_id INTEGER REFERENCES medicines(medicine_id) ON DELETE SET NULL;
ALTER TABLE scan_history ADD COLUMN medicine_batch_id INTEGER REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL;
CREATE INDEX idx_scanhist_medicine_batch ON scan_history(medicine_batch_id);
CREATE INDEX idx_scanhist_scanned_by ON scan_history(scanned_by);
CREATE INDEX idx_scanhist_inventory ON scan_history(inventory_id);
CREATE INDEX idx_scanhist_medicine ON scan_history(medicine_id);


-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ═══════════════════════════════════════════════════════════════════════════
-- Helper functions run as SECURITY DEFINER so policies that need to know
-- "who is the caller" or "what's their role" don't trigger infinite
-- recursion when a policy on `users` needs to query `users` itself.

CREATE OR REPLACE FUNCTION current_app_user_id() RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT user_id FROM users WHERE auth_user_id = auth.uid();
$$;

CREATE OR REPLACE FUNCTION current_app_role() RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM users WHERE auth_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION current_app_user_id() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION current_app_role() TO authenticated, anon;

-- Narrow, anonymous-callable lookup for QR/barcode login (Phase J) — returns
-- ONLY a matching account's email, never a session or any other field, so
-- the login page can pre-fill it; the person still enters their real
-- password. See migration 002 for the full rationale.
CREATE OR REPLACE FUNCTION lookup_email_by_school_id(code TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.email
  FROM users u
  LEFT JOIN patient_profiles pp ON pp.user_id = u.user_id
  WHERE u.is_active = true
    AND (
      upper(u.school_id_barcode) = upper(code)
      OR upper(u.username) = upper(code)
      OR upper(pp.student_number) = upper(code)
    )
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION lookup_email_by_school_id(TEXT) TO anon, authenticated;

-- Narrow, anonymous-callable patient search for the pre-login Emergency
-- SOS form only — returns ONLY name + student_number, never full
-- profiles. See migration 004 for the full reasoning and the flagged
-- information-exposure tradeoff.
CREATE OR REPLACE FUNCTION search_patients_public(query TEXT)
RETURNS TABLE(user_id INTEGER, name TEXT, student_number TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.user_id, u.name, pp.student_number
  FROM users u
  JOIN patient_profiles pp ON pp.user_id = u.user_id
  WHERE u.role = 'patient' AND u.is_active = true
    AND (u.name ILIKE '%' || query || '%' OR pp.student_number ILIKE '%' || query || '%')
  ORDER BY u.name
  LIMIT 8;
$$;
GRANT EXECUTE ON FUNCTION search_patients_public(TEXT) TO anon, authenticated;

-- Narrow SECURITY DEFINER bypass for notifyIfNew()'s dedup check — the
-- caller's own RLS visibility into `notifications` can't see rows
-- addressed to a different role/user, which would otherwise make
-- cross-role dedup checks silently useless. Exposes only a boolean.
CREATE OR REPLACE FUNCTION notification_exists(p_message TEXT, p_user_id INTEGER, p_target_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM notifications
    WHERE message = p_message
      AND ((p_user_id IS NOT NULL AND user_id = p_user_id) OR (p_target_role IS NOT NULL AND target_role = p_target_role))
    LIMIT 1
  );
$$;
GRANT EXECUTE ON FUNCTION notification_exists(TEXT, INTEGER, TEXT) TO anon, authenticated;

-- Phase 10 — dashboard aggregations, computed server-side rather than
-- pulling raw inventory_logs client-side (that table grows unbounded).
-- SECURITY INVOKER (the default) — runs under the calling staff/admin
-- user's own RLS, no elevated privileges.
CREATE OR REPLACE FUNCTION get_monthly_inventory_movement(months_back INTEGER DEFAULT 6)
RETURNS TABLE(month DATE, received_qty BIGINT, released_qty BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('month', created_at)::date AS month,
    COALESCE(SUM(quantity_change) FILTER (WHERE action_type IN ('Received', 'Replenish') AND quantity_change > 0), 0) AS received_qty,
    COALESCE(SUM(ABS(quantity_change)) FILTER (WHERE action_type IN ('Released', 'Release')), 0) AS released_qty
  FROM inventory_logs
  WHERE created_at >= date_trunc('month', now()) - (months_back - 1) * INTERVAL '1 month'
  GROUP BY date_trunc('month', created_at)
  ORDER BY month;
$$;
GRANT EXECUTE ON FUNCTION get_monthly_inventory_movement(INTEGER) TO authenticated;

CREATE OR REPLACE FUNCTION get_top_used_medicines(days_back INTEGER DEFAULT 30, result_limit INTEGER DEFAULT 5)
RETURNS TABLE(medicine_id INTEGER, medicine_name VARCHAR, total_released BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.medicine_id,
    m.medicine_name,
    SUM(ABS(l.quantity_change)) AS total_released
  FROM inventory_logs l
  JOIN medicines m ON m.medicine_id = l.medicine_id
  WHERE l.action_type IN ('Released', 'Release')
    AND l.medicine_id IS NOT NULL
    AND l.created_at >= now() - (days_back || ' days')::INTERVAL
  GROUP BY m.medicine_id, m.medicine_name
  ORDER BY total_released DESC
  LIMIT result_limit;
$$;
GRANT EXECUTE ON FUNCTION get_top_used_medicines(INTEGER, INTEGER) TO authenticated;

-- Notification System Phase 8 — the entire expiration-check algorithm
-- (tiering, dedup, auto-clear, status sync) as a single PL/pgSQL
-- function, the sole source of truth callable both from the client (via
-- RPC, on Inventory page load) and from pg_cron (daily, so it stays
-- correct even on days nobody opens the page). See migration 018 for
-- the full reasoning.
CREATE OR REPLACE FUNCTION run_expiration_check() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch RECORD;
  active_type TEXT;
  days_left INT;
BEGIN
  UPDATE medicine_batches
  SET status = 'Expired'
  WHERE status = 'Active' AND expiration_date IS NOT NULL AND expiration_date < CURRENT_DATE;

  FOR batch IN
    SELECT mb.medicine_batch_id, mb.medicine_id, mb.expiration_date, mb.batch_number, m.medicine_name
    FROM medicine_batches mb
    JOIN medicines m ON m.medicine_id = mb.medicine_id
    WHERE mb.expiration_date IS NOT NULL AND mb.status IN ('Active', 'Expired')
  LOOP
    days_left := batch.expiration_date - CURRENT_DATE;
    active_type := CASE
      WHEN days_left < 0 THEN 'expired'
      WHEN days_left <= 7 THEN 'expiring_7'
      WHEN days_left <= 30 THEN 'expiring_30'
      WHEN days_left <= 60 THEN 'expiring_60'
      WHEN days_left <= 90 THEN 'expiring_90'
      ELSE NULL
    END;

    DELETE FROM inventory_notifications
    WHERE batch_id = batch.medicine_batch_id
      AND notification_type IN ('expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired')
      AND is_read = false
      AND (active_type IS NULL OR notification_type <> active_type);

    IF active_type IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM inventory_notifications
      WHERE batch_id = batch.medicine_batch_id AND notification_type = active_type AND is_read = false
    ) THEN
      INSERT INTO inventory_notifications (notification_type, medicine_id, batch_id, title, message, priority)
      VALUES (
        active_type,
        batch.medicine_id,
        batch.medicine_batch_id,
        CASE active_type
          WHEN 'expired' THEN 'Expired: ' || batch.medicine_name
          WHEN 'expiring_7' THEN 'Expiring in 7 Days: ' || batch.medicine_name
          WHEN 'expiring_30' THEN 'Expiring in 30 Days: ' || batch.medicine_name
          WHEN 'expiring_60' THEN 'Expiring in 60 Days: ' || batch.medicine_name
          WHEN 'expiring_90' THEN 'Expiring in 90 Days: ' || batch.medicine_name
        END,
        CASE active_type
          WHEN 'expired' THEN 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expired on ' || batch.expiration_date || ' and can no longer be released.'
          WHEN 'expiring_7' THEN 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expires on ' || batch.expiration_date || ' (within 7 days) — urgent.'
          WHEN 'expiring_30' THEN 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expires on ' || batch.expiration_date || ' (within 30 days) — plan to use or reorder.'
          ELSE 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expires on ' || batch.expiration_date || '.'
        END,
        CASE active_type
          WHEN 'expired' THEN 'critical'
          WHEN 'expiring_7' THEN 'critical'
          WHEN 'expiring_30' THEN 'high'
          WHEN 'expiring_60' THEN 'medium'
          ELSE 'low'
        END
      );
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION run_expiration_check() TO authenticated;

-- Optional daily schedule — wrapped in exception handling so a project
-- without pg_cron available doesn't fail the whole schema on install.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('inventory-expiration-check', '0 6 * * *', 'SELECT run_expiration_check();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped (extension unavailable on this project): %', SQLERRM;
END;
$$;


-- ---------------------------------------------------------------- users ----
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR email = auth.email()
    OR current_app_role() IN ('admin', 'staff')
  );

CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR email = auth.email() OR current_app_role() = 'admin')
  WITH CHECK (auth_user_id = auth.uid() OR email = auth.email() OR current_app_role() = 'admin');

CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (
    current_app_role() = 'admin'
    OR (auth_user_id = auth.uid() AND role = 'patient')  -- self-registration (Phase K)
  );

CREATE POLICY users_delete ON users FOR DELETE TO authenticated
  USING (current_app_role() = 'admin');

-- Narrow self-cleanup: a user may delete ONLY their own row, and ONLY if
-- it has no linked patient_profiles/staff_profiles row yet — used when
-- self-registration's second insert (patient_profiles) fails partway
-- through, so a half-registered account doesn't dangle forever and block
-- that email/username from ever registering again. A complete, real
-- account can never be removed this way. Additive alongside users_delete
-- above (Postgres OR's multiple permissive policies together).
CREATE POLICY users_delete_own_incomplete ON users FOR DELETE TO authenticated
  USING (
    auth_user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM patient_profiles pp WHERE pp.user_id = users.user_id)
    AND NOT EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.user_id = users.user_id)
  );


-- ------------------------------------------------------ staff_profiles -----
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_profiles_select ON staff_profiles FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY staff_profiles_write ON staff_profiles FOR ALL TO authenticated
  USING (current_app_role() = 'admin' OR user_id = current_app_user_id())
  WITH CHECK (current_app_role() = 'admin' OR user_id = current_app_user_id());


-- ---------------------------------------------------- staff_permissions ----
ALTER TABLE staff_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_permissions_select ON staff_permissions FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY staff_permissions_write ON staff_permissions FOR ALL TO authenticated
  USING (current_app_role() = 'admin')
  WITH CHECK (current_app_role() = 'admin');


-- ----------------------------------------------------- patient_profiles ----
ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY patient_profiles_select ON patient_profiles FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY patient_profiles_write ON patient_profiles FOR ALL TO authenticated
  USING (current_app_role() = 'admin' OR user_id = current_app_user_id())
  WITH CHECK (current_app_role() = 'admin' OR user_id = current_app_user_id());


-- -------------------------------------------------- document_requests -----
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_requests_select ON document_requests FOR SELECT TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY document_requests_insert ON document_requests FOR INSERT TO authenticated
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY document_requests_update ON document_requests FOR UPDATE TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'))
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY document_requests_delete ON document_requests FOR DELETE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------- consultations ----
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultations_select ON consultations FOR SELECT TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY consultations_write ON consultations FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
CREATE POLICY diagnoses_all ON diagnoses FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------ consultation_medications -
ALTER TABLE consultation_medications ENABLE ROW LEVEL SECURITY;

CREATE POLICY consultation_medications_select ON consultation_medications FOR SELECT TO authenticated
  USING (
    current_app_role() IN ('admin', 'staff')
    OR EXISTS (
      SELECT 1 FROM consultations c
      WHERE c.consultation_id = consultation_medications.consultation_id
        AND c.patient_id = current_app_user_id()
    )
  );

CREATE POLICY consultation_medications_write ON consultation_medications FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------------- inventory --
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_all ON inventory FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- -------------------------------------------------------- inventory_batches
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_batches_all ON inventory_batches FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ---------------------------------------------------------- inventory_logs
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY inventory_logs_all ON inventory_logs FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ----------------------------------------------------------- scan_history --
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY scan_history_all ON scan_history FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------------ appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY appointments_select ON appointments FOR SELECT TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY appointments_insert ON appointments FOR INSERT TO authenticated
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY appointments_update ON appointments FOR UPDATE TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'))
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

CREATE POLICY appointments_delete ON appointments FOR DELETE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------- emergency_alerts --
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY emergency_alerts_select ON emergency_alerts FOR SELECT TO authenticated
  USING (
    subject_id = current_app_user_id()
    OR reported_by = current_app_user_id()
    OR current_app_role() IN ('admin', 'staff')
  );

-- Anonymous submission allowed (pre-login SOS button, matching the
-- original) — a deliberate tradeoff, see the migration 004 comments.
CREATE POLICY emergency_alerts_insert ON emergency_alerts FOR INSERT TO anon, authenticated
  WITH CHECK (reported_by = current_app_user_id() OR current_app_user_id() IS NULL);

CREATE POLICY emergency_alerts_update ON emergency_alerts FOR UPDATE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

-- Real-time emergency alerting — staff/admin clients subscribe directly to
-- INSERT events on this table (Postgres Changes) rather than polling. RLS
-- (emergency_alerts_select above) already scopes what each client can see,
-- so no separate realtime-specific policy is needed.
ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;


-- ----------------------------------------------------------------- sms_log
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY sms_log_all ON sms_log FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- -------------------------------------------------------------- audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));

CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO anon, authenticated
  WITH CHECK (
    current_app_role() IN ('admin', 'staff')
    OR user_id = current_app_user_id()
    OR (current_app_user_id() IS NULL AND user_id IS NULL)
  );


-- ------------------------------------------------------------ notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR target_role = current_app_role());

CREATE POLICY notifications_insert ON notifications FOR INSERT TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (user_id = current_app_user_id() OR target_role = current_app_role())
  WITH CHECK (user_id = current_app_user_id() OR target_role = current_app_role());


-- ------------------------------------------------- medicine normalization
ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_all ON suppliers FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY medicines_all ON medicines FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

ALTER TABLE medicine_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY medicine_batches_all ON medicine_batches FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

ALTER TABLE receiving_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY receiving_records_all ON receiving_records FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

ALTER TABLE inventory_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_notifications_all ON inventory_notifications FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------------ email_config
ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY email_config_all ON email_config FOR ALL TO authenticated
  USING (current_app_role() = 'admin')
  WITH CHECK (current_app_role() = 'admin');


-- --------------------------------------------------------- chat_conversations
-- Deliberately NOT following the "staff/admin can see everything" pattern
-- used elsewhere — chatbot conversations are personal (MediBot offers
-- emotional support). Every role, including admin, can only see their own.
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_conversations_select ON chat_conversations FOR SELECT TO authenticated
  USING (user_id = current_app_user_id());

CREATE POLICY chat_conversations_insert ON chat_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY chat_conversations_update ON chat_conversations FOR UPDATE TO authenticated
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY chat_conversations_delete ON chat_conversations FOR DELETE TO authenticated
  USING (user_id = current_app_user_id());


-- -------------------------------------------------------------- chat_messages
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_messages_select ON chat_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.conversation_id = chat_messages.conversation_id AND c.user_id = current_app_user_id()));

CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.conversation_id = chat_messages.conversation_id AND c.user_id = current_app_user_id()));

CREATE POLICY chat_messages_delete ON chat_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM chat_conversations c WHERE c.conversation_id = chat_messages.conversation_id AND c.user_id = current_app_user_id()));

-- Seed the single email_config row so the Maintenance "Email Configuration"
-- tab has something to load/edit on a fresh install (see Phase G).
INSERT INTO email_config (smtp_host, smtp_port, smtp_user, from_name, enable_notifications)
VALUES ('smtp.example.edu', 587, 'clinic@example.edu', 'University Clinic', true);

-- Seed the diagnosis reference list (Phase 8) — the same 67 entries that
-- previously only ever existed as static client-side data
-- (diagnosisData.js), generated programmatically from that source file
-- to guarantee exact fidelity, not hand-retyped.
INSERT INTO diagnoses (name, category) VALUES
  ('Abrasion (SRI)', 'Wounds & Injuries'),
  ('Blister', 'Wounds & Injuries'),
  ('Burn (Minor)', 'Wounds & Injuries'),
  ('Concussion', 'Wounds & Injuries'),
  ('Eye Trauma', 'Wounds & Injuries'),
  ('Fracture', 'Wounds & Injuries'),
  ('Head Trauma', 'Wounds & Injuries'),
  ('Incised Wound', 'Wounds & Injuries'),
  ('Infected Wound', 'Wounds & Injuries'),
  ('Lacerated Wound', 'Wounds & Injuries'),
  ('Punctured Wound', 'Wounds & Injuries'),
  ('Sprain (SRI)', 'Wounds & Injuries'),
  ('Strain', 'Wounds & Injuries'),
  ('Vascular Trauma', 'Wounds & Injuries'),
  ('Animal Bite/Scratch', 'Wounds & Injuries'),
  ('Insect Bite/Sting', 'Wounds & Injuries'),
  ('Bronchial Asthma', 'Respiratory'),
  ('Influenza', 'Respiratory'),
  ('Systemic Viral Infection (SVI) / Influenza', 'Respiratory'),
  ('Upper Respiratory Tract Infection (URTI)', 'Respiratory'),
  ('Hyperventilation', 'Respiratory'),
  ('Sinus Headache', 'Respiratory'),
  ('Acute Gastroenteritis', 'Gastrointestinal'),
  ('Cholelithiasis', 'Gastrointestinal'),
  ('Dyspepsia/Indigestion', 'Gastrointestinal'),
  ('Food Allergies', 'Gastrointestinal'),
  ('Gastroesophageal Reflux Disease (GERD)', 'Gastrointestinal'),
  ('Gastritis', 'Gastrointestinal'),
  ('Hyperacidity', 'Gastrointestinal'),
  ('Irritable Bowel Syndrome (IBS)', 'Gastrointestinal'),
  ('Lactose Intolerance', 'Gastrointestinal'),
  ('Stomachache', 'Gastrointestinal'),
  ('Anxiety Attack', 'Neurological'),
  ('Dizziness', 'Neurological'),
  ('Epilepsy', 'Neurological'),
  ('Fatigue', 'Neurological'),
  ('Headache', 'Neurological'),
  ('Migraine Headache', 'Neurological'),
  ('Syncope', 'Neurological'),
  ('Tension Headache', 'Neurological'),
  ('Vertigo', 'Neurological'),
  ('Heart Problem', 'Cardiovascular'),
  ('Hypertension', 'Cardiovascular'),
  ('Hypoglycemia', 'Cardiovascular'),
  ('Hypotension', 'Cardiovascular'),
  ('Arthritis', 'Musculoskeletal'),
  ('Muscle Spasm', 'Musculoskeletal'),
  ('Myalgia', 'Musculoskeletal'),
  ('Allergic Rhinitis', 'Skin & ENT'),
  ('Boil', 'Skin & ENT'),
  ('Conjunctivitis', 'Skin & ENT'),
  ('Ear Infection', 'Skin & ENT'),
  ('Eye Irritation', 'Skin & ENT'),
  ('Skin Allergy', 'Skin & ENT'),
  ('Skin Disease', 'Skin & ENT'),
  ('Stye', 'Skin & ENT'),
  ('Tooth Decay', 'Dental'),
  ('Tooth Filling', 'Dental'),
  ('Tooth Trauma', 'Dental'),
  ('Tooth Extraction', 'Dental'),
  ('Wisdom Tooth', 'Dental'),
  ('Dysmenorrhea', 'Reproductive'),
  ('Pregnant', 'Reproductive'),
  ('Derogation', 'Other'),
  ('Emergency Cases', 'Other'),
  ('Urinary Tract Infection', 'Other'),
  ('Others', 'Other')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- End of consolidated schema.
-- ═══════════════════════════════════════════════════════════════════════════
