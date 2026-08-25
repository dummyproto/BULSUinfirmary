-- 045_pin_login.sql
--
-- Adds an optional 4-digit "quick login" PIN, set by the account owner in
-- Account Settings, as an alternative to typing a full password after
-- scanning their ID QR code at login. The PIN never replaces or weakens
-- the real Supabase Auth password — it's purely an extra, opt-in
-- shortcut layered on top for the QR-scan flow specifically.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS pin_hash TEXT,
  ADD COLUMN IF NOT EXISTS pin_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pin_locked_until TIMESTAMPTZ;

COMMENT ON COLUMN users.pin_hash IS
  'bcrypt hash (pgcrypto crypt()/gen_salt(''bf'')) of the account''s 4-digit quick-login PIN. Deliberately never included in the app''s normal SELECT_WITH_PROFILES query list — only ever written via set_own_pin()/clear_own_pin() below, and only ever read server-side by the verify-pin Edge Function (using the service role key, which bypasses RLS) via verify_pin_hash().';

-- ── Used from Account Settings, where the person IS already signed in ──

-- Lets a signed-in user set or replace their OWN PIN. SECURITY DEFINER
-- so it can write pin_hash even though it's excluded from the app's own
-- SELECT lists elsewhere — this is the one narrow, explicit path that's
-- allowed to touch it, rather than a raw UPDATE from client code.
CREATE OR REPLACE FUNCTION set_own_pin(p_pin TEXT) RETURNS VOID
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  IF p_pin !~ '^[0-9]{4}$' THEN
    RAISE EXCEPTION 'PIN must be exactly 4 digits';
  END IF;
  UPDATE users
  SET pin_hash = crypt(p_pin, gen_salt('bf')), pin_attempts = 0, pin_locked_until = NULL
  WHERE auth_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'No matching account for the current session';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION set_own_pin(TEXT) TO authenticated;

-- Lets Account Settings show "PIN is set" vs "no PIN set yet" without
-- ever exposing the hash itself to the client.
CREATE OR REPLACE FUNCTION has_own_pin() RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pin_hash IS NOT NULL FROM users WHERE auth_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION has_own_pin() TO authenticated;

-- Turns quick PIN login back off for the signed-in user's own account.
CREATE OR REPLACE FUNCTION clear_own_pin() RETURNS VOID
  LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE users SET pin_hash = NULL, pin_attempts = 0, pin_locked_until = NULL WHERE auth_user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION clear_own_pin() TO authenticated;

-- ── Used pre-login (no session yet) ──

-- Lets the Login page's QR-scan flow ask "does THIS email even have a
-- PIN set" before deciding whether to show a PIN pad or fall back to a
-- normal password field — called with no session yet, so this has to be
-- reachable by `anon`, and only ever reveals a boolean, nothing else.
CREATE OR REPLACE FUNCTION email_has_pin(p_email TEXT) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT pin_hash IS NOT NULL FROM users WHERE lower(email) = lower(p_email);
$$;

GRANT EXECUTE ON FUNCTION email_has_pin(TEXT) TO anon, authenticated;

-- The actual bcrypt comparison, kept as its own tiny function so the
-- verify-pin Edge Function (which runs the real login logic, rate
-- limiting, and lockout — see that function's own comments) never has
-- to see or handle the raw hash itself, just a yes/no. Deliberately NOT
-- granted to anon/authenticated — REVOKEd from PUBLIC and granted only
-- to service_role, so this can only ever be called using the service
-- role key from within the Edge Function, never directly by a client.
CREATE OR REPLACE FUNCTION verify_pin_hash(p_hash TEXT, p_pin TEXT) RETURNS BOOLEAN
  LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT p_hash = crypt(p_pin, p_hash);
$$;

REVOKE ALL ON FUNCTION verify_pin_hash(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_pin_hash(TEXT, TEXT) TO service_role;