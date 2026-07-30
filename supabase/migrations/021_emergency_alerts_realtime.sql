-- ============================================================================
-- MIGRATION 021 — Real-Time Emergency Alerting
-- ============================================================================
-- Problem (confirmed in code): a patient filing an SOS already generates a
-- notification-bell entry for staff/admin (see notify() calls in
-- EmergencyReportModal.jsx), but that's the only signal — it relies on
-- someone happening to be on a page that just did its route-change refresh,
-- or waiting up to 60 seconds for the bell's poll interval. There's also an
-- existing siren sound (src/lib/emergencySound.js, playEmergencySiren) but
-- it's only ever called for the PATIENT confirming their own submission —
-- never for staff/admin receiving one. No table in this project has ever
-- been added to Supabase's realtime publication, so even correct
-- client-side subscription code would receive nothing without this.
--
-- This adds emergency_alerts to the standard `supabase_realtime` publication
-- every Supabase project ships with, so staff/admin clients can subscribe to
-- INSERT events on this table directly (Postgres Changes), independent of
-- which page they're on and without any polling delay. RLS still applies —
-- emergency_alerts_select already scopes SELECT to
-- current_app_role() IN ('admin','staff') OR the involved patient, so a
-- realtime subscription naturally only delivers rows a given client is
-- actually allowed to see; no separate realtime-specific policy needed.
--
-- Wrapped in a DO block: ALTER PUBLICATION ... ADD TABLE throws if the table
-- is already a member, which would make this migration fail on a re-run —
-- checked against pg_publication_tables first instead of assuming.
-- ============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'emergency_alerts'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE emergency_alerts;
  END IF;
END;
$$;

-- ============================================================================
-- End of migration 021.
-- ============================================================================
