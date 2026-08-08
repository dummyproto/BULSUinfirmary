-- notifications had SELECT/INSERT/UPDATE policies (see
-- clinic_schema_v2_consolidated.sql / migration 001) but no DELETE
-- policy was ever added — RLS defaults to deny, so any delete attempt
-- on this table has been silently blocked all along. Needed for the new
-- per-notification × delete button in NotificationsModal.jsx.
--
-- Same ownership check as notifications_select/notifications_update: a
-- notification can be deleted by the specific user it targets
-- (user_id = current_app_user_id()) or, for role-broadcast
-- notifications with no specific user_id, by anyone currently in that
-- target role (target_role = current_app_role()) — deleting one of
-- those just clears it from that person's own list, it doesn't affect
-- what other people in the same role still see (each row is only ever
-- deleted once, by whoever clicks its ×, not broadcast-removed for the
-- whole role).

CREATE POLICY notifications_delete ON notifications FOR DELETE TO authenticated
  USING (user_id = current_app_user_id() OR target_role = current_app_role());