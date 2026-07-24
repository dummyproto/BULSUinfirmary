-- ============================================================================
-- MIGRATION 017 — Inventory Notifications (Notification System, Phase 2)
-- ============================================================================
-- A dedicated table, not a duplication of the existing general
-- `notifications` table — that table has no medicine_id/batch_id FK, so
-- it structurally cannot support "clicking a notification opens the
-- related record" or "filter by type" (no categorical type field, only
-- a severity `type`). See the Phase 1 analysis for the full reasoning.
--
-- No inventory data is duplicated here — no quantity/name columns, only
-- FK references plus human-readable title/message text, the same
-- "denormalized text snapshot + live FK for structure" pattern already
-- used by consultation_medications/inventory_logs.
-- ============================================================================

CREATE TABLE inventory_notifications (
    id                 SERIAL PRIMARY KEY,
    notification_type  VARCHAR(30) NOT NULL CHECK (notification_type IN (
                          'low_stock', 'critical_stock', 'out_of_stock',
                          'expiring_90', 'expiring_60', 'expiring_30', 'expiring_7', 'expired',
                          'received', 'released', 'damaged', 'adjustment', 'archived'
                        )),
    medicine_id        INTEGER REFERENCES medicines(medicine_id) ON DELETE SET NULL,
    batch_id           INTEGER REFERENCES medicine_batches(medicine_batch_id) ON DELETE SET NULL,
    title              VARCHAR(150) NOT NULL,
    message            TEXT NOT NULL,
    priority           VARCHAR(10) NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
    is_read            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         INTEGER REFERENCES users(user_id)  -- nullable: NULL = system-generated (trigger / automated check), not a person
);

CREATE INDEX idx_invnotif_medicine ON inventory_notifications(medicine_id);
CREATE INDEX idx_invnotif_batch ON inventory_notifications(batch_id);
CREATE INDEX idx_invnotif_type ON inventory_notifications(notification_type);
CREATE INDEX idx_invnotif_unread ON inventory_notifications(is_read);
CREATE INDEX idx_invnotif_created_at ON inventory_notifications(created_at);
-- Composite index supporting the duplicate-prevention check specifically
-- (find an existing unread alert of this type for this medicine) — the
-- one query this whole system runs before every single insert.
CREATE INDEX idx_invnotif_dedup ON inventory_notifications(medicine_id, notification_type, is_read);

ALTER TABLE inventory_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY inventory_notifications_all ON inventory_notifications FOR ALL TO authenticated
  USING (current_app_role() IN ('admin', 'staff'))
  WITH CHECK (current_app_role() IN ('admin', 'staff'));

-- ============================================================================
-- End of migration 017.
-- ============================================================================
