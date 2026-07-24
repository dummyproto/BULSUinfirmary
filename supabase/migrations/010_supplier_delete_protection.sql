-- ============================================================================
-- MIGRATION 010 — Supplier Delete Protection (Phase 5)
-- ============================================================================
-- Tightens medicine_batches.supplier_id from ON DELETE SET NULL to ON
-- DELETE RESTRICT. Phase 2 chose SET NULL so deleting a supplier would
-- never break anything — but Phase 5 explicitly wants deletion of a
-- supplier still in use PREVENTED outright, not silently allowed with
-- references quietly nulled out. The application layer
-- (medicineService.deleteSupplier) already checks and blocks this with a
-- clear error message before ever reaching the database — this migration
-- adds the same guarantee at the DB level too, so it holds even for
-- direct API/SQL access that bypasses the application.
-- ============================================================================

ALTER TABLE medicine_batches DROP CONSTRAINT medicine_batches_supplier_id_fkey;
ALTER TABLE medicine_batches ADD CONSTRAINT medicine_batches_supplier_id_fkey
  FOREIGN KEY (supplier_id) REFERENCES suppliers(supplier_id) ON DELETE RESTRICT;

-- ============================================================================
-- End of migration 010.
-- ============================================================================
