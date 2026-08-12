-- ============================================================================
-- MIGRATION 039 — Ensure Remaining patient_profiles Columns Exist
-- ============================================================================
-- Migration 038 found that patient_profiles.given_name was referenced
-- throughout the application code but never actually created by any
-- migration (the table predates this project's migrations folder,
-- created directly via Supabase Studio). That same gap plausibly applies
-- to every OTHER column ProfilePage.jsx's handleSaveProfile() writes to
-- in that same single .update() call — none of them appear in any
-- migration either. A single UPDATE statement referencing even one
-- column that doesn't exist fails ATOMICALLY: the whole statement is
-- rejected, not just that one field — so if any ONE of these was
-- missing, editing ANY field in Personal Info (name, address, birth
-- date, blood type, etc.) would silently fail together, which matches
-- "editing personal info doesn't persist" as a broad symptom rather
-- than one specific field.
--
-- IF NOT EXISTS on every column makes this safe regardless of which
-- ones (if any) turn out to already exist.
-- ============================================================================

ALTER TABLE patient_profiles
  ADD COLUMN IF NOT EXISTS middle_initial TEXT,
  ADD COLUMN IF NOT EXISTS suffix TEXT,
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS birth_place TEXT,
  ADD COLUMN IF NOT EXISTS gender TEXT,
  ADD COLUMN IF NOT EXISTS civil_status TEXT,
  ADD COLUMN IF NOT EXISTS religion TEXT,
  ADD COLUMN IF NOT EXISTS nationality TEXT,
  ADD COLUMN IF NOT EXISTS blood_type TEXT,
  ADD COLUMN IF NOT EXISTS addr_region TEXT,
  ADD COLUMN IF NOT EXISTS addr_province TEXT,
  ADD COLUMN IF NOT EXISTS addr_city TEXT,
  ADD COLUMN IF NOT EXISTS addr_barangay TEXT,
  ADD COLUMN IF NOT EXISTS addr_zip TEXT;

-- ============================================================================
-- End of migration 039.
-- ============================================================================
