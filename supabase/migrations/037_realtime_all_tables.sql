-- ============================================================================
-- MIGRATION 037 — Real-Time Updates App-Wide
-- ============================================================================
-- Migration 021 added emergency_alerts to the supabase_realtime publication
-- so staff/admin get SOS alerts instantly instead of waiting on a page
-- refresh. Every other table in the app was still "load once on mount, then
-- only your own actions update it" — a second person's edit (another admin
-- changing inventory, a staff member updating a document request, etc.)
-- never showed up for anyone else already on that page until they manually
-- reloaded. This closes that gap for the rest of the schema.
--
-- Views (medicine_inventory_view, equipment_inventory_view,
-- supply_inventory_view) are deliberately NOT listed — Postgres logical
-- replication (what the realtime publication is built on) only supports
-- adding real tables, never views. Subscribing to the view's own
-- underlying base tables (medicines/medicine_batches, equipment/
-- equipment_batches, supplies/supply_batches — all listed below) still
-- catches every change that would show up in the view, since nothing can
-- change the view's data without first changing one of those.
--
-- RLS still applies exactly as it does to normal queries — a realtime
-- subscription only ever delivers rows a given client's existing SELECT
-- policies already allow them to see. Nothing here changes access, only
-- delivery speed.
--
-- Same idempotency guard as 021: ALTER PUBLICATION ... ADD TABLE throws if
-- the table is already a member, which would break a re-run of this
-- migration otherwise.
-- ============================================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    -- Inventory (Medicine / Supply / Equipment — items, batches, suppliers,
    -- the legacy combined table, logs, and low-stock/expiry notifications)
    'inventory', 'inventory_batches', 'inventory_logs', 'inventory_notifications',
    'medicines', 'medicine_batches',
    'equipment', 'equipment_batches',
    'supplies', 'supply_batches',
    'suppliers', 'receiving_records', 'scan_history',

    -- User Management / Maintenance
    'users', 'staff_profiles', 'staff_permissions', 'patient_profiles',

    -- Consultations / EHR
    'consultations', 'diagnoses', 'consultation_medications',

    -- Document Requests
    'document_requests',

    -- Notifications bell + SMS log
    'notifications', 'sms_log',

    -- Chat (MediBot) — mainly benefits the same person with more than one
    -- tab/device open at once, same reasoning as the others
    'chat_conversations', 'chat_messages',

    -- Audit trail (System Maintenance / Reports)
    'audit_logs'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
    END IF;
  END LOOP;
END;
$$;

-- ============================================================================
-- End of migration 037.
-- ============================================================================
