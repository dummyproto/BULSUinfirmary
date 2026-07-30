-- ============================================================================
-- MIGRATION 005 — Persistent Chatbot Conversations
-- ============================================================================
-- The chatbot (MediBot) previously kept its entire conversation — and the
-- separate query-log used by the "Logs" modal — in React state only. Both
-- reset on every refresh, logout, or browser restart (explicitly flagged
-- in ChatbotPage.jsx's own comments as a known tradeoff from the earlier
-- localStorage-removal work). This migration adds real persistence.
--
-- No existing table was a fit — checked `notifications` (wrong shape: one
-- row per alert, not a threaded conversation) and `audit_logs` (an action
-- trail, not message content) before deciding two new tables were
-- genuinely needed.
--
-- Design notes:
--   • One row per MESSAGE (not per Q&A pair) in `chat_messages`, each
--     tagged `sender_type` — the standard normalized shape, and exactly
--     what lets the existing ChatMessage.jsx component (which already
--     branches on `message.type === 'bot'`) work with almost no changes.
--   • `role` lives on the CONVERSATION, not repeated on every message —
--     it's a property of who's chatting, not of each individual message,
--     and doesn't change mid-conversation. Storing it once is the more
--     normalized choice while still satisfying "know the user's role for
--     every message" (join back to the conversation, same as you'd join
--     to `users` for the same fact).
--   • `status` on `chat_messages` supports the client marking a message
--     'failed' if a send couldn't be confirmed (e.g. a dropped network
--     request that succeeded locally but the client never got the
--     response) — optional, defaults to 'sent'.
--   • The "Clear Chat" button already existed with a confirm dialog
--     reading "This will remove the entire conversation history" — so
--     Clear now genuinely deletes the conversation (ON DELETE CASCADE
--     removes its messages) and starts a fresh one, matching what the
--     button already told users it would do, rather than silently
--     changing its meaning to "archive."
-- ============================================================================

CREATE TABLE chat_conversations (
    conversation_id SERIAL PRIMARY KEY,
    user_id         INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    role            VARCHAR(10) NOT NULL CHECK (role IN ('admin', 'staff', 'patient')),
    title           VARCHAR(150),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_conversations_user ON chat_conversations(user_id, updated_at DESC);

CREATE TABLE chat_messages (
    message_id      SERIAL PRIMARY KEY,
    conversation_id INTEGER NOT NULL REFERENCES chat_conversations(conversation_id) ON DELETE CASCADE,
    sender_type     VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'bot')),
    message         TEXT NOT NULL,
    status          VARCHAR(10) NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_chat_messages_conversation ON chat_messages(conversation_id, created_at);


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
-- Deliberately NOT following the usual "staff/admin can see everything"
-- pattern used elsewhere in this schema (documents, consultations, etc).
-- MediBot's own disclaimer advertises emotional-support conversations —
-- this is sensitive personal content. Every role, including admin, can
-- only ever see and manage their OWN chatbot conversations, exactly like
-- everyone else. There is intentionally no staff/admin-oversight policy
-- here.

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY chat_conversations_select ON chat_conversations FOR SELECT TO authenticated
  USING (user_id = current_app_user_id());

CREATE POLICY chat_conversations_insert ON chat_conversations FOR INSERT TO authenticated
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY chat_conversations_update ON chat_conversations FOR UPDATE TO authenticated
  USING (user_id = current_app_user_id())
  WITH CHECK (user_id = current_app_user_id());

CREATE POLICY chat_conversations_delete ON chat_conversations FOR DELETE TO authenticated
  USING (user_id = current_app_user_id());


ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;

-- No direct user_id column on chat_messages (by design — it belongs to
-- exactly one conversation, which already has exactly one owner), so
-- these check ownership through the parent conversation.
CREATE POLICY chat_messages_select ON chat_messages FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_conversations c
    WHERE c.conversation_id = chat_messages.conversation_id
      AND c.user_id = current_app_user_id()
  ));

CREATE POLICY chat_messages_insert ON chat_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM chat_conversations c
    WHERE c.conversation_id = chat_messages.conversation_id
      AND c.user_id = current_app_user_id()
  ));

CREATE POLICY chat_messages_delete ON chat_messages FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM chat_conversations c
    WHERE c.conversation_id = chat_messages.conversation_id
      AND c.user_id = current_app_user_id()
  ));

-- ============================================================================
-- End of migration 005.
-- ============================================================================
