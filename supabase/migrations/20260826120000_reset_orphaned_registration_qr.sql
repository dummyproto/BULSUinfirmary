-- ============================================================================
-- MIGRATION 048 — Repair Registration QR Codes Orphaned by Past Deletions
-- ============================================================================
-- Bug: registration_qr_codes.is_used (migration 023) is set true by
-- claim_registration_qr() when someone registers, but nothing ever reset it
-- back when that account was later deleted. users_delete cascades onto
-- used_by_user_id via ON DELETE SET NULL (migration 023's table
-- definition), which only clears WHO claimed the code — is_used stays
-- true forever. Net effect: deleting a patient permanently "burned" their
-- physical QR code; re-scanning (or manually entering) the exact same code
-- afterward always hit RegisterQrScan.jsx's "Your QR code is already
-- registered" message, even though the account it was tied to no longer
-- existed.
--
-- The `delete-user` Edge Function (supabase/functions/delete-user/) now
-- resets is_used/used_by_user_id/used_at for any FUTURE deletion — see its
-- step 4. That only runs at delete time, though, so it can't help accounts
-- that were already deleted before that fix existed. This migration is the
-- one-time backfill for those: any row that is is_used = true with
-- used_by_user_id already NULL can only have gotten into that state via the
-- ON DELETE SET NULL cascade described above (claim_registration_qr always
-- sets both columns together in the same UPDATE, so a legitimately-claimed,
-- still-owned code is never is_used = true with a NULL used_by_user_id) —
-- making this a safe, precisely-targeted repair rather than a blanket reset.
-- ============================================================================

UPDATE registration_qr_codes
SET is_used = false,
    used_at = NULL
WHERE is_used = true
  AND used_by_user_id IS NULL;