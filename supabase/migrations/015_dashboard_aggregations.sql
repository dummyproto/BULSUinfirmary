-- ============================================================================
-- MIGRATION 015 — Inventory Dashboard Aggregations (Phase 10)
-- ============================================================================
-- "Optimize queries for performance" is the operative constraint here.
-- Simple per-item status counts (Low Stock, Critical Stock, Expired, Near
-- Expiry) are cheap to derive client-side from data the Inventory page
-- already has loaded (medicines is a small table — hundreds of rows at
-- most for a real clinic, not something worth a dedicated query). But
-- two of the required cards genuinely need database-side aggregation to
-- avoid scanning `inventory_logs`, which grows unbounded over time and
-- would be the wrong thing to pull in full just to reduce client-side:
--
-- 1. Monthly Inventory Movement — GROUP BY month
-- 2. Top Used Medicines — GROUP BY medicine, SUM, ORDER BY, LIMIT
--
-- Both are implemented as SQL functions (SECURITY INVOKER — the default
-- — so they run under the calling staff/admin user's own RLS, exactly
-- like every other query in this app; no elevated privileges needed).
-- Also adds an index inventory_logs.created_at didn't have yet, since
-- every one of these dashboard queries filters/orders by it.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_invlog_created_at ON inventory_logs(created_at);

-- Monthly received vs released totals for the last N months (default 6).
-- Covers BOTH the normalized Medicine action types (Received/Released)
-- and the legacy Supply/Equipment ones (Replenish/Release) — a complete
-- movement picture across the whole inventory, not just Medicine.
CREATE OR REPLACE FUNCTION get_monthly_inventory_movement(months_back INTEGER DEFAULT 6)
RETURNS TABLE(month DATE, received_qty BIGINT, released_qty BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    date_trunc('month', created_at)::date AS month,
    COALESCE(SUM(quantity_change) FILTER (WHERE action_type IN ('Received', 'Replenish') AND quantity_change > 0), 0) AS received_qty,
    COALESCE(SUM(ABS(quantity_change)) FILTER (WHERE action_type IN ('Released', 'Release')), 0) AS released_qty
  FROM inventory_logs
  WHERE created_at >= date_trunc('month', now()) - (months_back - 1) * INTERVAL '1 month'
  GROUP BY date_trunc('month', created_at)
  ORDER BY month;
$$;
GRANT EXECUTE ON FUNCTION get_monthly_inventory_movement(INTEGER) TO authenticated;

-- Top N medicines by total released quantity within the last D days
-- (default 30 days, top 5) — Medicine-only (Supply/Equipment don't have
-- a "most used medicine" concept), aggregated and limited entirely in
-- SQL so only the final ranked rows are ever transferred to the client.
CREATE OR REPLACE FUNCTION get_top_used_medicines(days_back INTEGER DEFAULT 30, result_limit INTEGER DEFAULT 5)
RETURNS TABLE(medicine_id INTEGER, medicine_name VARCHAR, total_released BIGINT)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.medicine_id,
    m.medicine_name,
    SUM(ABS(l.quantity_change)) AS total_released
  FROM inventory_logs l
  JOIN medicines m ON m.medicine_id = l.medicine_id
  WHERE l.action_type IN ('Released', 'Release')
    AND l.medicine_id IS NOT NULL
    AND l.created_at >= now() - (days_back || ' days')::INTERVAL
  GROUP BY m.medicine_id, m.medicine_name
  ORDER BY total_released DESC
  LIMIT result_limit;
$$;
GRANT EXECUTE ON FUNCTION get_top_used_medicines(INTEGER, INTEGER) TO authenticated;

-- ============================================================================
-- End of migration 015.
-- ============================================================================
