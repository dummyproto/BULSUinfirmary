-- ============================================================================
-- PHASE K MIGRATION — Self-Registration RLS
-- ============================================================================
-- Phase A's `users_insert` policy only allowed admins to create new user
-- rows (written for Maintenance's "Add User" flow). Self-registration
-- (Phase K) needs a different case: a person who just created their own
-- Supabase Auth account via `supabase.auth.signUp()` needs to insert
-- their OWN `public.users` row to finish setting up their profile.
--
-- This widens the policy to also allow that specific, narrow case: an
-- authenticated caller inserting a row where `auth_user_id` matches their
-- own `auth.uid()` AND `role = 'patient'`. They can never use this to
-- create an admin/staff account, or an account "for" anyone else — both
-- of those still require an actual admin.
-- ============================================================================

DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (
    current_app_role() = 'admin'
    OR (auth_user_id = auth.uid() AND role = 'patient')
  );

-- Same idea for audit_logs — self-registration logs a REGISTER entry
-- attributed to the new user themselves, which the Phase A policy
-- (staff/admin only) didn't allow.
DROP POLICY IF EXISTS audit_logs_insert ON audit_logs;
CREATE POLICY audit_logs_insert ON audit_logs FOR INSERT TO authenticated
  WITH CHECK (
    current_app_role() IN ('admin', 'staff')
    OR user_id = current_app_user_id()
  );

-- ============================================================================
-- End of Phase K migration.
-- ============================================================================
