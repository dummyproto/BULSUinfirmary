-- ============================================================================
-- MIGRATION 043 — Block a Reporter From Sending a Second Emergency Alert
-- ============================================================================
-- Same reasoning as search_patients_public / check_student_number_registered:
-- emergency_alerts_select (base schema) only grants SELECT `TO authenticated`,
-- so a pre-login (anon) sender can't query the table directly to check
-- whether they already have an unresolved alert out there. This adds a
-- narrow SECURITY DEFINER RPC that answers exactly one yes/no question —
-- "does this reporter have an Active or Acknowledged alert right now?" —
-- without exposing anything else in the table to an anonymous caller.
--
-- Used by EmergencyReportModal to stop the SAME sender from submitting a
-- second alert (whether "For Myself" or "For Another Person") while their
-- previous one is still unresolved by clinic staff.
-- ============================================================================

CREATE OR REPLACE FUNCTION has_active_emergency_alert(p_reporter_id INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM emergency_alerts
    WHERE reported_by = p_reporter_id
      AND status IN ('Active', 'Acknowledged')
  );
$$;

GRANT EXECUTE ON FUNCTION has_active_emergency_alert(INTEGER) TO anon, authenticated;

-- ============================================================================
-- End of migration 043.
-- ============================================================================