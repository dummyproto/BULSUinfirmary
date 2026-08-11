-- Extends delete_logs (migrations 028/029) to scan_history and
-- inventory_notifications — same gap found on every other log table:
-- a single FOR ALL policy let any staff delete freely, no permission
-- check. Also tightens document_requests_delete from "any staff" to
-- the same admin-or-permitted-staff standard, for consistency across
-- everywhere the bulk-delete UI now exists.

-- ── scan_history ──
DROP POLICY IF EXISTS scan_history_all ON scan_history;
DROP POLICY IF EXISTS scan_history_select ON scan_history;
DROP POLICY IF EXISTS scan_history_insert ON scan_history;
DROP POLICY IF EXISTS scan_history_delete ON scan_history;

CREATE POLICY scan_history_select ON scan_history FOR SELECT TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));

CREATE POLICY scan_history_insert ON scan_history FOR INSERT TO authenticated
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

CREATE POLICY scan_history_delete ON scan_history FOR DELETE TO authenticated
  USING (
    current_app_role() = 'admin'
    OR (
      current_app_role() = 'staff'
      AND EXISTS (
        SELECT 1 FROM staff_permissions sp
        WHERE sp.user_id = current_app_user_id() AND sp.delete_logs = TRUE
      )
    )
  );

-- ── inventory_notifications ──
DROP POLICY IF EXISTS inventory_notifications_all ON inventory_notifications;
DROP POLICY IF EXISTS inventory_notifications_select ON inventory_notifications;
DROP POLICY IF EXISTS inventory_notifications_insert ON inventory_notifications;
DROP POLICY IF EXISTS inventory_notifications_update ON inventory_notifications;
DROP POLICY IF EXISTS inventory_notifications_delete ON inventory_notifications;

CREATE POLICY inventory_notifications_select ON inventory_notifications FOR SELECT TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));

CREATE POLICY inventory_notifications_insert ON inventory_notifications FOR INSERT TO authenticated
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

CREATE POLICY inventory_notifications_update ON inventory_notifications FOR UPDATE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

CREATE POLICY inventory_notifications_delete ON inventory_notifications FOR DELETE TO authenticated
  USING (
    current_app_role() = 'admin'
    OR (
      current_app_role() = 'staff'
      AND EXISTS (
        SELECT 1 FROM staff_permissions sp
        WHERE sp.user_id = current_app_user_id() AND sp.delete_logs = TRUE
      )
    )
  );

-- ── document_requests: tighten from "any staff" to the same standard ──
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
  );