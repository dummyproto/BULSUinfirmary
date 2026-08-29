-- 050_link_current_auth_user_rpc.sql
--
-- Creates link_current_auth_user(), which usersService.js's
-- linkAuthUserIfNeeded() has already been calling via supabase.rpc() —
-- but this function was never actually created anywhere in the
-- database. Without it existing, every attempt to repair a mismatched
-- users.auth_user_id (the exact scenario this function exists to fix)
-- has been silently failing, which is what's been causing
-- LOGIN_SUCCESS / LOGOUT / other self-written audit_logs inserts to
-- keep getting rejected with a 403 even for accounts that otherwise
-- load and display correctly (the profile can still be found via a
-- plain email lookup — see getUserByEmail — independently of whether
-- auth_user_id is actually correct).
--
-- Runs as SECURITY DEFINER so it can update the row even though the
-- calling session's own auth_user_id doesn't match it YET (that
-- mismatch is exactly the problem being fixed) — but it only ever
-- touches the ONE row whose email matches the CALLER'S OWN verified
-- Supabase Auth email, case-insensitively, so this can't be used to
-- hijack a different account.
CREATE OR REPLACE FUNCTION link_current_auth_user() RETURNS INTEGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_user_id INTEGER;
BEGIN
  IF auth.uid() IS NULL OR auth.email() IS NULL THEN
    RETURN NULL;
  END IF;

  UPDATE users
  SET auth_user_id = auth.uid()
  WHERE lower(email) = lower(auth.email())
    AND (auth_user_id IS NULL OR auth_user_id <> auth.uid())
  RETURNING user_id INTO v_user_id;

  -- Already correctly linked (UPDATE above matched zero rows because
  -- there was nothing to change) — still report the real user_id back
  -- to the caller instead of NULL, so linkAuthUserIfNeeded() doesn't
  -- mistake "already fine" for "no matching account exists at all".
  IF v_user_id IS NULL THEN
    SELECT user_id INTO v_user_id FROM users WHERE lower(email) = lower(auth.email());
  END IF;

  RETURN v_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION link_current_auth_user() TO authenticated;