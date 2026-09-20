-- Adds a real, stored patient_type column ('student' | 'personnel') to
-- patient_profiles, instead of every caller independently re-deriving
-- it on the fly from the student_number pattern each time it's needed.
ALTER TABLE patient_profiles ADD COLUMN IF NOT EXISTS patient_type VARCHAR(20);

UPDATE patient_profiles
SET patient_type = CASE
  WHEN student_number ~ '^[A-Za-z]{2,6}[0-9]{4,10}$' THEN 'personnel'
  ELSE 'student'
END
WHERE patient_type IS NULL;

ALTER TABLE patient_profiles ALTER COLUMN patient_type SET DEFAULT 'student';
ALTER TABLE patient_profiles ALTER COLUMN patient_type SET NOT NULL;
ALTER TABLE patient_profiles ADD CONSTRAINT patient_profiles_patient_type_check CHECK (patient_type IN ('student', 'personnel'));

CREATE INDEX IF NOT EXISTS idx_patient_profiles_patient_type ON patient_profiles(patient_type);