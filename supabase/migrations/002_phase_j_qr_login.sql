-- ============================================================================
-- PHASE J MIGRATION — QR/Barcode Login Lookup
-- ============================================================================
-- The original app had an `authenticateBySchoolIdCode()` function that
-- looked up a user by scanned code and logged them in directly — no
-- password check at all. It was also never actually wired to any UI (dead
-- code). That design only "worked" because the original had no real
-- backend auth (fake localStorage sessions). With real Supabase Auth,
-- logging someone in without verifying a password is a serious security
-- hole — anyone who saw/photographed another student's ID barcode could
-- log in as them.
--
-- This migration instead adds a narrow, safe RPC: given a scanned code, it
-- returns ONLY the matching account's email (never a session, never a
-- password, never any other field) so the login page can identify and
-- pre-fill the email field — the person still has to enter their real
-- password to actually sign in. Callable by anonymous visitors (SECURITY
-- DEFINER, since RLS otherwise blocks unauthenticated `users` reads
-- entirely, by design).
-- ============================================================================

CREATE OR REPLACE FUNCTION lookup_email_by_school_id(code TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.email
  FROM users u
  LEFT JOIN patient_profiles pp ON pp.user_id = u.user_id
  WHERE u.is_active = true
    AND (
      upper(u.school_id_barcode) = upper(code)
      OR upper(u.username) = upper(code)
      OR upper(pp.student_number) = upper(code)
    )
  LIMIT 1;
$$;

-- Anonymous (pre-login) AND authenticated callers both need this — it's
-- how the login page itself identifies who scanned in.
GRANT EXECUTE ON FUNCTION lookup_email_by_school_id(TEXT) TO anon, authenticated;

-- ============================================================================
-- End of Phase J migration.
-- ============================================================================
