-- 047_pin_login_staff_admin_qr.sql
--
-- The quick-login PIN (migration 045) is unlocked by scanning your own
-- "My QR Code" and having it successfully identify your account — see
-- LoginPage.jsx's handleIdentified(). lookup_email_by_school_id
-- (migration 002) only ever matched school_id_barcode, username, or a
-- patient's student_number. Staff/admin accounts have none of those
-- populated — their actual per-account identifier is
-- staff_profiles.staff_id_number (migration 036) — so scanning a
-- staff/admin account's own QR code silently failed to identify it at
-- all, meaning setting a PIN for those roles had no working scan step to
-- attach to. This adds that match, mirroring how patient_profiles is
-- already joined and checked below it.
CREATE OR REPLACE FUNCTION lookup_email_by_school_id(code TEXT)
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT u.email
  FROM users u
  LEFT JOIN patient_profiles pp ON pp.user_id = u.user_id
  LEFT JOIN staff_profiles sp ON sp.user_id = u.user_id
  WHERE u.is_active = true
    AND (
      upper(u.school_id_barcode) = upper(code)
      OR upper(u.username) = upper(code)
      OR upper(pp.student_number) = upper(code)
      OR upper(sp.staff_id_number) = upper(code)
    )
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION lookup_email_by_school_id(TEXT) TO anon, authenticated;