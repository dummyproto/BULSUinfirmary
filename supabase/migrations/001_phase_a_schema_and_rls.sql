-- ============================================================================
-- PHASE A MIGRATION — Clinic Services System
-- ============================================================================
-- Purpose: close every schema-vs-UI gap documented in KNOWN_ISSUES.md, and
-- add Row Level Security to every table. This is written as an ADDITIVE
-- migration on top of the existing clinic_schema.sql — it does not drop or
-- replace anything, only widens constraints and adds new columns/tables.
--
-- Run this once in the Supabase SQL Editor (or via `supabase db push` if
-- you use the CLI with this file under supabase/migrations/).
--
-- Safe to re-run: every statement uses IF EXISTS / IF NOT EXISTS / OR REPLACE
-- so re-running this file after a partial failure won't error out.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1. document_requests — allow the 'Claimed' status
-- ----------------------------------------------------------------------------
ALTER TABLE document_requests DROP CONSTRAINT IF EXISTS document_requests_status_check;
ALTER TABLE document_requests ADD CONSTRAINT document_requests_status_check
  CHECK (status IN ('Pending', 'Processing', 'Approved', 'Declined', 'Claimed'));


-- ----------------------------------------------------------------------------
-- 2. consultations — add diagnosis + follow_up_notes, allow 'Emergency' visits
-- ----------------------------------------------------------------------------
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS diagnosis VARCHAR(150);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS follow_up_notes TEXT;

ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_visit_type_check;
ALTER TABLE consultations ADD CONSTRAINT consultations_visit_type_check
  CHECK (visit_type IN ('Walk-in', 'Appointment', 'Emergency'));

-- One-time backfill: pull any previously-encoded "[DX: ...] assessment"
-- rows (written by the pre-migration consultationsService.js workaround)
-- into the new real diagnosis column, then strip the marker out of
-- assessment. Safe to run even if there's nothing to backfill.
UPDATE consultations
SET
  diagnosis = trim(substring(assessment FROM '^\[DX:\s*([^\]]*)\]')),
  assessment = trim(regexp_replace(assessment, '^\[DX:\s*[^\]]*\]\s*', ''))
WHERE assessment ~ '^\[DX:\s*[^\]]*\]' AND diagnosis IS NULL;


-- ----------------------------------------------------------------------------
-- 3. inventory_logs — real action types + a real link back to consultations
-- ----------------------------------------------------------------------------
ALTER TABLE inventory_logs DROP CONSTRAINT IF EXISTS inventory_logs_action_type_check;
ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_action_type_check
  CHECK (action_type IN (
    'Replenish', 'Release', 'Adjustment',
    'Edit', 'Merge', 'Remove Expired', 'Removed', 'Maintained', 'Maintenance Hold'
  ));

ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS consultation_id INTEGER
  REFERENCES consultations(consultation_id) ON DELETE SET NULL;

-- One-time backfill: pull any previously-encoded "[CONSULTATION:<id>]"
-- marker (written by the pre-migration inventoryService.js workaround) out
-- of `notes` into the new real column.
UPDATE inventory_logs
SET
  consultation_id = (regexp_match(notes, '\[CONSULTATION:(\d+)\]'))[1]::INTEGER,
  notes = trim(regexp_replace(notes, '\[CONSULTATION:\d+\]\s*', ''))
WHERE notes ~ '\[CONSULTATION:\d+\]' AND consultation_id IS NULL;


-- ----------------------------------------------------------------------------
-- 4. emergency_alerts — a real "has this been texted to a parent" flag
-- ----------------------------------------------------------------------------
ALTER TABLE emergency_alerts ADD COLUMN IF NOT EXISTS sms_sent BOOLEAN NOT NULL DEFAULT FALSE;

-- One-time backfill from the existing sms_log linkage.
UPDATE emergency_alerts a
SET sms_sent = TRUE
WHERE EXISTS (SELECT 1 FROM sms_log s WHERE s.emergency_alert_id = a.emergency_alert_id)
  AND sms_sent = FALSE;


-- ----------------------------------------------------------------------------
-- 5. patient_profiles — separate Father/Mother contacts + a secondary phone
-- ----------------------------------------------------------------------------
-- NOTE: parent_name/parent_phone/parent_relation stay as-is and continue to
-- mean "primary guardian contact" (what Emergency Alerts' SMS composer
-- uses). These new columns are additive, for the Profile page's separate
-- Father/Mother sections which previously had nowhere to persist to.
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS father_name VARCHAR(150);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS father_phone VARCHAR(20);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS father_address VARCHAR(255);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS mother_name VARCHAR(150);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS mother_phone VARCHAR(20);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS mother_address VARCHAR(255);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS guardian_address VARCHAR(255);
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS parent_phone_2 VARCHAR(20);


-- ----------------------------------------------------------------------------
-- 6. users — bridge column so Postgres RLS can identify "which row is me"
-- ----------------------------------------------------------------------------
-- This is the fix for the auth.users(UUID) <-> public.users(SERIAL) gap
-- flagged since Phase 2. Nullable and backfilled lazily on first login
-- after this migration (see AuthContext.jsx) rather than requiring a
-- one-time bulk backfill — existing rows have no auth.users counterpart
-- yet anyway, since no one has logged in through Supabase Auth as them
-- until they do.
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
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

GRANT EXECUTE ON FUNCTION current_app_user_id() TO authenticated;
GRANT EXECUTE ON FUNCTION current_app_role() TO authenticated;


-- ---------------------------------------------------------------- users ----
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR email = auth.email()                          -- lets a just-migrated row be found before auth_user_id is linked
    OR current_app_role() IN ('admin', 'staff')       -- staff/admin need to see everyone (doc requests, EHR, etc.)
  );

DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR email = auth.email() OR current_app_role() = 'admin')
  WITH CHECK (auth_user_id = auth.uid() OR email = auth.email() OR current_app_role() = 'admin');

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (current_app_role() = 'admin');          -- only Maintenance's Add User flow creates rows

DROP POLICY IF EXISTS users_delete ON users;
CREATE POLICY users_delete ON users FOR DELETE TO authenticated
  USING (current_app_role() = 'admin');


-- ------------------------------------------------------ staff_profiles -----
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_profiles_select ON staff_profiles;
CREATE POLICY staff_profiles_select ON staff_profiles FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS staff_profiles_write ON staff_profiles;
CREATE POLICY staff_profiles_write ON staff_profiles FOR ALL TO authenticated
  USING (current_app_role() = 'admin' OR user_id = current_app_user_id())
  WITH CHECK (current_app_role() = 'admin' OR user_id = current_app_user_id());


-- ---------------------------------------------------- staff_permissions ----
ALTER TABLE staff_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_permissions_select ON staff_permissions;
CREATE POLICY staff_permissions_select ON staff_permissions FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS staff_permissions_write ON staff_permissions;
CREATE POLICY staff_permissions_write ON staff_permissions FOR ALL TO authenticated
  USING (current_app_role() = 'admin')
  WITH CHECK (current_app_role() = 'admin');


-- ----------------------------------------------------- patient_profiles ----
ALTER TABLE patient_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS patient_profiles_select ON patient_profiles;
CREATE POLICY patient_profiles_select ON patient_profiles FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS patient_profiles_write ON patient_profiles;
CREATE POLICY patient_profiles_write ON patient_profiles FOR ALL TO authenticated
  USING (current_app_role() = 'admin' OR user_id = current_app_user_id())
  WITH CHECK (current_app_role() = 'admin' OR user_id = current_app_user_id());


-- -------------------------------------------------- document_requests -----
ALTER TABLE document_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_requests_select ON document_requests;
CREATE POLICY document_requests_select ON document_requests FOR SELECT TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS document_requests_insert ON document_requests;
CREATE POLICY document_requests_insert ON document_requests FOR INSERT TO authenticated
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS document_requests_update ON document_requests;
CREATE POLICY document_requests_update ON document_requests FOR UPDATE TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'))
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS document_requests_delete ON document_requests;
CREATE POLICY document_requests_delete ON document_requests FOR DELETE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------- consultations ----
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultations_select ON consultations;
CREATE POLICY consultations_select ON consultations FOR SELECT TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS consultations_write ON consultations;
CREATE POLICY consultations_write ON consultations FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------ consultation_medications -
ALTER TABLE consultation_medications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consultation_medications_select ON consultation_medications;
CREATE POLICY consultation_medications_select ON consultation_medications FOR SELECT TO authenticated
  USING (
    current_app_role() IN ('admin', 'staff')
    OR EXISTS (
      SELECT 1 FROM consultations c
      WHERE c.consultation_id = consultation_medications.consultation_id
        AND c.patient_id = current_app_user_id()
    )
  );

DROP POLICY IF EXISTS consultation_medications_write ON consultation_medications;
CREATE POLICY consultation_medications_write ON consultation_medications FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------------- inventory --
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_all ON inventory;
CREATE POLICY inventory_all ON inventory FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- -------------------------------------------------------- inventory_batches
ALTER TABLE inventory_batches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_batches_all ON inventory_batches;
CREATE POLICY inventory_batches_all ON inventory_batches FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ---------------------------------------------------------- inventory_logs
ALTER TABLE inventory_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_logs_all ON inventory_logs;
CREATE POLICY inventory_logs_all ON inventory_logs FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ----------------------------------------------------------- scan_history --
ALTER TABLE scan_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS scan_history_all ON scan_history;
CREATE POLICY scan_history_all ON scan_history FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------------ appointments
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS appointments_select ON appointments;
CREATE POLICY appointments_select ON appointments FOR SELECT TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS appointments_insert ON appointments;
CREATE POLICY appointments_insert ON appointments FOR INSERT TO authenticated
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS appointments_update ON appointments;
CREATE POLICY appointments_update ON appointments FOR UPDATE TO authenticated
  USING (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'))
  WITH CHECK (patient_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS appointments_delete ON appointments;
CREATE POLICY appointments_delete ON appointments FOR DELETE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------- emergency_alerts --
ALTER TABLE emergency_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS emergency_alerts_select ON emergency_alerts;
CREATE POLICY emergency_alerts_select ON emergency_alerts FOR SELECT TO authenticated
  USING (
    subject_id = current_app_user_id()
    OR reported_by = current_app_user_id()
    OR current_app_role() IN ('admin', 'staff')
  );

DROP POLICY IF EXISTS emergency_alerts_insert ON emergency_alerts;
CREATE POLICY emergency_alerts_insert ON emergency_alerts FOR INSERT TO authenticated
  WITH CHECK (reported_by = current_app_user_id());   -- anyone can file a report, including patients (self-report / on behalf of)

DROP POLICY IF EXISTS emergency_alerts_update ON emergency_alerts;
CREATE POLICY emergency_alerts_update ON emergency_alerts FOR UPDATE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ----------------------------------------------------------------- sms_log
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sms_log_all ON sms_log;
CREATE POLICY sms_log_all ON sms_log FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- -------------------------------------------------------------- audit_logs
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_select ON audit_logs;
CREATE POLICY audit_logs_select ON audit_logs FOR SELECT TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));

DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------------ notifications
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notifications_select ON notifications;
CREATE POLICY notifications_select ON notifications FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR target_role = current_app_role());

DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT TO authenticated
  WITH CHECK (true);  -- any authenticated user can notify (e.g. a patient notifying staff of a new request)

DROP POLICY IF EXISTS notifications_update ON notifications;
CREATE POLICY notifications_update ON notifications FOR UPDATE TO authenticated
  USING (user_id = current_app_user_id() OR target_role = current_app_role())
  WITH CHECK (user_id = current_app_user_id() OR target_role = current_app_role());


-- ------------------------------------------------------------ email_config
ALTER TABLE email_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_config_all ON email_config;
CREATE POLICY email_config_all ON email_config FOR ALL TO authenticated
  USING (current_app_role() = 'admin')
  WITH CHECK (current_app_role() = 'admin');

-- Seed the single email_config row if one doesn't already exist, so the
-- Maintenance "Email Configuration" tab (Phase G) has something to
-- load/edit. Safe to re-run.
INSERT INTO email_config (smtp_host, smtp_port, smtp_user, from_name, enable_notifications)
SELECT 'smtp.example.edu', 587, 'clinic@example.edu', 'University Clinic', true
WHERE NOT EXISTS (SELECT 1 FROM email_config);


-- ============================================================================
-- End of Phase A migration.
-- ============================================================================
