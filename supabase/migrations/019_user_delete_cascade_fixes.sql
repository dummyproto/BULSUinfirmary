-- ============================================================================
-- MIGRATION 019 — User Delete: Fix Every FK Referencing users(user_id)
-- ============================================================================
-- Phase 3 (System Maintenance). deleteUser() in usersService.js does a
-- plain `DELETE FROM users WHERE user_id = ...`, relying on
-- staff_profiles/staff_permissions/patient_profiles' existing
-- ON DELETE CASCADE to clean up owned profile rows. But a full audit of
-- every `REFERENCES users(user_id)` in the schema (20 FK columns across
-- 15 tables) found that only 4 of them had an explicit ON DELETE clause
-- at all — the other 16 default to Postgres's implicit NO ACTION
-- (effectively RESTRICT): deleting any user who has ever submitted a
-- document request, had a consultation, appeared in an inventory log,
-- had an appointment, filed or been the subject of an emergency alert,
-- sent an SMS log entry, appeared in the audit log, received inventory,
-- or triggered a chatbot-adjacent notification would throw a foreign-key
-- violation — caught by MaintenancePage.jsx's generic catch block and
-- shown as an unhelpful "Failed to delete user" toast, with no
-- indication of which of these 16 tables actually blocked it.
--
-- Two categories, decided per the same principle used elsewhere in this
-- schema (see migration 012/016's reasoning for inventory_logs/
-- consultation_medications, which already got this treatment):
--
--   OWNED DATA (has no meaning without the user) -> ON DELETE CASCADE.
--   Already correct for staff_profiles/staff_permissions/
--   patient_profiles/chat_conversations — no change needed for those 4.
--
--   HISTORICAL / AUDIT DATA (a real record of something that happened —
--   a document request, a medical consultation, a movement log entry, an
--   emergency alert, an audit trail entry) -> ON DELETE SET NULL. The
--   record survives with its user-reference column nulled out, rather
--   than either blocking the delete or destroying clinic/audit history
--   just because an account was later removed. This requires the
--   referencing column to be nullable — several of these are currently
--   NOT NULL and need that dropped first.
--
-- One deliberate exception to the "historical -> SET NULL" rule:
-- notifications.user_id already carries a specific existing meaning for
-- NULL — "broadcast to target_role" (see the column comment on that
-- table). If a targeted notification's user_id were SET NULL when its
-- recipient is deleted, it would then look exactly like a broadcast
-- notification to everyone with that role, which is actively misleading,
-- not just imprecise. A personal notification for a since-deleted user
-- also has no ongoing purpose to preserve. CASCADE is the correct choice
-- here specifically, not an oversight.
-- ============================================================================

-- ── Owned data — already CASCADE, listed here only to document that
-- they were checked, not skipped:
--   staff_profiles.user_id, staff_permissions.user_id,
--   patient_profiles.user_id, chat_conversations.user_id

-- ── document_requests ──
ALTER TABLE document_requests ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE document_requests DROP CONSTRAINT document_requests_patient_id_fkey;
ALTER TABLE document_requests ADD CONSTRAINT document_requests_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE document_requests DROP CONSTRAINT document_requests_processed_by_fkey;
ALTER TABLE document_requests ADD CONSTRAINT document_requests_processed_by_fkey
  FOREIGN KEY (processed_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── consultations ── (a medical record — must survive account deletion,
-- never be silently destroyed or block the delete)
ALTER TABLE consultations ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE consultations DROP CONSTRAINT consultations_patient_id_fkey;
ALTER TABLE consultations ADD CONSTRAINT consultations_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE consultations DROP CONSTRAINT consultations_attended_by_fkey;
ALTER TABLE consultations ADD CONSTRAINT consultations_attended_by_fkey
  FOREIGN KEY (attended_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── inventory_logs ── (movement/audit history — same principle already
-- applied to inventory_logs.inventory_id in migration 012)
ALTER TABLE inventory_logs ALTER COLUMN staff_id DROP NOT NULL;
ALTER TABLE inventory_logs DROP CONSTRAINT inventory_logs_staff_id_fkey;
ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_staff_id_fkey
  FOREIGN KEY (staff_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── scan_history ──
ALTER TABLE scan_history DROP CONSTRAINT scan_history_scanned_by_fkey;
ALTER TABLE scan_history ADD CONSTRAINT scan_history_scanned_by_fkey
  FOREIGN KEY (scanned_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── appointments ──
ALTER TABLE appointments ALTER COLUMN patient_id DROP NOT NULL;
ALTER TABLE appointments DROP CONSTRAINT appointments_patient_id_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_patient_id_fkey
  FOREIGN KEY (patient_id) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE appointments DROP CONSTRAINT appointments_attended_by_fkey;
ALTER TABLE appointments ADD CONSTRAINT appointments_attended_by_fkey
  FOREIGN KEY (attended_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── notifications ── CASCADE, not SET NULL — see the note above about
-- NULL already meaning "broadcast" on this specific table.
ALTER TABLE notifications DROP CONSTRAINT notifications_user_id_fkey;
ALTER TABLE notifications ADD CONSTRAINT notifications_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE;

-- ── emergency_alerts ── (a safety-incident record — reported_by in
-- particular must never silently block deleting the reporting user's
-- account, nor disappear)
ALTER TABLE emergency_alerts ALTER COLUMN reported_by DROP NOT NULL;
ALTER TABLE emergency_alerts DROP CONSTRAINT emergency_alerts_reported_by_fkey;
ALTER TABLE emergency_alerts ADD CONSTRAINT emergency_alerts_reported_by_fkey
  FOREIGN KEY (reported_by) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE emergency_alerts DROP CONSTRAINT emergency_alerts_subject_id_fkey;
ALTER TABLE emergency_alerts ADD CONSTRAINT emergency_alerts_subject_id_fkey
  FOREIGN KEY (subject_id) REFERENCES users(user_id) ON DELETE SET NULL;
ALTER TABLE emergency_alerts DROP CONSTRAINT emergency_alerts_acknowledged_by_fkey;
ALTER TABLE emergency_alerts ADD CONSTRAINT emergency_alerts_acknowledged_by_fkey
  FOREIGN KEY (acknowledged_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── sms_log ──
ALTER TABLE sms_log DROP CONSTRAINT sms_log_sent_by_fkey;
ALTER TABLE sms_log ADD CONSTRAINT sms_log_sent_by_fkey
  FOREIGN KEY (sent_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── audit_logs ── (the audit trail itself — must never be the reason a
-- delete is blocked, and must never lose entries just because the actor
-- was later removed)
ALTER TABLE audit_logs DROP CONSTRAINT audit_logs_user_id_fkey;
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── receiving_records ──
ALTER TABLE receiving_records ALTER COLUMN received_by DROP NOT NULL;
ALTER TABLE receiving_records DROP CONSTRAINT receiving_records_received_by_fkey;
ALTER TABLE receiving_records ADD CONSTRAINT receiving_records_received_by_fkey
  FOREIGN KEY (received_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ── inventory_notifications ── (already nullable; only the FK's ON
-- DELETE behavior needed fixing — nullable alone does not imply SET
-- NULL, the constraint still defaulted to blocking the delete)
ALTER TABLE inventory_notifications DROP CONSTRAINT inventory_notifications_created_by_fkey;
ALTER TABLE inventory_notifications ADD CONSTRAINT inventory_notifications_created_by_fkey
  FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL;

-- ============================================================================
-- End of migration 019.
-- ============================================================================
