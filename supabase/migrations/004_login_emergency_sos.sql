-- ============================================================================
-- PHASE (login SOS) MIGRATION — Pre-Login Emergency Alerts
-- ============================================================================
-- The original app's SOS button was available on the LOGIN SCREEN itself,
-- not just to logged-in patients — so a bystander (or a student who can't
-- or won't log in mid-emergency) can file a report naming any registered
-- patient as the reporter/subject, without authenticating first.
--
-- This is a genuine, deliberate tradeoff, not an oversight: allowing
-- anonymous writes to `emergency_alerts` is what the original always did
-- (it had no real auth at all), and it's what was explicitly asked for
-- here. It does open a spam/abuse vector — anyone, unauthenticated, can
-- file alerts naming a real student. If this goes to a real production
-- deployment, add rate-limiting and/or a CAPTCHA in front of this flow
-- (e.g. via a Supabase Edge Function fronting the insert instead of a
-- direct anon-role table write). Flagged in KNOWN_ISSUES.md too.
-- ============================================================================

-- Narrow, anonymous-callable patient search for the pre-login Emergency SOS
-- form only (reporter/affected-person picker when there's no session to
-- identify who's filling out the form — matches the original's pre-login
-- SOS button). Deliberately returns ONLY name + student_number, never
-- email/phone/course/etc — full patient listing/search must stay behind
-- authentication (see the Patients page and Maintenance, both
-- staff/admin-only). This is still a real information-exposure tradeoff:
-- anyone, unauthenticated, can search for a student's name by number or
-- vice versa. Flagged in KNOWN_ISSUES.md alongside the emergency_alerts
-- anonymous-insert tradeoff — same category of risk, same recommendation
-- (rate-limit/CAPTCHA before real production use).
CREATE OR REPLACE FUNCTION search_patients_public(query TEXT)
RETURNS TABLE(user_id INTEGER, name TEXT, student_number TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.user_id, u.name, pp.student_number
  FROM users u
  JOIN patient_profiles pp ON pp.user_id = u.user_id
  WHERE u.role = 'patient' AND u.is_active = true
    AND (u.name ILIKE '%' || query || '%' OR pp.student_number ILIKE '%' || query || '%')
  ORDER BY u.name
  LIMIT 8;
$$;
GRANT EXECUTE ON FUNCTION search_patients_public(TEXT) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION current_app_user_id() TO anon;
GRANT EXECUTE ON FUNCTION current_app_role() TO anon;

DROP POLICY IF EXISTS emergency_alerts_insert ON emergency_alerts;
CREATE POLICY emergency_alerts_insert ON emergency_alerts FOR INSERT TO anon, authenticated
  WITH CHECK (
    reported_by = current_app_user_id()   -- logged-in: must report as themselves
    OR current_app_user_id() IS NULL      -- pre-login (anon, or an unlinked edge case): reported_by is still
  );                                       -- enforced to be a real user via the table's own FK constraint

-- Notifications to staff/admin need to fire from a pre-login submission too.
DROP POLICY IF EXISTS notifications_insert ON notifications;
CREATE POLICY notifications_insert ON notifications FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Same idea as LOGIN_FAIL/LOGIN_BLOCKED audit entries in the original,
-- which were always written with a null userId — allow anonymous,
-- unattributed audit entries alongside the existing self-attributed case.
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO anon, authenticated
  WITH CHECK (
    current_app_role() IN ('admin', 'staff')
    OR user_id = current_app_user_id()
    OR (current_app_user_id() IS NULL AND user_id IS NULL)
  );

-- ============================================================================
-- End of migration.
-- ============================================================================
