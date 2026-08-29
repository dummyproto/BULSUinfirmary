-- Bug: on the Authentication Logs tab (AuditTrailPage.jsx), filtering by
-- Staff or Patient showed NOTHING, even after those roles had genuinely
-- logged in, logged out, etc.
--
-- Root cause: migration 048's snapshot_audit_log_actor() trigger only
-- ever fills in actor_role by looking up `users` FROM `user_id` —
-- `IF NEW.user_id IS NOT NULL THEN ...`. Several real, legitimate auth
-- events are written with user_id deliberately left NULL — most
-- importantly LoginPage.jsx's failed-login-attempt logging (LOGIN_FAILED,
-- and the auto-DEACTIVATE_USER after repeated failures), which never
-- attaches a specific account on purpose (a wrong password shouldn't be
-- attributed to "this account" the way a successful, provably-owned
-- action is). Since actor_role stayed NULL for every one of those
-- entries, they could never match roleFilter === 'staff' or 'patient' —
-- not "no staff/patient had logged in yet", but "these specific action
-- types could structurally never show a role for ANY user, ever".
--
-- Fix: let a caller that already knows the role (LoginPage.jsx's
-- handleSubmit already calls getRoleByEmail(email) a few lines earlier,
-- specifically to decide the lockout-tier message) pass that role
-- straight into addAuditLog() as `actorRole`, stored directly on the row.
-- The trigger is updated to only auto-fill actor_role when the caller
-- DIDN'T already supply one — so every other existing call site (which
-- never passes actorRole) keeps behaving exactly as before, and this is
-- purely additive.
CREATE OR REPLACE FUNCTION snapshot_audit_log_actor() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.actor_role IS NULL AND NEW.user_id IS NOT NULL THEN
    SELECT name, role INTO NEW.actor_name, NEW.actor_role FROM users WHERE user_id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

-- ============================================================================
-- End of migration.
-- ============================================================================