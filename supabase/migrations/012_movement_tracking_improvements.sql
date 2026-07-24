-- ============================================================================
-- MIGRATION 012 — Inventory Movement Tracking Improvements (Phase 7)
-- ============================================================================
-- 1. previous_quantity / new_quantity — every movement should record the
--    before/after state, not just the delta (quantity_change already
--    covered that). Left NULL for existing rows on purpose: fabricating
--    reconstructed before/after values for historical entries that never
--    captured them would mean rewriting history with estimates, which is
--    the opposite of "do not delete movement history." New rows from
--    this point on always populate both.
--
-- 2. action_type — widened to add the canonical set this phase requires
--    (Received, Released, Damaged, Expired, Archived; Adjustment already
--    existed). The legacy values (Replenish, Release, Remove Expired,
--    Edit, Merge, Removed, Maintained, Maintenance Hold) are KEPT, not
--    removed — Supply/Equipment (the legacy, non-normalized path) still
--    actively inserts some of these, and existing historical rows already
--    have them. Nothing is renamed retroactively; new Medicine-side
--    movements use the new canonical names going forward.
-- ============================================================================

ALTER TABLE inventory_logs ADD COLUMN previous_quantity INTEGER;
ALTER TABLE inventory_logs ADD COLUMN new_quantity INTEGER;

-- ── Bug fix found while implementing this phase ──
-- inventory_logs.inventory_id had NO ON DELETE clause at all (defaults
-- to NO ACTION/RESTRICT) — meaning deleteInventoryItem() would fail with
-- a foreign-key violation for ANY item that had ever been logged before
-- (which is virtually every real item — Add Item alone always logs an
-- initial-stock entry). The "Remove" action for Supply/Equipment items
-- has effectively been broken this whole time for anything beyond a
-- brand-new, never-touched item. Fixed the same way medicine_id/
-- medicine_batch_id already were (migration 007/008): ON DELETE SET
-- NULL. This satisfies "do not delete movement history" precisely — the
-- log ROW is never removed, it just loses its live link once the item
-- itself is gone, while `notes` (already updated at each call site to
-- include the item name explicitly) keeps the entry self-describing.
ALTER TABLE inventory_logs DROP CONSTRAINT inventory_logs_inventory_id_fkey;
ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_inventory_id_fkey
  FOREIGN KEY (inventory_id) REFERENCES inventory(inventory_id) ON DELETE SET NULL;

ALTER TABLE inventory_logs DROP CONSTRAINT inventory_logs_action_type_check;
ALTER TABLE inventory_logs ADD CONSTRAINT inventory_logs_action_type_check
  CHECK (action_type IN (
    -- canonical Phase 7 set
    'Received', 'Released', 'Adjustment', 'Damaged', 'Expired', 'Archived',
    -- legacy values — still used by the Supply/Equipment path and by
    -- existing historical rows; kept, not removed
    'Replenish', 'Release', 'Edit', 'Merge', 'Remove Expired', 'Removed',
    'Maintained', 'Maintenance Hold'
  ));

-- ============================================================================
-- End of migration 012.
-- ============================================================================
