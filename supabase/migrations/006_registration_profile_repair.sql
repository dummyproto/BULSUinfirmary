-- ============================================================================
-- MIGRATION 006 — Registration & Profile-Edit Repair
-- ============================================================================
-- Two purposes:
--
-- 1. NEW: a narrow self-cleanup DELETE policy on `users`. Registration now
--    deletes its own `users` row if the follow-up `patient_profiles` insert
--    fails partway through (see usersService.js's finalizeSelfRegistration)
--    — otherwise a half-registered account would dangle forever (no
--    profile row) AND permanently block that email/username from ever
--    registering again. The existing `users_delete` policy only allows
--    admins to delete, so self-cleanup needs its own policy. It's scoped
--    tightly: a user may delete ONLY their own row, and ONLY if it has no
--    linked patient_profiles/staff_profiles row yet — a complete, real
--    account can never be self-deleted this way. Postgres OR's multiple
--    permissive policies for the same command together, so this is a
--    pure addition — the existing admin policy is untouched.
--
-- 2. REPAIR: idempotently re-creates (DROP + CREATE, safe to re-run) every
--    RLS policy that self-registration and profile-editing depend on,
--    exactly matching their intended final state from migrations 001 and
--    003. If you're seeing "can't save" on registration or profile edits
--    and the code looks right, the most common real-world cause is a live
--    project that's a step behind its migration history — this section
--    guarantees the live policies match the code regardless of which
--    earlier migrations actually got applied.
-- ============================================================================

-- ---------------------------------------------------------------- users ----
DROP POLICY IF EXISTS users_delete_own_incomplete ON users;
CREATE POLICY users_delete_own_incomplete ON users FOR DELETE TO authenticated
  USING (
    auth_user_id = auth.uid()
    AND NOT EXISTS (SELECT 1 FROM patient_profiles pp WHERE pp.user_id = users.user_id)
    AND NOT EXISTS (SELECT 1 FROM staff_profiles sp WHERE sp.user_id = users.user_id)
  );

-- Repair: self-registration insert (migration 003's intended final state).
DROP POLICY IF EXISTS users_insert ON users;
CREATE POLICY users_insert ON users FOR INSERT TO authenticated
  WITH CHECK (
    current_app_role() = 'admin'
    OR (auth_user_id = auth.uid() AND role = 'patient')
  );

-- Repair: a user updating their own row (profile edits, avatar, etc).
DROP POLICY IF EXISTS users_update ON users;
CREATE POLICY users_update ON users FOR UPDATE TO authenticated
  USING (auth_user_id = auth.uid() OR email = auth.email() OR current_app_role() = 'admin')
  WITH CHECK (auth_user_id = auth.uid() OR email = auth.email() OR current_app_role() = 'admin');

-- Repair: a user reading their own row (needed by both registration's
-- first-login linking AND every profile-page load).
DROP POLICY IF EXISTS users_select ON users;
CREATE POLICY users_select ON users FOR SELECT TO authenticated
  USING (
    auth_user_id = auth.uid()
    OR email = auth.email()
    OR current_app_role() IN ('admin', 'staff')
  );


-- ----------------------------------------------------- patient_profiles ----
-- Repair: a patient inserting (self-registration) or updating (profile
-- edits, family info) their own row.
DROP POLICY IF EXISTS patient_profiles_write ON patient_profiles;
CREATE POLICY patient_profiles_write ON patient_profiles FOR ALL TO authenticated
  USING (current_app_role() = 'admin' OR user_id = current_app_user_id())
  WITH CHECK (current_app_role() = 'admin' OR user_id = current_app_user_id());

DROP POLICY IF EXISTS patient_profiles_select ON patient_profiles;
CREATE POLICY patient_profiles_select ON patient_profiles FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));


-- ------------------------------------------------------- staff_profiles ----
DROP POLICY IF EXISTS staff_profiles_write ON staff_profiles;
CREATE POLICY staff_profiles_write ON staff_profiles FOR ALL TO authenticated
  USING (current_app_role() = 'admin' OR user_id = current_app_user_id())
  WITH CHECK (current_app_role() = 'admin' OR user_id = current_app_user_id());

DROP POLICY IF EXISTS staff_profiles_select ON staff_profiles;
CREATE POLICY staff_profiles_select ON staff_profiles FOR SELECT TO authenticated
  USING (user_id = current_app_user_id() OR current_app_role() IN ('admin', 'staff'));


-- ============================================================================
-- Quick self-check: run this after applying the migration, while logged in
-- as a real user via the app's own supabase client (NOT the SQL editor,
-- which runs as the Postgres superuser and bypasses RLS entirely — it
-- will "work" there even if the policy is broken). The easiest real check
-- is simply: register a brand new test account through the app UI, then:
--
--   SELECT user_id, email, auth_user_id FROM users ORDER BY user_id DESC LIMIT 1;
--   SELECT * FROM patient_profiles WHERE user_id = <that user_id>;
--
-- Both rows should exist. If only the first does, the patient_profiles
-- insert is still failing — check the Postgres logs (Dashboard → Logs →
-- Postgres) for the actual rejected statement and error.
-- ============================================================================
