-- ============================================================================
-- Migration 054: registration_source tracking for Bulk CSV Patient Import
--
-- Adds ONE nullable column to the existing `users` table — no new tables,
-- no change to any existing column, fully backward compatible. This is
-- what lets Administrator -> System Management -> User Management's new
-- "Active Students/Personnel" list show HOW an account was created
-- (self-registered / added one-by-one by an admin / bulk CSV import),
-- per the Bulk Patient Registration spec's requirement #10 ("View
-- registration/import information").
--
-- Existing rows are left NULL on purpose rather than backfilled with a
-- guess — this app has no reliable way to tell, after the fact, whether
-- a pre-existing account was self-registered or admin-added, and a wrong
-- guess is worse than an honest "Unknown" in the UI. Only NEWLY created
-- rows going forward get a real value, written by the application code:
--   - usersService.js's finalizeSelfRegistration()  -> 'self'
--   - usersService.js's createUserProfile() (default) -> 'admin_added'
--   - the new Bulk CSV Import flow (BulkImportModal.jsx) -> 'csv_import'
-- ============================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS registration_source VARCHAR(20)
    CHECK (registration_source IS NULL OR registration_source IN ('self', 'admin_added', 'csv_import'));

COMMENT ON COLUMN users.registration_source IS
  'How this account was created: self (self-registration), admin_added (Maintenance -> Add User, one at a time), csv_import (Bulk Patient Registration via CSV). NULL for accounts created before this column existed.';

-- ============================================================================
-- End of migration.
-- ============================================================================