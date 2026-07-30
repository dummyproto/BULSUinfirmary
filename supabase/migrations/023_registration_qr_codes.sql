-- ============================================================================
-- PHASE Q MIGRATION — Registration QR Codes
-- ============================================================================
-- Phase J (migration 002) already lets an EXISTING account's owner scan
-- their student ID to pre-fill the login email (password still required).
-- This migration is the registration-side counterpart: a place to persist
-- a scanned student-ID QR code and resolve it into prefill data (student
-- number, name, course) for someone who hasn't created an account yet.
--
-- Same security shape as `lookup_email_by_school_id`: a narrow SECURITY
-- DEFINER RPC returns only the columns a pre-login/anonymous caller needs,
-- never the whole row, and the table itself grants nothing directly to
-- `anon`/`authenticated` — all access goes through the RPCs below.
--
-- IMPORTANT — a scanned code still NEVER creates or logs into an account by
-- itself. It only prefills a form; `usersService.registerPatient()` (Phase
-- Q, application code) still requires the person to set a real password
-- through `supabase.auth.signUp()` before any account exists. That
-- constraint from migration 002 holds here too.
-- ============================================================================

CREATE TABLE registration_qr_codes (
  id               SERIAL PRIMARY KEY,
  code             TEXT NOT NULL UNIQUE,        -- normalized scanned value (see normalizeSchoolIdCode)
  student_number   TEXT,
  full_name        TEXT,
  course           TEXT,
  year_level       TEXT,
  raw_payload      JSONB,                       -- original decoded QR text, kept for debugging only
  is_used          BOOLEAN NOT NULL DEFAULT FALSE,
  used_by_user_id  INTEGER REFERENCES users(user_id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  used_at          TIMESTAMPTZ
);

CREATE INDEX idx_registration_qr_codes_code ON registration_qr_codes(upper(code));

ALTER TABLE registration_qr_codes ENABLE ROW LEVEL SECURITY;
-- No policies are created on purpose — RLS with zero policies denies ALL
-- direct table access (even to owners of a SECURITY DEFINER function's
-- calling role) except through functions below, which bypass RLS entirely
-- because SECURITY DEFINER functions run as their owner. This mirrors
-- migration 002/003's "RPC-only" pattern for tables anon/pre-login callers
-- must never query directly.

-- ----------------------------------------------------------------------------
-- lookup_registration_qr — resolve a scanned code into prefill data
-- ----------------------------------------------------------------------------
-- RESOLVED (see KNOWN_ISSUES.md "Phase Q" section): the original Phase 1
-- spec called for returning zero rows once `is_used = true`, but Phase 2's
-- UI needs to distinguish "already used" from "unknown/unseeded code" to
-- show its "This ID has already been registered" message. Per confirmed
-- decision, the row IS still returned when used (with `is_used = true`) so
-- the caller can tell the two cases apart. This still exposes nothing
-- beyond the same non-sensitive fields (student_number, full_name, course,
-- year_level, is_used) regardless of used state — no new information
-- leak versus the original design, just an added boolean the caller
-- already gets either way.
--
-- Parameter is `p_code`, not `code` — the table has a column literally
-- named `code`, so an unqualified `code` parameter is ambiguous to
-- Postgres inside the function body (raises "column reference is
-- ambiguous" at call time, not at CREATE time, so this was caught by
-- tracing the flow rather than by reading the SQL in isolation). The
-- `p_`-prefix convention sidesteps any future collision the same way.
CREATE OR REPLACE FUNCTION lookup_registration_qr(p_code TEXT)
RETURNS TABLE(student_number TEXT, full_name TEXT, course TEXT, year_level TEXT, is_used BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT r.student_number, r.full_name, r.course, r.year_level, r.is_used
  FROM registration_qr_codes r
  WHERE upper(r.code) = upper(p_code)
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION lookup_registration_qr(TEXT) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- claim_registration_qr — mark a code used once an account is created
-- ----------------------------------------------------------------------------
-- Called right after the new account's session exists (see
-- usersService.registerPatient()/finalizeSelfRegistration()), never before
-- — claiming requires a real user_id, which only exists post-signup.
-- Restricted to `authenticated` (an anonymous caller has no user_id to
-- claim with, and letting anon claim would let someone lock a code without
-- ever registering).
--
-- Parameter is `p_code` for the same ambiguous-column reason as
-- `lookup_registration_qr` above. `p_user_id` doesn't strictly need the
-- prefix (the column is `used_by_user_id`, not `user_id`) but is renamed
-- to match for consistency and to avoid relying on that column-naming
-- coincidence continuing to hold.
CREATE OR REPLACE FUNCTION claim_registration_qr(p_code TEXT, p_user_id INT)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE registration_qr_codes
  SET is_used = true, used_by_user_id = p_user_id, used_at = now()
  WHERE upper(registration_qr_codes.code) = upper(p_code) AND is_used = false;
$$;

GRANT EXECUTE ON FUNCTION claim_registration_qr(TEXT, INT) TO authenticated;

-- ============================================================================
-- NOTE ON SEEDING (see also KNOWN_ISSUES.md)
-- ============================================================================
-- This app has no admin UI or generation flow that CREATES rows in
-- `registration_qr_codes` yet — Phase Q only adds the lookup/claim/consume
-- machinery. Rows must be seeded manually (e.g. a one-off INSERT run by an
-- admin, or a future admin "print student ID QR" feature) until that gap is
-- closed. `RegisterQrScan.jsx` is written to degrade gracefully when a
-- scanned code isn't in this table yet (see Phase 2) rather than hard-
-- blocking registration on it, precisely because of this gap.
-- ============================================================================

-- ============================================================================
-- patient_profiles.profile_incomplete (Phase 4)
-- ============================================================================
-- Kept in this same file rather than a separate 024_...sql: it's a single
-- ALTER TABLE, directly related to (and only meaningful alongside) the
-- registration_qr_codes machinery above, and Phase Q's own migrations
-- aren't expected to be applied independently of each other. Split into
-- its own numbered migration instead if this file needs to be reverted
-- without touching the other.
--
-- Set true when a person completes registration via the Step 2 "Skip for
-- now" path (course/year left blank); flipped back to false once they
-- fill in the missing fields from their Profile page (Phase 5).
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS profile_incomplete BOOLEAN NOT NULL DEFAULT false;

-- ============================================================================
-- End of Phase Q migration.
-- ============================================================================
