-- ============================================================================
-- MIGRATION 042 — Patients Can Edit/Cancel Only PENDING Document Requests
-- ============================================================================
-- Two changes to support the student-facing "Edit" / "Cancel" actions on
-- MyRequestsPage (replacing the old "delete selected" flow there):
--
-- 1. 'Cancelled' is added to the status CHECK constraint. It was already a
--    recognized status label elsewhere in the app (see StatusBadge's
--    STATUS_COLOR map), just never allowed on this table.
--
-- 2. document_requests_update (from the base schema) previously let a
--    patient update ANY of their own rows, in ANY status, with no
--    restriction — same loose shape the delete policy had before
--    migrations 040/041 tightened it. This narrows patient self-updates to
--    rows that are currently 'Pending', matching the UI rule: once staff
--    has started processing a request (Processing/Approved/Declined/
--    Claimed/Cancelled), the requester can no longer edit its details or
--    cancel it themselves.
-- ============================================================================

ALTER TABLE document_requests DROP CONSTRAINT IF EXISTS document_requests_status_check;
ALTER TABLE document_requests ADD CONSTRAINT document_requests_status_check
  CHECK (status IN ('Pending','Processing','Approved','Declined','Claimed','Cancelled'));

DROP POLICY IF EXISTS document_requests_update ON document_requests;
CREATE POLICY document_requests_update ON document_requests FOR UPDATE TO authenticated
  USING (
    current_app_role() IN ('admin', 'staff')
    OR (patient_id = current_app_user_id() AND status = 'Pending')
  )
  WITH CHECK (
    current_app_role() IN ('admin', 'staff')
    OR (patient_id = current_app_user_id() AND status IN ('Pending', 'Cancelled'))
  );

-- ============================================================================
-- End of migration 042.
-- ============================================================================