-- Adds a 4th staff_permissions flag (delete_logs) and real DELETE
-- policies on emergency_alerts and sms_log, gated by it.
--
-- Current state before this migration:
--   - emergency_alerts has no DELETE policy at all — RLS defaults to
--     deny, so nobody (not even admin) can currently delete a row here
--     through the normal client.
--   - sms_log has a single FOR ALL policy covering every operation
--     (SELECT/INSERT/UPDATE/DELETE) for admin AND staff alike, with no
--     permission check — any staff account can already delete SMS log
--     rows freely today. This migration tightens that: staff can still
--     read/insert/update SMS logs as before, but deleting now requires
--     the same admin-or-permitted-staff check as emergency_alerts.

ALTER TABLE staff_permissions
  ADD COLUMN delete_logs BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN staff_permissions.delete_logs IS
  'Lets a staff account delete rows from emergency_alerts (Alert Log) and sms_log (SMS Log) in the UI. Admins can always delete regardless of this flag — see the emergency_alerts_delete / sms_log_delete policies below.';

-- emergency_alerts: new DELETE policy (none existed before)
DROP POLICY IF EXISTS emergency_alerts_delete ON emergency_alerts;
CREATE POLICY emergency_alerts_delete ON emergency_alerts FOR DELETE TO authenticated
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

-- sms_log: split the old FOR ALL policy into SELECT/INSERT/UPDATE
-- (unchanged — still open to any staff, same as before) and a
-- separate, gated DELETE policy.
DROP POLICY IF EXISTS sms_log_all ON sms_log;

CREATE POLICY sms_log_select ON sms_log FOR SELECT TO authenticated
  USING (current_app_role() IN ('admin', 'staff'));

CREATE POLICY sms_log_insert ON sms_log FOR INSERT TO authenticated
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

CREATE POLICY sms_log_update ON sms_log FOR UPDATE TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

CREATE POLICY sms_log_delete ON sms_log FOR DELETE TO authenticated
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