-- 052_fix_expiration_alert_dedup.sql
--
-- Fixes the same class of bug as the JS-side createInventoryNotification
-- dedup fix (inventoryNotificationsService.js): run_expiration_check()'s
-- "does this alert already exist" check was scoped to `is_read = false`
-- only. Since this function runs daily via pg_cron (and on every
-- Inventory page load), a batch sitting at the SAME expiration tier
-- across two runs — the ordinary case; nothing about the batch actually
-- changed — would find no UNREAD row once the earlier alert had been
-- marked read, and create a brand-new duplicate for the exact same
-- still-unresolved condition. From the user's side that's
-- indistinguishable from "the notification I already read came back as
-- unread" the next time the check ran.
--
-- Also widens the stale-tier auto-clear DELETE to remove matching rows
-- regardless of read state, for the same reason the JS-side
-- clearInventoryNotifications() fix does: a lingering READ row from a
-- past occurrence of a tier would otherwise block this same EXISTS
-- check from ever creating a fresh alert if that tier genuinely recurs
-- later (e.g. a batch's tier improves then regresses back to the same
-- one it was at before). These are transient operational alerts, not
-- permanent history (inventory_logs already covers that), so deleting a
-- read row here is correct, not a loss of real history.

CREATE OR REPLACE FUNCTION run_expiration_check() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  batch RECORD;
  active_type TEXT;
  days_left INT;
BEGIN
  UPDATE medicine_batches
  SET status = 'Expired'
  WHERE status = 'Active' AND expiration_date IS NOT NULL AND expiration_date < CURRENT_DATE;

  FOR batch IN
    SELECT mb.medicine_batch_id, mb.medicine_id, mb.expiration_date, mb.batch_number, m.medicine_name
    FROM medicine_batches mb
    JOIN medicines m ON m.medicine_id = mb.medicine_id
    WHERE mb.expiration_date IS NOT NULL AND mb.status IN ('Active', 'Expired')
  LOOP
    days_left := batch.expiration_date - CURRENT_DATE;
    active_type := CASE
      WHEN days_left < 0 THEN 'expired'
      WHEN days_left <= 7 THEN 'expiring_7'
      WHEN days_left <= 30 THEN 'expiring_30'
      WHEN days_left <= 60 THEN 'expiring_60'
      WHEN days_left <= 90 THEN 'expiring_90'
      ELSE NULL
    END;

    -- Auto-clear stale tiers for this batch — now regardless of read
    -- state (was: AND is_read = false), so a past READ alert for a tier
    -- this batch is no longer at doesn't linger and later block a
    -- genuine fresh occurrence of that same tier from the EXISTS check
    -- below.
    DELETE FROM inventory_notifications
    WHERE batch_id = batch.medicine_batch_id
      AND notification_type IN ('expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired')
      AND (active_type IS NULL OR notification_type <> active_type);

    -- Dedup check — now matches ANY existing row of the active tier
    -- (was: AND is_read = false). The condition (this batch, at this
    -- exact tier) hasn't changed just because someone read the earlier
    -- alert, so nothing new should be created; read state was never
    -- actually relevant to "does this alert already exist."
    IF active_type IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM inventory_notifications
      WHERE batch_id = batch.medicine_batch_id AND notification_type = active_type
    ) THEN
      INSERT INTO inventory_notifications (notification_type, medicine_id, batch_id, title, message, priority)
      VALUES (
        active_type,
        batch.medicine_id,
        batch.medicine_batch_id,
        CASE active_type
          WHEN 'expired' THEN 'Expired: ' || batch.medicine_name
          WHEN 'expiring_7' THEN 'Expiring in 7 Days: ' || batch.medicine_name
          WHEN 'expiring_30' THEN 'Expiring in 30 Days: ' || batch.medicine_name
          WHEN 'expiring_60' THEN 'Expiring in 60 Days: ' || batch.medicine_name
          WHEN 'expiring_90' THEN 'Expiring in 90 Days: ' || batch.medicine_name
        END,
        CASE active_type
          WHEN 'expired' THEN 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expired on ' || batch.expiration_date || ' and can no longer be released.'
          WHEN 'expiring_7' THEN 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expires on ' || batch.expiration_date || ' (within 7 days) — urgent.'
          WHEN 'expiring_30' THEN 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expires on ' || batch.expiration_date || ' (within 30 days) — plan to use or reorder.'
          ELSE 'Batch ' || batch.batch_number || ' of ' || batch.medicine_name || ' expires on ' || batch.expiration_date || '.'
        END,
        CASE active_type
          WHEN 'expired' THEN 'critical'
          WHEN 'expiring_7' THEN 'critical'
          WHEN 'expiring_30' THEN 'high'
          WHEN 'expiring_60' THEN 'medium'
          ELSE 'low'
        END
      );
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION run_expiration_check() TO authenticated;