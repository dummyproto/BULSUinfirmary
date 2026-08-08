-- Web Push notifications — stores each device's push subscription.
-- A person can have several rows here (phone + laptop + tablet all
-- separately subscribed), which is normal and expected: a push send
-- fans out to every device they've subscribed on.
--
-- endpoint/p256dh/auth come directly from the browser's
-- PushSubscription object (see src/lib/pushNotifications.js) — the
-- browser generates these when subscribing; nothing here is chosen by
-- the app itself.

CREATE TABLE push_subscriptions (
  push_subscription_id BIGSERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_push_subscriptions_user_id ON push_subscriptions(user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- A person can see/create/remove only their own subscriptions from the
-- client (e.g. unsubscribing on their own device). The send-push Edge
-- Function bypasses this entirely via its service-role key — it needs
-- to read subscriptions belonging to whoever a notification targets,
-- not just the caller's own.
CREATE POLICY push_subscriptions_select ON push_subscriptions FOR SELECT TO authenticated
  USING (user_id = current_app_user_id());

CREATE POLICY push_subscriptions_insert ON push_subscriptions FOR INSERT TO authenticated
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY push_subscriptions_delete ON push_subscriptions FOR DELETE TO authenticated
  USING (user_id = current_app_user_id());

COMMENT ON TABLE push_subscriptions IS
  'Web Push subscriptions (one row per subscribed device). Populated by src/lib/pushNotifications.js when a user grants notification permission; read by supabase/functions/send-push/index.ts to actually deliver a push. A subscription that the push service reports as expired/invalid (HTTP 404/410 on send) should be deleted here — see send-push/index.ts for that cleanup logic.';