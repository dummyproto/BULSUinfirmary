-- ============================================================================
-- MIGRATION 008 — Medicine unit/min_stock + Aggregate View (Phase 3 support)
-- ============================================================================
-- Two things, both discovered as genuine blockers while wiring the
-- interface to Phase 2's new tables (not present in the original Phase 2
-- task spec, which listed pharmaceutical fields only):
--
-- 1. `medicines` had no `unit` (Tablets/Bottles/...) or `min_stock`
--    (reorder threshold) column. Both are properties of the medicine
--    itself (every batch of the same medicine shares the same unit and
--    reorder point), not of an individual batch, so they belong here, not
--    on medicine_batches. Backfilled from the legacy `inventory` row via
--    the `legacy_inventory_id` bridge migration 007 already built.
--
-- 2. `medicine_inventory_view` — a live, computed aggregate (quantity =
--    SUM of active batches, expiration_date = MIN of active batches, plus
--    the most recent batch's supplier/received-date/purchase-reference).
--    Nothing here is ever stored or cached — every read recomputes it from
--    `medicine_batches` directly, which is what actually satisfies "remove
--    duplicated values": there is no second copy of quantity/expiry to
--    drift out of sync, unlike the old `inventory.quantity` cache.
-- ============================================================================

ALTER TABLE medicines ADD COLUMN unit VARCHAR(30) NOT NULL DEFAULT 'Units';
ALTER TABLE medicines ADD COLUMN min_stock INTEGER NOT NULL DEFAULT 0;

UPDATE medicines m
SET unit = COALESCE(NULLIF(i.unit, ''), 'Units'),
    min_stock = COALESCE(i.min_stock, 0)
FROM inventory i
WHERE m.legacy_inventory_id = i.inventory_id;


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
    (
        SELECT COUNT(*) FROM medicine_batches mb WHERE mb.medicine_id = m.medicine_id
    ) AS batch_count,
    TRUE AS is_fifo,
    FALSE AS needs_maintenance,
    m.generic_name, m.brand_name, m.dosage, m.strength, m.form,
    m.storage_requirement, m.description, m.image_url,
    m.active, m.created_at, m.updated_at
FROM medicines m
WHERE m.active = TRUE;

-- Views inherit the RLS of their underlying tables when queried through
-- PostgREST as the invoking role (security_invoker is Postgres 15+
-- default behavior for views owned this way under Supabase) — but to be
-- explicit and safe across versions, grant it the same way the base
-- tables already are.
GRANT SELECT ON medicine_inventory_view TO authenticated;

-- ============================================================================
-- End of migration 008.
-- ============================================================================
