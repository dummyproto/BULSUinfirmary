-- ============================================================================
-- MIGRATION 041 — Patients Can Only Delete CLAIMED Document Requests
-- ============================================================================
-- Migration 040 let patients delete their own Pending or Declined
-- requests. This changes that to Claimed only — a patient can now clear
-- out a document they've already physically picked up, but can no
-- longer delete a request that's still Pending, being Processed,
-- Approved and awaiting pickup, or Declined. A separate migration
-- (rather than editing 040 directly) since 040 may already be applied —
-- editing an already-run migration file wouldn't retroactively change
-- anything on a database that already executed it.
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
      AND status = 'Claimed'
    )
  );

-- ============================================================================
-- End of migration 041.
-- ============================================================================
