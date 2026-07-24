-- ============================================================================
-- MIGRATION 018 — Automation (Notification System Phase 8)
-- ============================================================================
-- Stock-level alerts (Phase 3) and event alerts (Phase 5) are already
-- fully automatic — hooked into addMedicineMovement(), which every
-- quantity-changing action calls, so they fire immediately on the
-- triggering write. No further automation needed for those; this
-- migration is specifically about expiration alerts (Phase 4), the one
-- genuinely time-driven check with no data-write event to hook.
--
-- The entire algorithm (tiering, dedup, auto-clear, status sync) —
-- previously implemented in JS as checkExpirationAlert() /
-- syncExpiredBatchStatus() / runExpirationCheck() — is consolidated here
-- into ONE PL/pgSQL function. This is the single source of truth,
-- callable both:
--   1. From the client via supabase.rpc() — same trigger point as
--      before (Inventory page load), medicineService.runExpirationCheck()
--      becomes a thin wrapper around this RPC call.
--   2. From pg_cron, daily — so expiration status/alerts stay correct
--      even on days nobody opens the Inventory page at all. Once per day
--      is the correct, non-wasteful cadence: expiration dates don't
--      change more than once a day, so anything more frequent would be
--      exactly the "unnecessary polling" this phase says to avoid.
--
-- pg_cron availability varies by Supabase plan/project configuration —
-- the DO block below attempts to enable it and schedule the job, but
-- wraps that attempt in exception handling so a project without pg_cron
-- available still gets the function itself (required) without the
-- migration failing outright over the optional scheduling part. The
-- client-side on-page-load call remains a fully reliable path regardless
-- of whether the schedule below actually took effect — if pg_cron isn't
-- available, this system still works exactly as it did in Phase 4,
-- just without "runs even if nobody visits the page" as a bonus.
-- ============================================================================

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
  -- "Automatically update status" — flip any batch whose date has
  -- actually passed from Active to Expired. (The release-time guard
  -- added in Phase 4 already prevents dispensing an expired batch
  -- regardless of whether this has run recently — this keeps the
  -- stored data itself honest for display/reporting.)
  UPDATE medicine_batches
  SET status = 'Expired'
  WHERE status = 'Active' AND expiration_date IS NOT NULL AND expiration_date < CURRENT_DATE;

  -- Batch-level tiering — one alert per batch, not per medicine, so a
  -- medicine with batches at different tiers gets each one alerted
  -- correctly (same reasoning as the original Phase 4 design).
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

    -- Auto-clear stale tiers for this batch (Phase 4's auto-clear
    -- behavior) — a batch moving 60→30 days correctly swaps which one
    -- alert is showing rather than accumulating several.
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

-- Optional: schedule it daily via pg_cron, if that extension is
-- available on this project. Wrapped in exception handling so a project
-- without pg_cron available (varies by Supabase plan) still gets the
-- function above without the whole migration failing.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('inventory-expiration-check', '0 6 * * *', 'SELECT run_expiration_check();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped (extension unavailable on this project): %', SQLERRM;
END;
$$;

-- ============================================================================
-- End of migration 018.
-- ============================================================================
