-- Feature: medicines with (therapeutic) categories, e.g. Antibiotic,
-- Analgesic/Antipyretic — the kind of grouping useful for "what do we have
-- for a fever" rather than just "what medicines do we have."
--
-- The `medicines` table has had a `category` column since migration 007
-- ("pharmacological class, e.g. Analgesic, Antibiotic — open text, not a
-- fixed list") — but no view or query anywhere in the app has ever
-- selected it. `medicine_inventory_view` (migration 013, the live
-- definition) hardcodes `'Medicine'::VARCHAR(20) AS category` for every
-- row — that's the top-level item TYPE (Medicine vs. Supply vs. Equipment)
-- the rest of the app already depends on for filtering/grouping/icons
-- everywhere, a completely different thing from a medicine's own
-- pharmacological class. The real column was simply never wired to
-- anything, not missing from the schema.
--
-- Exposed here as `medicine_category` (not `category`) specifically to
-- avoid colliding with that existing, load-bearing `category` = 'Medicine'
-- literal — aliasing the real column to the same name the view already
-- hardcodes something else under would have silently broken every
-- Medicine/Supply/Equipment filter in ItemsTab.jsx.
CREATE OR REPLACE VIEW medicine_inventory_view AS
SELECT
    m.medicine_id,
    m.medicine_name AS name,
    'Medicine'::VARCHAR(20) AS category,
    COALESCE((
        SELECT SUM(mb.quantity) FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id AND mb.status = 'Active'
    ), 0) AS quantity,
    m.unit,
    m.min_stock,
    (
        SELECT MIN(mb.expiration_date) FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id AND mb.status = 'Active' AND mb.expiration_date IS NOT NULL
    ) AS expiration_date,
    (
        SELECT mb.received_date FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS received_date,
    (
        SELECT mb.batch_number FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS batch_no,
    (
        SELECT mb.purchase_reference FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS purchase_reference,
    (
        SELECT s.supplier_name FROM medicine_batches mb
        LEFT JOIN suppliers s ON s.supplier_id = mb.supplier_id
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS supplier,
    (SELECT COUNT(*) FROM medicine_batches mb WHERE mb.medicine_id = m.medicine_id) AS batch_count,
    (
        SELECT mb.status FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS latest_batch_status,
    TRUE AS is_fifo,
    FALSE AS needs_maintenance,
    m.generic_name, m.brand_name, m.dosage, m.strength, m.form,
    m.storage_requirement, m.description, m.image_url,
    m.active, m.created_at, m.updated_at,
    -- Appended at the very end, not inserted next to `category` above —
    -- CREATE OR REPLACE VIEW only allows adding new columns at the end of
    -- the SELECT list. Putting it any earlier shifts every column after
    -- it over by one position, which Postgres reads as an attempt to
    -- RENAME each of those existing columns (this is exactly what
    -- produced "cannot change name of view column quantity to
    -- medicine_category" the first time this migration was written) —
    -- not an error about medicine_category itself at all.
    m.category AS medicine_category
FROM medicines m
WHERE m.active = TRUE;
GRANT SELECT ON medicine_inventory_view TO authenticated;

-- ============================================================================
-- End of migration.
-- ============================================================================