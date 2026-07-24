-- ============================================================================
-- MIGRATION 022 — Fix notifyIfNew's Broken Cross-Role Dedup Check
-- ============================================================================
-- Problem (confirmed via a real console error while testing emergency
-- alerts): notify()'s own INSERT ... .select().single() required the
-- CALLER to pass the notifications_select RLS policy on the row they just
-- created, using their own identity. That policy only allows reading rows
-- addressed to yourself (user_id = you) or your own role
-- (target_role = your role) — but the overwhelming majority of notify()
-- calls in this app are cross-role by design (a patient notifying staff,
-- an admin notifying one specific staff member, etc.), where the caller's
-- own identity never matches what they just inserted. In Postgres,
-- INSERT ... RETURNING is one atomic statement — when RLS blocks the
-- RETURNING read-back, the whole insert rolls back, not just the
-- returned data. Every cross-role notify() call was silently failing to
-- create the row at all. Fixed in the application layer (notify() no
-- longer requests the row back — see notificationsService.js).
--
-- notifyIfNew() has the same root cause in a different spot: its own
-- dedup-check SELECT (looking for an existing notification with the same
-- message before inserting a new one) is subject to the exact same RLS
-- policy, so it can never actually SEE a prior cross-role notification to
-- compare against — it silently concludes "no duplicate" every time,
-- defeating the dedup this function exists for. Unlike notify()'s bug,
-- this doesn't fail outright (the eventual insert still succeeds now that
-- notify() itself is fixed) — it just silently allows duplicates to
-- accumulate for any cross-role call, which is most of them.
--
-- Fixed with a narrow SECURITY DEFINER function — the same established
-- pattern already used elsewhere in this schema (current_app_role(),
-- search_patients_public) for a controlled bypass of RLS limited to
-- exactly one specific, safe check: does a matching notification already
-- exist. It exposes only a boolean, never row contents beyond what the
-- caller already knows (the message/target they're about to send).
-- ============================================================================

CREATE OR REPLACE FUNCTION notification_exists(p_message TEXT, p_user_id INTEGER, p_target_role TEXT)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM notifications
    WHERE message = p_message
      AND ((p_user_id IS NOT NULL AND user_id = p_user_id) OR (p_target_role IS NOT NULL AND target_role = p_target_role))
    LIMIT 1
  );
$$;
GRANT EXECUTE ON FUNCTION notification_exists(TEXT, INTEGER, TEXT) TO anon, authenticated;

-- ============================================================================
-- End of migration 022.
-- ============================================================================
