-- Extends delete_logs (migration 028) to inventory_logs — same gap
-- found there: a single FOR ALL policy let any staff delete freely,
-- with no permission check at all. Reuses the same delete_logs flag
-- rather than adding a separate one, so admin's one toggle per staff
-- member consistently governs deleting from Alert Log, SMS Log, and
-- now Inventory Transaction Log alike.

DROP POLICY IF EXISTS inventory_logs_all ON inventory_logs;

CREATE POLICY inventory_logs_select ON inventory_logs FOR SELECT TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));

CREATE POLICY inventory_logs_insert ON inventory_logs FOR INSERT TO authenticated
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

CREATE POLICY inventory_logs_update ON inventory_logs FOR UPDATE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

CREATE POLICY inventory_logs_delete ON inventory_logs FOR DELETE TO authenticated
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