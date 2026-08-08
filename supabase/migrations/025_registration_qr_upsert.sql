-- Fixes registration_qr_codes never actually getting a row written.
--
-- claim_registration_qr (migration 023) only ever ran:
--   UPDATE registration_qr_codes SET is_used = true, ... WHERE code = p_code AND is_used = false
--
-- That function assumed rows would already exist from an admin seeding
-- flow — but per 023's own "NOTE ON SEEDING", that flow was never built.
-- Every registration since has therefore silently matched zero rows on
-- that UPDATE: no error (SQL doesn't raise on a zero-row UPDATE), just
-- nothing written. The table stayed empty regardless of how many people
-- registered via QR scan, since a pure UPDATE can never create a row.
--
-- Fixed by upserting instead: if the scanned code already exists as a
-- pre-seeded row (the case the original design was built for), it's
-- updated to used, exactly as before. If it doesn't exist yet (the
-- actual common case, with no seeding flow in place), a new row is
-- INSERTed from the registration data itself and marked used
-- immediately — so every scanned code now actually gets recorded,
-- instead of silently requiring a row that was never there to begin
-- with.

CREATE OR REPLACE FUNCTION claim_registration_qr(
  p_code TEXT,
  p_user_id INT,
  p_student_number TEXT DEFAULT NULL,
  p_full_name TEXT DEFAULT NULL,
  p_course TEXT DEFAULT NULL,
  p_year_level TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE registration_qr_codes
  SET is_used = true, used_by_user_id = p_user_id, used_at = now()
  WHERE upper(registration_qr_codes.code) = upper(p_code) AND is_used = false;

  IF NOT FOUND THEN
    -- No pre-seeded row for this code (the normal case right now) —
    -- insert one from the registration data instead, already marked
    -- used, so the scan is actually recorded rather than silently
    -- discarded. ON CONFLICT covers the narrow race where a row for
    -- this exact code appears between the UPDATE above and this
    -- INSERT (e.g. a duplicate scan submitted twice in quick
    -- succession) — falls back to the same "mark used" update rather
    -- than erroring on the UNIQUE(code) constraint.
    INSERT INTO registration_qr_codes (code, student_number, full_name, course, year_level, is_used, used_by_user_id, used_at)
    VALUES (p_code, p_student_number, p_full_name, p_course, p_year_level, true, p_user_id, now())
    ON CONFLICT (code) DO UPDATE
      SET is_used = true, used_by_user_id = p_user_id, used_at = now()
      WHERE registration_qr_codes.is_used = false;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_registration_qr(TEXT, INT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- The old 4-argument signature (TEXT, INT) is a separate overload in
-- Postgres, not replaced by the 6-argument version above — drop it so
-- old cached clients/PostgREST schema cache entries can't keep calling
-- the version that only ever ran the no-op UPDATE.
DROP FUNCTION IF EXISTS claim_registration_qr(TEXT, INT);