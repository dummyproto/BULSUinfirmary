import { supabase } from './supabaseClient'

// Persists MediBot conversations (chat_conversations + chat_messages,
// migration 005). One conversation row per "chat session" between fresh
// starts; one message row per turn (sender_type 'user' | 'bot'), ordered
// by created_at. RLS restricts every table to the caller's own rows —
// see the migration for why this is intentionally NOT staff/admin-visible
// the way most other tables are.

// Deliberately not persisting a separate "was this an emergency reply"
// column — chat_messages doesn't need a new field just for this cosmetic
// styling. The chat-completion Edge Function's EMERGENCY_REPLY wording is
// specific and stable enough to re-detect reliably on reload instead.
const EMERGENCY_REPLY_SNIPPET = 'this may be an emergency'

function flattenMessage(row) {
  // Shape matches what ChatMessage.jsx already expects (`type`/`text`/`ts`)
  // so the component needs no changes — only where the data comes from.
  return {
    id: row.message_id,
    type: row.sender_type,
    text: row.message,
    ts: row.created_at,
    status: row.status,
    emergency: row.sender_type === 'bot' && row.message.toLowerCase().includes(EMERGENCY_REPLY_SNIPPET),
  }
}

/** Most recently active conversation for this user, or null if they've never chatted before. */
export async function getLatestConversation(userId) {
  const { data, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data
}

export async function createConversation(userId, role, title) {
  const { data, error } = await supabase
    .from('chat_conversations')
    .insert({ user_id: userId, role, title: title || null })
    .select()
    .single()
  if (error) throw error
  return data
}

/**
 * Loads (or lazily creates) the conversation this user should resume on
 * page load — "previous conversations load automatically after login".
 * Returns { conversation, messages } so the caller can populate chat
 * state in one round trip's worth of work (2 small queries, no N+1).
 */
export async function getOrCreateActiveConversation(userId, role) {
  let conversation = await getLatestConversation(userId)
  if (!conversation) {
    conversation = await createConversation(userId, role)
    return { conversation, messages: [] }
  }
  const messages = await listMessages(conversation.conversation_id)
  return { conversation, messages }
}

export async function listMessages(conversationId) {
  // Capped at the 300 most recent messages — this is on the hot page-
  // load path (getOrCreateActiveConversation resumes the user's active
  // conversation on every visit to the chatbot), previously with no
  // limit, so a long-running conversation would only get slower to
  // resume the longer someone kept using it. Fetching descending +
  // limit, then reversing, is what gets the most recent N messages
  // specifically (not the oldest N) while still handing back
  // oldest-first order, which is what the chat UI actually needs to
  // render correctly.
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(300)
  if (error) throw error
  return data.map(flattenMessage).reverse()
}

/**
 * Inserts one message and bumps the conversation's `updated_at` so
 * `getLatestConversation` keeps picking the right one to resume. Two
 * writes, not a trigger — consistent with how `updated_at` is maintained
 * by hand elsewhere in this codebase (e.g. inventoryService.js) rather
 * than via database triggers.
 */
export async function addMessage({ conversationId, senderType, message, status = 'sent' }) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, sender_type: senderType, message, status })
    .select()
    .single()
  if (error) throw error

  const { error: touchError } = await supabase
    .from('chat_conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('conversation_id', conversationId)
  if (touchError) throw touchError

  return flattenMessage(data)
}

/**
 * Full multi-session history for the Log view (Phase 2) — every past
 * conversation this user has ever had, each with its own messages,
 * newest conversation first. Two queries total regardless of how many
 * conversations exist (conversation list, then all their messages in
 * one `IN (...)` query), not one query per conversation.
 */
export async function listConversationsForUser(userId) {
  // Capped at the 50 most recent conversations — this (and the messages
  // query right below, which only ever fetches messages for whatever
  // conversation IDs come back here) was previously unbounded on both
  // counts. Not on the hot page-load path (only fetched when the Chat
  // Log modal is actually opened), but still a real, growing slowdown
  // for anyone with a long chat history.
  const { data: conversations, error } = await supabase
    .from('chat_conversations')
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(50)
  if (error) throw error
  if (conversations.length === 0) return []

  const ids = conversations.map((c) => c.conversation_id)
  const { data: allMessages, error: msgError } = await supabase
    .from('chat_messages')
    .select('*')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true })
  if (msgError) throw msgError

  const byConversation = new Map()
  for (const row of allMessages) {
    const list = byConversation.get(row.conversation_id) || []
    list.push(flattenMessage(row))
    byConversation.set(row.conversation_id, list)
  }
  return conversations.map((c) => ({ ...c, messages: byConversation.get(c.conversation_id) || [] }))
}

/**
 * A lighter sibling of listConversationsForUser, for the rule-based
 * fallback's "you mentioned this before" callback (botEngine.js) — only
 * the most recent `limit` user messages across ALL of this user's past
 * conversations (not the current one, which the caller already has in
 * local state), not full conversation objects. Loaded eagerly alongside
 * the active conversation so it's ready the moment someone sends a
 * message, unlike the full history (listConversationsForUser), which is
 * only fetched on demand when the Log modal actually opens.
 */
export async function listRecentUserMessages(userId, excludeConversationId, limit = 30) {
  let convQuery = supabase.from('chat_conversations').select('conversation_id').eq('user_id', userId)
  if (excludeConversationId) convQuery = convQuery.neq('conversation_id', excludeConversationId)
  const { data: conversations, error } = await convQuery
  if (error) throw error
  if (conversations.length === 0) return []

  const ids = conversations.map((c) => c.conversation_id)
  const { data, error: msgError } = await supabase
    .from('chat_messages')
    .select('sender_type, message, created_at')
    .in('conversation_id', ids)
    .eq('sender_type', 'user')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (msgError) throw msgError
  return data.map((r) => ({ text: r.message, ts: r.created_at }))
}

/**
 * The ONLY action that actually deletes chat_conversations/chat_messages
 * rows (Phase 2) — everything the Clear button does now stops short of
 * this. RLS already scopes DELETE to the caller's own rows regardless of
 * what userId is passed, same as every other call in this file.
 */
export async function deleteAllConversationsForUser(userId) {
  const { error } = await supabase.from('chat_conversations').delete().eq('user_id', userId)
  if (error) throw error
}

/** Deletes a conversation and (via ON DELETE CASCADE) every message in it. */
export async function deleteConversation(conversationId) {
  const { error } = await supabase.from('chat_conversations').delete().eq('conversation_id', conversationId)
  if (error) throw error
}

/**
 * Calls the `chat-completion` Edge Function (Groq-backed AI replies — see
 * supabase/functions/chat-completion/). Throws if the function isn't
 * deployed, GROQ_API_KEY isn't configured, or the AI service call itself
 * fails — ChatbotPage.jsx catches this and falls back to the built-in
 * rule-based engine (botEngine.js), so a missing/failed AI integration
 * never breaks the chat experience, just makes it less capable.
 */
export async function getAiReply(conversationId, message) {
  const { data, error } = await supabase.functions.invoke('chat-completion', {
    body: { conversationId, message },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return { reply: data.reply, emergency: !!data.emergency }
}