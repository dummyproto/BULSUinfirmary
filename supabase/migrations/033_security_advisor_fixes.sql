-- Fixes two genuine, verified findings from Supabase's Security Advisor
-- (confirmed by reading each function's actual body, not just the
-- warning label — most of the other flagged items turned out to be
-- intentional/safe on inspection; see the conversation this migration
-- came from for the full reasoning on each one).

-- ── 1. Missing search_path (function_search_path_mutable) ──
-- These two are correctly SECURITY INVOKER (not DEFINER — see their own
-- comments in clinic_schema_v2_consolidated.sql), but were missing SET
-- search_path, unlike every other function in this schema. Without it,
-- a malicious search_path set by the calling session could theoretically
-- cause the function to resolve an unqualified table/type name to an
-- attacker-controlled object instead of the real one. Low real-world
-- risk for these two specifically (read-only dashboard aggregations,
-- no unqualified type casts), but free to close and consistent with
-- every other function in this file already doing this correctly.
ALTER FUNCTION get_monthly_inventory_movement(INTEGER) SET search_path = public;
ALTER FUNCTION get_top_used_medicines(INTEGER, INTEGER) SET search_path = public;

-- ── 2. run_expiration_check() callable by any authenticated user ──
-- Granted to `authenticated` broadly (migration 018), meaning a patient
-- account — not just staff/admin — can currently call this directly via
-- supabase.rpc('run_expiration_check'), even though the only two
-- legitimate callers are: the Inventory page (staff/admin only) and
-- pg_cron (migration 018's daily scheduled job, which has NO
-- authenticated user context at all — current_app_role() resolves to
-- NULL there, same as auth.uid()).
--
-- The guard below only blocks when there IS an authenticated caller who
-- isn't staff/admin (i.e. blocks patients specifically) — it does NOT
-- block the NULL-role case, so pg_cron's invocation keeps working
-- exactly as before. A patient calling this today couldn't read/leak
-- anything (it only flips batch status and writes notifications), but
-- there's no reason a non-staff account should be able to trigger
-- inventory-wide side effects at all, so this closes it properly rather
-- than relying on the frontend simply not exposing a button for it.
--
-- Everything below the guard clause is the original function body,
-- unchanged from clinic_schema_v2_consolidated.sql / migration 018.
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
  IF current_app_role() IS NOT NULL AND current_app_role() NOT IN ('staff', 'admin') THEN
    RAISE EXCEPTION 'Not authorized to run expiration check';
  END IF;

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

    DELETE FROM inventory_notifications
    WHERE batch_id = batch.medicine_batch_id
      AND notification_type IN ('expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired')
      AND is_read = false
      AND (active_type IS NULL OR notification_type <> active_type);

    IF active_type IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM inventory_notifications
      WHERE batch_id = batch.medicine_batch_id AND notification_type = active_type AND is_read = false
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