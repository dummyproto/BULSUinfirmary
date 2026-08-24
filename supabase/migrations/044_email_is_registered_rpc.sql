-- 044_email_is_registered_rpc.sql
--
-- ForgotPasswordModal.jsx needs to know whether an email actually belongs
-- to a registered account BEFORE sending a reset code, so it can stop and
-- show an error for one that doesn't — but the person is on the Forgot
-- Password screen precisely because they're NOT signed in yet, and
-- users_select (001_phase_a_schema_and_rls.sql) only allows SELECT
-- `TO authenticated`. A plain client-side query against `users` from an
-- anon session would just silently return zero rows every time
-- (RLS default-denies rather than erroring), regardless of whether the
-- account actually exists — useless for this check.
--
-- SECURITY DEFINER lets this one function bypass RLS internally (same
-- pattern as current_app_role()/current_app_user_id() in
-- 001_phase_a_schema_and_rls.sql) while still only ever returning a
-- single boolean — never anyone's name, role, or any other column — so
-- it can safely be granted to `anon` without exposing anything beyond
-- "does this email exist," which is the one bit of information this
-- feature explicitly needs to reveal pre-login.
CREATE OR REPLACE FUNCTION email_is_registered(p_email TEXT) RETURNS BOOLEAN
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM users WHERE lower(email) = lower(p_email));
$$;

GRANT EXECUTE ON FUNCTION email_is_registered(TEXT) TO anon, authenticated;