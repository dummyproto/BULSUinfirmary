-- Audit trail entries must stay historically accurate even after the
-- account that performed the action is later deleted. audit_logs.user_id
-- and inventory_logs.staff_id are both ON DELETE SET NULL by design (so
-- deleting a user never fails or wipes out their log history — see
-- migration 019's comments) — but until now, the actor's name AND role
-- shown on the Audit Trail page (AuditTrailPage.jsx) were only ever
-- resolved via a LIVE join to `users`. The moment that account was
-- deleted, every log entry it ever wrote lost its name and role — showing
-- as "Unknown user" and disappearing from the Administrator/Staff/Patient
-- filter (roleFilter), even though the log entry itself was still there.
--
-- This snapshots the actor's name + role onto the row itself at INSERT
-- time via a trigger, so a later account deletion can never erase who
-- did it or what role they had. The existing live join in
-- auditLogsService.js / inventoryService.js is kept as a harmless
-- fallback for any pre-migration edge case; the app prefers these
-- snapshot columns.

ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS actor_name VARCHAR(150),
  ADD COLUMN IF NOT EXISTS actor_role VARCHAR(10);

ALTER TABLE inventory_logs
  ADD COLUMN IF NOT EXISTS staff_name_snapshot VARCHAR(150),
  ADD COLUMN IF NOT EXISTS staff_role_snapshot VARCHAR(10);

-- Backfill every existing row whose referenced account still exists.
-- Rows whose account was ALREADY deleted before this migration ran have
-- no name/role left to recover (user_id is already NULL) — those keep
-- showing as "Unknown user", same as before; there's nothing left to
-- snapshot for them.
UPDATE audit_logs al
SET actor_name = u.name, actor_role = u.role
FROM users u
WHERE al.user_id = u.user_id AND al.actor_name IS NULL;

UPDATE inventory_logs il
SET staff_name_snapshot = u.name, staff_role_snapshot = u.role
FROM users u
WHERE il.staff_id = u.user_id AND il.staff_name_snapshot IS NULL;

-- SECURITY DEFINER + fixed search_path, same pattern as current_app_role()
-- / current_app_user_id() elsewhere in this schema — needed because the
-- inserting session (patient/staff/anon, per audit_logs_insert's RLS
-- policy) must not need its own SELECT access to `users` just for this
-- trigger to read the name/role of the account the log entry is about.
CREATE OR REPLACE FUNCTION snapshot_audit_log_actor() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.user_id IS NOT NULL THEN
    SELECT name, role INTO NEW.actor_name, NEW.actor_role FROM users WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_audit_log_actor ON audit_logs;
CREATE TRIGGER trg_snapshot_audit_log_actor
  BEFORE INSERT ON audit_logs
  FOR EACH ROW EXECUTE FUNCTION snapshot_audit_log_actor();

CREATE OR REPLACE FUNCTION snapshot_inventory_log_staff() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.staff_id IS NOT NULL THEN
    SELECT name, role INTO NEW.staff_name_snapshot, NEW.staff_role_snapshot FROM users WHERE user_id = NEW.staff_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_inventory_log_staff ON inventory_logs;
CREATE TRIGGER trg_snapshot_inventory_log_staff
  BEFORE INSERT ON inventory_logs
  FOR EACH ROW EXECUTE FUNCTION snapshot_inventory_log_staff();