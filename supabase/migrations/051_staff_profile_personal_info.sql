-- 051_staff_profile_personal_info.sql
--
-- staff_profiles previously only held department/position/staff_id_number
-- — patients have a much richer set of personal-info columns
-- (patient_profiles: date_of_birth, gender, civil_status, religion,
-- nationality, blood_type, address) with no staff/admin equivalent.
-- Adds the same set of columns here, so a staff or admin account can
-- have the same kind of "Personal Details" + "Address" information a
-- patient already can (see EditProfileModal.jsx's non-patient branch,
-- extended alongside this migration).

ALTER TABLE staff_profiles
  ADD COLUMN IF NOT EXISTS date_of_birth DATE,
  ADD COLUMN IF NOT EXISTS birth_place VARCHAR(100),
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS civil_status VARCHAR(20),
  ADD COLUMN IF NOT EXISTS religion VARCHAR(50),
  ADD COLUMN IF NOT EXISTS nationality VARCHAR(50),
  ADD COLUMN IF NOT EXISTS blood_type VARCHAR(5),
  ADD COLUMN IF NOT EXISTS addr_region VARCHAR(100),
  ADD COLUMN IF NOT EXISTS addr_province VARCHAR(100),
  ADD COLUMN IF NOT EXISTS addr_city VARCHAR(100),
  ADD COLUMN IF NOT EXISTS addr_barangay VARCHAR(100),
  ADD COLUMN IF NOT EXISTS addr_zip VARCHAR(10);