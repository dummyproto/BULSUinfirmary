-- ============================================================================
-- MIGRATION 054 — Follow-Up Checkup Reminder Notifications
-- ============================================================================
-- "Patient notification will also notify if the follow-up check-up is near
-- or exact date."
--
-- consultations.follow_up_date already exists (migration 001) and is
-- already shown on PatientDashboardPage.jsx's own follow-up status card
-- (Overdue/Today) — but only when the patient happens to open that page.
-- This migration adds the missing piece: an actual pushed notification,
-- so the reminder reaches the patient even if they never open the app
-- that day.
--
-- Deliberately modeled on run_expiration_check() (migration 018) — same
-- shape of problem (a time-driven check with no triggering data-write
-- event to hook), same solution: ONE PL/pgSQL function, callable both:
--   1. On-demand via supabase.rpc() — consultationsService.
--      runFollowUpReminderCheck() is a thin wrapper, called (best-effort,
--      non-blocking) when PatientDashboardPage.jsx mounts, exactly how
--      InventoryPage.jsx already calls run_expiration_check() on its own
--      mount.
--   2. Daily via pg_cron — so the reminder still fires even on a day the
--      patient never opens the app at all. Same pg_cron-availability
--      guard as migration 018: wrapped in exception handling so a
--      project without pg_cron still gets the function itself (required)
--      without the migration failing outright over the optional
--      scheduling part.
--
-- "Near" is defined as within 3 days — patient gets a reminder on day -3,
-- -2, -1 and 0 (the exact date itself). Dedup is by exact message text
-- per patient (same approach notifyIfNew()/notification_exists() already
-- use elsewhere in this app for state-based alerts with no discrete
-- event) — the notifications table has no structured "which consultation
-- is this about" column to dedup against directly (unlike
-- inventory_notifications' batch_id), so the message text itself (which
-- embeds the exact follow-up date) is what prevents the same day's
-- reminder being inserted twice.
-- ============================================================================

CREATE OR REPLACE FUNCTION run_followup_reminder_check() RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  c RECORD;
  days_left INT;
  msg TEXT;
  ntype TEXT;
BEGIN
  FOR c IN
    SELECT consultation_id, patient_id, follow_up_date
    FROM consultations
    -- patient_id is nullable (SET NULL on account deletion, migration
    -- 019, and always NULL for an unregistered-walk-in consultation) —
    -- there's simply nobody to notify in either case, so both are
    -- excluded rather than erroring.
    WHERE patient_id IS NOT NULL
      AND follow_up_date IS NOT NULL
      AND follow_up_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '3 days'
  LOOP
    days_left := c.follow_up_date - CURRENT_DATE;
    msg := CASE
      WHEN days_left = 0 THEN 'Your follow-up check-up is scheduled for today (' || to_char(c.follow_up_date, 'Mon DD, YYYY') || ').'
      WHEN days_left = 1 THEN 'Reminder: your follow-up check-up is tomorrow (' || to_char(c.follow_up_date, 'Mon DD, YYYY') || ').'
      ELSE 'Reminder: your follow-up check-up is on ' || to_char(c.follow_up_date, 'Mon DD, YYYY') || ' (in ' || days_left || ' days).'
    END;
    -- 'warning' for the exact day (needs attention now), 'info' for the
    -- lead-up days — matches the type vocabulary notifications.type
    -- already enforces ('info','success','warning','danger').
    ntype := CASE WHEN days_left = 0 THEN 'warning' ELSE 'info' END;

    IF NOT EXISTS (
      SELECT 1 FROM notifications WHERE user_id = c.patient_id AND message = msg
    ) THEN
      -- module = '/dashboard': the only patient-facing route today, and
      -- exactly where the existing follow-up status card already lives
      -- (PatientDashboardPage.jsx) — clicking the notification lands
      -- the patient right next to the same information, not a dead end.
      INSERT INTO notifications (user_id, message, type, module)
      VALUES (c.patient_id, msg, ntype, '/dashboard');
    END IF;
  END LOOP;
END;
$$;
GRANT EXECUTE ON FUNCTION run_followup_reminder_check() TO authenticated;

-- Optional: schedule it daily via pg_cron, if that extension is
-- available on this project (same guarded attempt as migration 018).
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  PERFORM cron.schedule('followup-reminder-check', '0 6 * * *', 'SELECT run_followup_reminder_check();');
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron scheduling skipped (extension unavailable on this project): %', SQLERRM;
END;
$$;

-- ============================================================================
-- End of migration 054.
-- ============================================================================