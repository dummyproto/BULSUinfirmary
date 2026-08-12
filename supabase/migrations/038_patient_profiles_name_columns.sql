-- ============================================================================
-- MIGRATION 038 — Ensure patient_profiles.surname / given_name Exist
-- ============================================================================
-- Every registration path in the app (self-registration via RegisterModal,
-- and admin-created accounts via Maintenance -> Add User) has always
-- attempted to write BOTH `surname` and `given_name` to patient_profiles,
-- and every read path (flattenUser, ProfilePage) has always attempted to
-- read both back. But no migration in this project ever actually CREATED
-- these columns — patient_profiles itself predates the migrations folder
-- (created directly via Supabase Studio, like several other core tables),
-- and it's evidently missing given_name specifically: surname reliably
-- saves and displays correctly, given_name has never worked for ANY
-- account, old or freshly registered — the signature of a genuinely
-- missing column rather than an application bug (an app-level bug would
-- be flaky/conditional, not "always blank, no matter what").
--
-- IF NOT EXISTS on both columns makes this safe to run regardless of
-- which one(s) actually turn out to be missing.
-- ============================================================================

ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS surname VARCHAR(50),
  ADD COLUMN IF NOT EXISTS given_name VARCHAR(50);

-- ============================================================================
-- End of migration 038.
-- ============================================================================
