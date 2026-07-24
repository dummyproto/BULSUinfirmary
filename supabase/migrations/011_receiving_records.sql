-- ============================================================================
-- MIGRATION 011 — Receiving Records (Phase 6)
-- ============================================================================
-- A receiving record is the immutable "what was actually received" event
-- (a goods-received note) — deliberately a SEPARATE table from
-- medicine_batches, not additional columns on it. Reasoning: a batch's
-- `quantity` is mutable (it decreases as stock is released via FIFO), so
-- extending medicine_batches directly would lose the original received
-- quantity the moment any of it was dispensed. receiving_records preserves
-- the historical event; medicine_batches keeps tracking current on-hand
-- state, exactly as it already did in Phase 2-5.
--
-- Relationship: one receiving record automatically creates exactly one
-- medicine_batches row (application layer, medicineService.js) — never
-- the other way around, and editing a receiving record updates that same
-- linked batch (by quantity DELTA, not overwrite) rather than ever
-- creating a second batch or a second record.
-- ============================================================================

CREATE TABLE receiving_records (
    receiving_record_id  SERIAL PRIMARY KEY,
    medicine_id           INTEGER NOT NULL REFERENCES medicines(medicine_id) ON DELETE CASCADE,
    medicine_batch_id      INTEGER NOT NULL REFERENCES medicine_batches(medicine_batch_id) ON DELETE CASCADE,
    supplier_id             INTEGER REFERENCES suppliers(supplier_id) ON DELETE RESTRICT,
    invoice_number            VARCHAR(100),
    purchase_reference          VARCHAR(100),
    quantity                     INTEGER NOT NULL CHECK (quantity > 0),  -- original received quantity — never changed except via an explicit edit
    received_date                 DATE NOT NULL,
    received_by                    INTEGER NOT NULL REFERENCES users(user_id),
    remarks                          TEXT,
    created_at                        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                         TIMESTAMPTZ
);
CREATE INDEX idx_receiving_medicine ON receiving_records(medicine_id);
CREATE INDEX idx_receiving_batch ON receiving_records(medicine_batch_id);
CREATE INDEX idx_receiving_supplier ON receiving_records(supplier_id);
CREATE INDEX idx_receiving_received_by ON receiving_records(received_by);
CREATE INDEX idx_receiving_date ON receiving_records(received_date);

ALTER TABLE receiving_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY receiving_records_all ON receiving_records FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

-- ============================================================================
-- End of migration 011.
-- ============================================================================
