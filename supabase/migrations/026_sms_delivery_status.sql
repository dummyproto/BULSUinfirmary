-- sms_log previously had no way to distinguish a message that actually
-- reached a real SMS provider from one that didn't — every row implied
-- success, because every send WAS a no-op success (the "demo mode"
-- behavior sendSms() had before this migration: write a log row, never
-- actually contact a provider). Now that sendSms() calls the send-sms
-- Edge Function (Twilio) for real, a send can genuinely fail — an
-- invalid/unreachable number, an unverified number on a Twilio trial
-- account, insufficient balance, etc. — and that outcome needs to be
-- recorded rather than silently logged as if it succeeded.

ALTER TABLE sms_log
  ADD COLUMN delivery_status TEXT NOT NULL DEFAULT 'sent'
    CHECK (delivery_status IN ('sent', 'failed')),
  ADD COLUMN provider_message_id TEXT;

COMMENT ON COLUMN sms_log.delivery_status IS
  'sent = Twilio accepted the message for delivery (does not guarantee the handset received it, just that the provider queued it). failed = the send-sms Edge Function call itself failed (bad number, provider error, SMS not configured, etc.) — the message text is still logged for the record, but was never actually sent.';
COMMENT ON COLUMN sms_log.provider_message_id IS
  'Twilio''s own message SID (or another provider''s equivalent ID) for support/troubleshooting a specific message — NULL for failed sends, since there is no provider-side message to reference.';