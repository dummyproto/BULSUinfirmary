-- 044_patient_audit_log_insert.sql
--
-- AuthContext.jsx's signIn()/signOut()/changePassword() now write LOGIN,
-- LOGOUT, and CHANGE_PASSWORD entries to audit_logs for BOTH staff and
-- patient accounts (same shared code path — see that file's own
-- comments). The original audit_logs_insert policy from
-- 001_phase_a_schema_and_rls.sql only allowed admin/staff to insert at
-- all, so every one of those calls for a signed-in PATIENT was silently
-- rejected by RLS — caught by the .catch() in AuthContext.jsx, so it
-- never surfaced as an error to the patient, it just never made it into
-- the table. This is why a patient login showed nothing in Reports ->
-- Audit Logs while a staff login worked fine.
--
-- Widens the policy to also allow a patient to insert a row, but only
-- for their OWN user_id and only for these three specific actions —
-- NOT a blanket "patients can insert any audit_logs row", which would
-- let a patient's own (client-side, so not fully trustworthy) requests
-- write arbitrary entries under someone else's name or with an
-- unrelated action. Admin/staff keep their original unrestricted insert
-- access (they can log any action, e.g. ADD_USER, DELETE_LOGS, for
-- themselves).

DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    current_app_role() IN ('admin', 'staff')
    OR (
      current_app_role() = 'patient'
      AND user_id = current_app_user_id()
      AND action IN ('LOGIN', 'LOGOUT', 'CHANGE_PASSWORD')
    )
  );