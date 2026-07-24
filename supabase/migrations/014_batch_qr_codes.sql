-- ============================================================================
-- MIGRATION 014 — Batch QR Codes (Phase 9)
-- ============================================================================
-- QR generation itself needs no schema change — a batch's QR payload is
-- generated on-demand from its live data (medicine name, batch number,
-- lot number, expiration, supplier, quantity), never stored as a static
-- image/string, so it always reflects current reality rather than a
-- stale snapshot.
--
-- What DOES need a schema change: scanning a batch's own QR code should
-- be recorded in the existing scan_history audit trail, linked to the
-- specific batch it identified — extending the same mechanism Phase 2
-- already built for inventory_id/medicine_id, rather than inventing a
-- separate log. Also widens `result` to distinguish "opened batch
-- details via QR" from the existing stock-in outcomes (Saved/Invalid/
-- Duplicate), which don't apply to a pure lookup.
-- ============================================================================

ALTER TABLE scan_history ADD COLUMN medicine_batch_id INTEGER REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL;
CREATE INDEX idx_scanhist_medicine_batch ON scan_history(medicine_batch_id);

ALTER TABLE scan_history DROP CONSTRAINT scan_history_result_check;
ALTER TABLE scan_history ADD CONSTRAINT scan_history_result_check
  CHECK (result IN ('Saved', 'Invalid', 'Duplicate', 'BatchView'));

-- ============================================================================
-- End of migration 014.
-- ============================================================================
