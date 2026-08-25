-- 046_fix_pin_pgcrypto_schema.sql
--
-- Fixes "function gen_salt(unknown) does not exist" from 045_pin_login.sql.
-- On Supabase, the pgcrypto extension (crypt/gen_salt) is installed into
-- the `extensions` schema, not `public`. The functions created in 045 used
-- `SET search_path = public`, so crypt()/gen_salt() couldn't be resolved.
-- This migration redefines those functions with `extensions` added to the
-- search_path, without changing their signatures or behavior.

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

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

CREATE OR REPLACE FUNCTION verify_pin_hash(p_hash TEXT, p_pin TEXT) RETURNS BOOLEAN
  LANGUAGE sql STABLE SET search_path = public, extensions AS $$
  SELECT p_hash = crypt(p_pin, p_hash);
$$;

REVOKE ALL ON FUNCTION verify_pin_hash(TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION verify_pin_hash(TEXT, TEXT) TO service_role;