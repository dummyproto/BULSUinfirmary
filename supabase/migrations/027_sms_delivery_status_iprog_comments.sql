-- Cosmetic follow-up to migration 026 — its column comments referenced
-- Twilio, which was the SMS provider at the time it was written. The
-- actual provider in use is IPROG SMS (see supabase/functions/send-sms/
-- index.ts) — updating the comments to match. No column or behavior
-- changes here, just documentation accuracy.

COMMENT ON COLUMN sms_log.delivery_status IS
  'sent = IPROG accepted the message for delivery (does not guarantee the handset received it, just that the provider queued it). failed = the send-sms Edge Function call itself failed (bad number, provider error, SMS not configured, etc.) — the message text is still logged for the record, but was never actually sent.';
COMMENT ON COLUMN sms_log.provider_message_id IS
  'IPROG''s own message_id (or another provider''s equivalent ID, if swapped later) for support/troubleshooting a specific message — NULL for failed sends, since there is no provider-side message to reference.';