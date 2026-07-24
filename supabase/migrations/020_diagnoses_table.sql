-- ============================================================================
-- MIGRATION 020 — Diagnoses Table (Phase 8)
-- ============================================================================
-- Problem (confirmed in code, ConsultationPage.jsx's own inline comment):
-- the diagnosis reference list (INITIAL_DIAGNOSIS_LIST /
-- INITIAL_DIAG_CATEGORIES in diagnosisData.js) was never backed by a real
-- table. "Add New Diagnosis" went through a real form and looked like it
-- persisted, but only ever mutated local React state — its own toast said
-- so directly ("added to diagnosis list (this session only)"). Gone on
-- refresh, never seen by any other user or device.
--
-- Schema: a single `category` text column, not a separate
-- diagnosis_categories lookup table. Verified first (not assumed) that
-- every one of the 67 existing diagnoses belongs to exactly one category
-- with no overlaps or orphans in either direction — categories here are
-- just a label with no additional metadata (no description, icon, sort
-- order, etc.), so a lookup table would be pure overhead for what a plain
-- column already models correctly, consistent with how every other
-- simple categorical column in this schema (inventory.category, etc.)
-- is already done.
--
-- name is UNIQUE — matches the existing implicit behavior (the old
-- client-side handleAddDiagnosis silently no-op'd on
-- diagnosisList.includes(name)), now enforced for real at the database
-- level instead of only by whichever client happens to have the full
-- list loaded in memory at the time.
-- ============================================================================

CREATE TABLE diagnoses (
    diagnosis_id SERIAL PRIMARY KEY,
    name         VARCHAR(150) NOT NULL UNIQUE,
    category     VARCHAR(50) NOT NULL DEFAULT 'Other',
    active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_diagnoses_category ON diagnoses(category);
CREATE INDEX idx_diagnoses_active ON diagnoses(active);

ALTER TABLE diagnoses ENABLE ROW LEVEL SECURITY;
-- Same staff/admin-only pattern as every other clinical/administrative
-- table (medicines, consultations, etc.) — diagnoses are only ever
-- selected by staff during a consultation, never by patients directly.
CREATE POLICY diagnoses_all ON diagnoses FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

-- One-time seed from the existing INITIAL_DIAGNOSIS_LIST /
-- INITIAL_DIAG_CATEGORIES entries, generated programmatically from the
-- real source file (diagnosisData.js) rather than hand-retyped, to
-- guarantee exact fidelity across all 67 rows. ON CONFLICT DO NOTHING
-- makes this safe to re-run.
INSERT INTO diagnoses (name, category) VALUES
  ('Abrasion (SRI)', 'Wounds & Injuries'),
  ('Blister', 'Wounds & Injuries'),
  ('Burn (Minor)', 'Wounds & Injuries'),
  ('Concussion', 'Wounds & Injuries'),
  ('Eye Trauma', 'Wounds & Injuries'),
  ('Fracture', 'Wounds & Injuries'),
  ('Head Trauma', 'Wounds & Injuries'),
  ('Incised Wound', 'Wounds & Injuries'),
  ('Infected Wound', 'Wounds & Injuries'),
  ('Lacerated Wound', 'Wounds & Injuries'),
  ('Punctured Wound', 'Wounds & Injuries'),
  ('Sprain (SRI)', 'Wounds & Injuries'),
  ('Strain', 'Wounds & Injuries'),
  ('Vascular Trauma', 'Wounds & Injuries'),
  ('Animal Bite/Scratch', 'Wounds & Injuries'),
  ('Insect Bite/Sting', 'Wounds & Injuries'),
  ('Bronchial Asthma', 'Respiratory'),
  ('Influenza', 'Respiratory'),
  ('Systemic Viral Infection (SVI) / Influenza', 'Respiratory'),
  ('Upper Respiratory Tract Infection (URTI)', 'Respiratory'),
  ('Hyperventilation', 'Respiratory'),
  ('Sinus Headache', 'Respiratory'),
  ('Acute Gastroenteritis', 'Gastrointestinal'),
  ('Cholelithiasis', 'Gastrointestinal'),
  ('Dyspepsia/Indigestion', 'Gastrointestinal'),
  ('Food Allergies', 'Gastrointestinal'),
  ('Gastroesophageal Reflux Disease (GERD)', 'Gastrointestinal'),
  ('Gastritis', 'Gastrointestinal'),
  ('Hyperacidity', 'Gastrointestinal'),
  ('Irritable Bowel Syndrome (IBS)', 'Gastrointestinal'),
  ('Lactose Intolerance', 'Gastrointestinal'),
  ('Stomachache', 'Gastrointestinal'),
  ('Anxiety Attack', 'Neurological'),
  ('Dizziness', 'Neurological'),
  ('Epilepsy', 'Neurological'),
  ('Fatigue', 'Neurological'),
  ('Headache', 'Neurological'),
  ('Migraine Headache', 'Neurological'),
  ('Syncope', 'Neurological'),
  ('Tension Headache', 'Neurological'),
  ('Vertigo', 'Neurological'),
  ('Heart Problem', 'Cardiovascular'),
  ('Hypertension', 'Cardiovascular'),
  ('Hypoglycemia', 'Cardiovascular'),
  ('Hypotension', 'Cardiovascular'),
  ('Arthritis', 'Musculoskeletal'),
  ('Muscle Spasm', 'Musculoskeletal'),
  ('Myalgia', 'Musculoskeletal'),
  ('Allergic Rhinitis', 'Skin & ENT'),
  ('Boil', 'Skin & ENT'),
  ('Conjunctivitis', 'Skin & ENT'),
  ('Ear Infection', 'Skin & ENT'),
  ('Eye Irritation', 'Skin & ENT'),
  ('Skin Allergy', 'Skin & ENT'),
  ('Skin Disease', 'Skin & ENT'),
  ('Stye', 'Skin & ENT'),
  ('Tooth Decay', 'Dental'),
  ('Tooth Filling', 'Dental'),
  ('Tooth Trauma', 'Dental'),
  ('Tooth Extraction', 'Dental'),
  ('Wisdom Tooth', 'Dental'),
  ('Dysmenorrhea', 'Reproductive'),
  ('Pregnant', 'Reproductive'),
  ('Derogation', 'Other'),
  ('Emergency Cases', 'Other'),
  ('Urinary Tract Infection', 'Other'),
  ('Others', 'Other')
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- End of migration 020.
-- ============================================================================
