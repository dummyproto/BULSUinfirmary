-- Adds a 5th staff_permissions flag (reset_reports) gating the Reports
-- page's "Reset" button for staff accounts. Admin can always use it.
--
-- No RLS policy needed here, unlike delete_logs (migrations 028/029) —
-- Reset only clears the report currently on screen and the date/type
-- filter fields; it never writes to the database (there's no "reports"
-- table at all, reports are computed live from other tables on demand
-- — see the schema note in ReportsPage.jsx). So this is purely a
-- client-side UI permission, checked in ReportsPage.jsx before showing
-- the button, with nothing for the database to enforce.

ALTER TABLE staff_permissions
  ADD COLUMN IF NOT EXISTS reset_reports BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN staff_permissions.reset_reports IS
  'Lets a staff account use the Reset button on the Reports page (clears the currently generated report and filter fields — no database write involved, since reports are computed live rather than stored). Admins can always use it regardless of this flag.';