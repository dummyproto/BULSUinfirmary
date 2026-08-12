-- ============================================================================
-- MIGRATION 040 — Patients Can Delete Their Own Document Requests
-- ============================================================================
-- document_requests_delete (migration 034) only ever allowed admin, or
-- staff with the delete_logs permission, to delete a document request —
-- a patient has never been able to delete their own, even one they
-- filed themselves. This adds that, scoped to their own rows only
-- (patient_id = current_app_user_id(), the same ownership check used
-- throughout this table's other policies).
--
-- Deliberately restricted to Pending/Declined requests only, not
-- Approved/Processing/Claimed — once staff has actually acted on a
-- request, it's a real record of that action (what was approved, when,
-- by whom), not something the requester should be able to quietly erase
-- on their own. A patient can still cancel a request that hasn't been
-- acted on yet, or clear out one that was declined, without needing to
-- ask an admin/staff member to do it for them.
-- ============================================================================

DROP POLICY IF EXISTS document_requests_delete ON document_requests;
CREATE POLICY document_requests_delete ON document_requests FOR DELETE TO authenticated
  USING (
    current_app_role() = 'admin'
    OR (
      current_app_role() = 'staff'
      AND EXISTS (
        SELECT 1 FROM staff_permissions sp
        WHERE sp.user_id = current_app_user_id() AND sp.delete_logs = TRUE
      )
    )
    OR (
      patient_id = current_app_user_id()
      AND status IN ('Pending', 'Declined')
    )
  );

-- ============================================================================
-- End of migration 040.
-- ============================================================================