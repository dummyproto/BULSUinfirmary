-- ============================================================================
-- MIGRATION 013 — Inventory Status Expansion (Phase 8)
-- ============================================================================
-- 1. 'Damaged' becomes a real, settable medicine_batches.status value —
--    previously Phase 7 only logged a "Damaged" movement type; nothing
--    ever actually left a batch in a queryable Damaged state. Now, when a
--    damage report consumes a batch's entire remaining quantity, its
--    status becomes 'Damaged' instead of the generic 'Depleted' — a
--    meaningful distinction (was this batch consumed normally, or ruined?)
--    that the application layer (medicineService.reportDamagedBatch) sets.
--
-- 2. medicine_inventory_view gains `latest_batch_status` — the aggregate
--    item-level status logic needs to know whether "zero quantity" means
--    "ran out normally" vs "everything was archived/damaged", which is
--    real batch-availability data, not something quantity/expiry alone
--    can tell you.
-- ============================================================================

ALTER TABLE medicine_batches DROP CONSTRAINT medicine_batches_status_check;
ALTER TABLE medicine_batches ADD CONSTRAINT medicine_batches_status_check
  CHECK (status IN ('Active', 'Depleted', 'Expired', 'Recalled', 'On Hold', 'Archived', 'Damaged'));

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
    -- Phase 8: most recent batch's status, so the aggregate item-level
    -- status logic can tell "ran out normally" apart from "everything
    -- was archived/damaged" — real batch-availability data.
    (
        SELECT mb.status FROM medicine_batches mb
        WHERE mb.medicine_id = m.medicine_id ORDER BY mb.created_at DESC, mb.medicine_batch_id DESC LIMIT 1
    ) AS latest_batch_status,
    TRUE AS is_fifo,
    FALSE AS needs_maintenance,
    m.generic_name, m.brand_name, m.dosage, m.strength, m.form,
    m.storage_requirement, m.description, m.image_url,
    m.active, m.created_at, m.updated_at
FROM medicines m
WHERE m.active = TRUE;
GRANT SELECT ON medicine_inventory_view TO authenticated;

-- ============================================================================
-- End of migration 013.
-- ============================================================================
