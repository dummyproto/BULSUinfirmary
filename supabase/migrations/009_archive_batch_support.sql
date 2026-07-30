-- ============================================================================
-- MIGRATION 009 — Archive Batch Support (Phase 4)
-- ============================================================================
-- Adds 'Archived' as a valid medicine_batches.status value. Archiving is a
-- soft-removal — same reasoning as Phase 3's medicine soft-delete
-- (deactivateMedicine): a batch can be referenced by inventory_logs
-- (movement history) and consultation_medications (dispensing records),
-- so a hard DELETE would be destructive. Archiving removes it from active
-- stock/quantity calculations (medicine_inventory_view already only sums
-- status = 'Active' batches, so this needs no view change) while
-- preserving its full history. `deleteMedicineBatch` (a real hard delete)
-- remains available in the service layer for genuine mistakes — e.g. a
-- batch added in error with no real movement history yet — but Archive
-- is the normal, recommended path for "this batch is done, remove it
-- from the active list."
--
-- Constraint name: `status` was declared as an inline, unnamed CHECK on
-- medicine_batches — Postgres auto-names these `<table>_<column>_check`,
-- so `medicine_batches_status_check` is the real name (verified against
-- migration 007's DDL, not assumed).
-- ============================================================================

ALTER TABLE medicine_batches DROP CONSTRAINT medicine_batches_status_check;
ALTER TABLE medicine_batches ADD CONSTRAINT medicine_batches_status_check
  CHECK (status IN ('Active', 'Depleted', 'Expired', 'Recalled', 'On Hold', 'Archived'));

-- ============================================================================
-- End of migration 009.
-- ============================================================================
