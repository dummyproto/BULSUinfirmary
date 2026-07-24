-- ============================================================================
-- MIGRATION 016 — Phase 12 Final Review Fixes
-- ============================================================================
-- consultation_medications.inventory_id had the same bug already found
-- and fixed for inventory_logs.inventory_id in Phase 7 (migration 012):
-- no ON DELETE clause at all (defaults to NO ACTION/RESTRICT), meaning
-- deleteInventoryItem() would fail with a foreign-key violation for any
-- Supply/Equipment item ever dispensed during a consultation. Missed at
-- the time because Phase 7's review was scoped to inventory_logs
-- specifically; caught now during the Phase 12 full-module review.
--
-- Fixed the same way: ON DELETE SET NULL. consultation_medications
-- already stores `item_name` as a denormalized snapshot at time of
-- dispensing, so the record stays fully readable even after the FK link
-- is gone — no data is lost, only the live join, exactly like the
-- inventory_logs fix.
-- ============================================================================

ALTER TABLE consultation_medications DROP CONSTRAINT consultation_medications_inventory_id_fkey;
ALTER TABLE consultation_medications ADD CONSTRAINT consultation_medications_inventory_id_fkey
  FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE SET NULL;

-- Three FK columns with no index at all, found by cross-checking every
-- FK against its index coverage — every other FK column in this schema
-- is indexed, these three were simply missed when each was added across
-- earlier phases.
CREATE INDEX IF NOT EXISTS idx_consmed_inventory ON consultation_medications(inventory_id);
CREATE INDEX IF NOT EXISTS idx_consmed_medbatch ON consultation_medications(medicine_batch_id);
CREATE INDEX IF NOT EXISTS idx_scanhist_medicine ON scan_history(medicine_id);

-- ============================================================================
-- End of migration 016.
-- ============================================================================
