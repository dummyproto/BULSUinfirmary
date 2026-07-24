-- ============================================================================
-- MIGRATION 007 — Medicine Normalization (suppliers / medicines / medicine_batches)
-- ============================================================================
-- Scope: this normalizes MEDICINE specifically, not the whole `inventory`
-- table. Supply and Equipment items are untouched — they stay in the
-- existing `inventory`/`inventory_batches` tables, which this migration
-- does not drop, rename, or modify the data of. See the Phase 2 analysis
-- for the full reasoning.
--
-- This is a STAGED, NON-DESTRUCTIVE migration:
--   1. Create the new tables.
--   2. Copy existing category='Medicine' rows from `inventory` /
--      `inventory_batches` into the new structure.
--   3. Leave the old tables fully intact — the current UI still reads and
--      writes them and keeps working exactly as before. Cutting the
--      interface over to the new tables is a later phase.
--
-- `legacy_inventory_id` / `legacy_batch_id` are migration-tracking bridge
-- columns only (nullable, not a real business field) — they let a later
-- phase safely map old records to new ones during interface cutover, and
-- let you verify the migration copied everything correctly. Safe to drop
-- once that cutover is complete and verified.
-- ============================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 1. SUPPLIERS
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE suppliers (
    supplier_id     SERIAL PRIMARY KEY,
    supplier_name   VARCHAR(150) NOT NULL,
    contact_person  VARCHAR(150),
    phone           VARCHAR(20),
    email           VARCHAR(150),
    address         VARCHAR(255),
    remarks         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ
);
CREATE INDEX idx_suppliers_name ON suppliers(supplier_name);


-- ─────────────────────────────────────────────────────────────────────────
-- 2. MEDICINES  (permanent/reference information only — no quantity here)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE medicines (
    medicine_id          SERIAL PRIMARY KEY,
    medicine_name        VARCHAR(150) NOT NULL,
    generic_name         VARCHAR(150),
    brand_name           VARCHAR(150),
    dosage               VARCHAR(50),               -- e.g. "500mg", "10ml"
    strength             VARCHAR(50),                -- e.g. "500mg/tablet"
    form                 VARCHAR(50),                 -- Tablet, Capsule, Syrup, Injection, Ointment, ...
    category             VARCHAR(50),                  -- pharmacological class, e.g. Analgesic, Antibiotic — open text, not a fixed list
    storage_requirement  VARCHAR(150),                  -- e.g. "Store below 25°C", "Refrigerate"
    description          TEXT,
    image_url            TEXT,                          -- consistent with users.profile_img_url's TEXT-column pattern
    active               BOOLEAN NOT NULL DEFAULT TRUE,  -- soft-deactivation, same pattern as users.is_active
    legacy_inventory_id  INTEGER,                         -- migration bridge only, see header note
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ
);
CREATE INDEX idx_medicines_name ON medicines(medicine_name);
CREATE INDEX idx_medicines_active ON medicines(active);
CREATE INDEX idx_medicines_legacy ON medicines(legacy_inventory_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 3. MEDICINE BATCHES  (one medicine has many batches; this is where all
--    quantity/expiry/cost data actually lives)
-- ─────────────────────────────────────────────────────────────────────────
CREATE TABLE medicine_batches (
    medicine_batch_id   SERIAL PRIMARY KEY,
    medicine_id         INTEGER NOT NULL REFERENCES medicines(medicine_id) ON DELETE CASCADE,
    batch_number        VARCHAR(50) NOT NULL,          -- internal/clinic batch tracking number
    lot_number          VARCHAR(50),                     -- manufacturer's lot number (distinct from batch_number)
    supplier_id         INTEGER REFERENCES suppliers(supplier_id),
    received_date       DATE,
    expiration_date     DATE,
    quantity            INTEGER NOT NULL DEFAULT 0,
    unit_cost           NUMERIC(10,2),                    -- per-unit cost at time of purchase
    purchase_reference  VARCHAR(100),                       -- PO number / invoice reference
    status              VARCHAR(20) NOT NULL DEFAULT 'Active'
                         CHECK (status IN ('Active', 'Depleted', 'Expired', 'Recalled', 'On Hold')),
    legacy_batch_id     INTEGER,                              -- migration bridge only, see header note
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ
);
CREATE INDEX idx_medbatch_medicine ON medicine_batches(medicine_id);
CREATE INDEX idx_medbatch_supplier ON medicine_batches(supplier_id);
CREATE INDEX idx_medbatch_expiration ON medicine_batches(expiration_date);
CREATE INDEX idx_medbatch_batch_number ON medicine_batches(batch_number);
CREATE INDEX idx_medbatch_legacy ON medicine_batches(legacy_batch_id);


-- ─────────────────────────────────────────────────────────────────────────
-- 4. UPDATE EXISTING TABLES' FOREIGN KEYS (additive, nullable — old columns
--    and existing rows are untouched, existing INSERTs/UPDATEs still work
--    exactly as before)
-- ─────────────────────────────────────────────────────────────────────────

-- inventory_logs — this IS the "Inventory Movement" table from the
-- relationship diagram. Gains the ability to log against the new
-- structure without needing a second, duplicate movement table.
ALTER TABLE inventory_logs ALTER COLUMN inventory_id DROP NOT NULL;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS medicine_id INTEGER REFERENCES medicines(medicine_id) ON DELETE SET NULL;
ALTER TABLE inventory_logs ADD COLUMN IF NOT EXISTS medicine_batch_id INTEGER REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL;
ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_has_subject
  CHECK (inventory_id IS NOT NULL OR medicine_id IS NOT NULL);
CREATE INDEX idx_invlog_staff ON inventory_logs(staff_id);
CREATE INDEX idx_invlog_medicine ON inventory_logs(medicine_id);
CREATE INDEX idx_invlog_medbatch ON inventory_logs(medicine_batch_id);

-- consultation_medications — medicine dispensing can (later) point at the
-- normalized tables instead of/alongside the generic inventory row.
ALTER TABLE consultation_medications ADD COLUMN IF NOT EXISTS medicine_id INTEGER REFERENCES medicines(medicine_id);
ALTER TABLE consultation_medications ADD COLUMN IF NOT EXISTS medicine_batch_id INTEGER REFERENCES medicine_batches(medicine_batch_id);
CREATE INDEX idx_consmed_medicine ON consultation_medications(medicine_id);

-- scan_history — also flagged as missing this in the Phase 1 analysis;
-- fixing it here since it's the same category of change and touches the
-- same tables.
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS inventory_id INTEGER REFERENCES inventory(inventory_id) ON DELETE SET NULL;
ALTER TABLE scan_history ADD COLUMN IF NOT EXISTS medicine_id INTEGER REFERENCES medicines(medicine_id) ON DELETE SET NULL;
CREATE INDEX idx_scanhist_scanned_by ON scan_history(scanned_by);
CREATE INDEX idx_scanhist_inventory ON scan_history(inventory_id);


-- ============================================================================
-- 5. DATA MIGRATION — copy existing Medicine-category rows into the new
--    structure. Purely additive: nothing is deleted or modified in
--    `inventory` / `inventory_batches`.
-- ============================================================================

-- 5a. Suppliers — every distinct, non-blank supplier name currently used
-- by a Medicine-category item or its batches.
INSERT INTO suppliers (supplier_name)
SELECT DISTINCT TRIM(supplier)
FROM (
    SELECT supplier FROM inventory WHERE category = 'Medicine' AND supplier IS NOT NULL AND TRIM(supplier) <> ''
    UNION
    SELECT ib.supplier FROM inventory_batches ib
      JOIN inventory i ON i.inventory_id = ib.inventory_id
      WHERE i.category = 'Medicine' AND ib.supplier IS NOT NULL AND TRIM(ib.supplier) <> ''
) s
WHERE NOT EXISTS (SELECT 1 FROM suppliers WHERE supplier_name = TRIM(s.supplier));

-- 5b. Medicines — one row per existing Medicine-category inventory item.
-- Fields the old schema never captured (generic_name, brand_name, dosage,
-- strength, form, storage_requirement, description, image) come across
-- as NULL — there's no source data for them; fill them in via the
-- Phase 3 interface once it exists.
INSERT INTO medicines (medicine_name, active, legacy_inventory_id, created_at)
SELECT name, TRUE, inventory_id, COALESCE(created_at, now())
FROM inventory
WHERE category = 'Medicine'
  AND NOT EXISTS (SELECT 1 FROM medicines WHERE legacy_inventory_id = inventory.inventory_id);

-- 5c. Medicine batches — copy every existing inventory_batches row
-- belonging to a migrated medicine.
INSERT INTO medicine_batches (medicine_id, batch_number, supplier_id, received_date, expiration_date, quantity, status, legacy_batch_id, created_at)
SELECT
    m.medicine_id,
    ib.batch_code,
    sup.supplier_id,
    ib.received_date,
    ib.expiration_date,
    ib.quantity,
    CASE
        WHEN ib.expiration_date IS NOT NULL AND ib.expiration_date < CURRENT_DATE THEN 'Expired'
        WHEN ib.quantity <= 0 THEN 'Depleted'
        ELSE 'Active'
    END,
    ib.batch_id,
    COALESCE(ib.created_at, now())
FROM inventory_batches ib
JOIN inventory i ON i.inventory_id = ib.inventory_id AND i.category = 'Medicine'
JOIN medicines m ON m.legacy_inventory_id = ib.inventory_id
LEFT JOIN suppliers sup ON sup.supplier_name = TRIM(ib.supplier)
WHERE NOT EXISTS (SELECT 1 FROM medicine_batches WHERE legacy_batch_id = ib.batch_id);

-- 5d. Synthesize an implicit batch for migrated medicines that have real
-- on-hand quantity but no rows in inventory_batches at all (i.e. they
-- were never tracked via the Batches tab, only via the Items tab's
-- aggregate quantity) — otherwise their quantity would be silently lost
-- in the new structure, since medicine_batches is the only place
-- quantity lives now.
INSERT INTO medicine_batches (medicine_id, batch_number, supplier_id, received_date, expiration_date, quantity, status, legacy_batch_id, created_at)
SELECT
    m.medicine_id,
    COALESCE(i.batch_no, 'LEGACY-' || i.inventory_id),
    sup.supplier_id,
    i.received_date,
    i.expiration_date,
    i.quantity,
    CASE
        WHEN i.expiration_date IS NOT NULL AND i.expiration_date < CURRENT_DATE THEN 'Expired'
        WHEN i.quantity <= 0 THEN 'Depleted'
        ELSE 'Active'
    END,
    NULL,
    COALESCE(i.created_at, now())
FROM inventory i
JOIN medicines m ON m.legacy_inventory_id = i.inventory_id
LEFT JOIN suppliers sup ON sup.supplier_name = TRIM(i.supplier)
WHERE i.category = 'Medicine'
  AND i.quantity > 0
  AND NOT EXISTS (SELECT 1 FROM inventory_batches WHERE inventory_id = i.inventory_id);


-- ============================================================================
-- ROW LEVEL SECURITY — same pattern as inventory/inventory_batches
-- (staff/admin manage it, patients never see it).
-- ============================================================================

ALTER TABLE suppliers ENABLE ROW LEVEL SECURITY;
CREATE POLICY suppliers_all ON suppliers FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

ALTER TABLE medicines ENABLE ROW LEVEL SECURITY;
CREATE POLICY medicines_all ON medicines FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

ALTER TABLE medicine_batches ENABLE ROW LEVEL SECURITY;
CREATE POLICY medicine_batches_all ON medicine_batches FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));


-- ============================================================================
-- Verification queries — run these after applying the migration.
-- ============================================================================
-- Row counts should match: every Medicine-category inventory item should
-- have exactly one medicines row.
--   SELECT count(*) FROM inventory WHERE category = 'Medicine';
--   SELECT count(*) FROM medicines WHERE legacy_inventory_id IS NOT NULL;
--
-- Total quantity should match (nothing lost in the copy):
--   SELECT sum(quantity) FROM inventory WHERE category = 'Medicine';
--   SELECT sum(quantity) FROM medicine_batches;
--
-- Every batch should have resolved a medicine_id (no orphans):
--   SELECT count(*) FROM medicine_batches WHERE medicine_id IS NULL;  -- should be 0 (medicine_id is NOT NULL anyway)

-- ============================================================================
-- End of migration 007.
-- ============================================================================
