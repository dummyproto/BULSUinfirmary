// supabase/functions/chat-completion/index.ts
//
// AI-powered chatbot replies for MediBot, adapted from the uploaded
// MediBot package's server.js. Deploy with:
//
//   supabase functions deploy chat-completion
//
// Required secret (set once, never exposed to the client):
//
//   supabase secrets set GROQ_API_KEY=your_groq_api_key
//
// Get a free key at https://console.groq.com — this is a third-party
// service this app doesn't control; if the key is missing or invalid,
// this function returns a clear error and the client falls back to the
// existing rule-based botEngine.js (see ChatbotPage.jsx).
//
// ── What changed vs. the original server.js, and why ──
// The original kept one conversation history array per browser session in
// an in-memory Map (memory.js) — Groq's chat API is stateless, so
// something has to resend the full history on every call. Edge Functions
// don't have a long-lived process to hold that Map in (each invocation
// can be a fresh isolate), so instead of trying to replicate in-memory
// session state, this reads the real message history straight from
// `chat_messages` (built for this app's chatbot-persistence work) on
// every call. Net effect: the "memory" is now the same durable database
// history the rest of the app already relies on, not a separate,
// ephemeral copy — actually more robust than the original (survives
// cold starts, works the same across tabs/devices), not a downgrade.
//
// ── What this does ──
// 1. Verifies the caller is authenticated (their own JWT).
// 2. Verifies the given conversation actually belongs to them — using a
//    client scoped to the CALLER's JWT, so this is enforced by the same
//    RLS policies as everywhere else, not a manual bypass check.
// 3. Local emergency-keyword check first (instant, free, never delayed by
//    or dependent on the AI call succeeding).
// 4. Otherwise, loads that conversation's message history, plus (Phase 2)
//    a small amount of memory from OUTSIDE this one conversation — recent
//    messages from the user's other past sessions, and recent consultation
//    summaries — so replies can reference recurring symptoms/conditions
//    across sessions, not just within whichever conversation happens to
//    be active right now. Both memory lookups are best-effort: if either
//    fails, the reply still generates normally, just without that extra
//    context. Then prepends the system prompt and calls Groq's chat
//    completions API (plain fetch against its OpenAI-compatible REST
//    endpoint, not the groq-sdk npm package — fewer moving parts to go
//    wrong in an environment this couldn't be live-tested against before
//    shipping).
// 5. Returns { reply, emergency }. This function does NOT insert
//    anything into chat_messages itself — the client does that via the
//    existing chatService.js, exactly like it already does for the
//    rule-based bot. Keeps this function focused on "generate a reply"
//    only, reusing the persistence layer that already exists and is
//    already tested.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { SYSTEM_PROMPT, EMERGENCY_PATTERN, EMERGENCY_REPLY } from './knowledge.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your actual domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const GROQ_MODEL = 'openai/gpt-oss-120b'

// Same tuned generation parameters as the original server.js — see that
// file's history for the reasoning behind each value; not changed here.
const GENERATION_CONFIG = {
  temperature: 0.6,
  max_tokens: 512,
  top_p: 0.9,
  frequency_penalty: 0.3,
  presence_penalty: 0.2,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const GROQ_API_KEY = Deno.env.get('GROQ_API_KEY')

  try {
    // ── 1. Identify the caller ──
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('Missing Authorization header')

    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    })

    const {
      data: { user: caller },
      error: callerAuthError,
    } = await callerClient.auth.getUser()
    if (callerAuthError || !caller) throw new Error('Invalid or expired session')

    // ── 2. Validate the request body ──
    const { conversationId, message } = await req.json()
    if (!conversationId || !message || typeof message !== 'string' || !message.trim()) {
      return jsonResponse({ error: 'conversationId and a non-empty message are required' }, 400)
    }

    // ── 3. Confirm this conversation belongs to the caller ──
    // Scoped to the caller's own client, so this is the same RLS policy
    // (chat_conversations_select) as every other read in the app — not a
    // separate authorization check to keep in sync by hand.
    const { data: conversation, error: convError } = await callerClient
      .from('chat_conversations')
      .select('conversation_id')
      .eq('conversation_id', conversationId)
      .single()
    if (convError || !conversation) {
      return jsonResponse({ error: 'Conversation not found or not yours' }, 404)
    }

    // ── 4. Instant local emergency check — no API call needed ──
    if (EMERGENCY_PATTERN.test(message)) {
      return jsonResponse({ reply: EMERGENCY_REPLY, emergency: true })
    }

    if (!GROQ_API_KEY) {
      return jsonResponse({ error: "The AI assistant isn't configured yet (missing GROQ_API_KEY)." }, 500)
    }

    // ── 5. Load this conversation's real history and call Groq ──
    const { data: history, error: historyError } = await callerClient
      .from('chat_messages')
      .select('sender_type, message')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
    if (historyError) throw historyError

    // ── 5b. Memory: recent messages from the user's OTHER (past)
    // conversations, and recent consultation summaries, so replies can
    // reference recurring symptoms/conditions across sessions — not just
    // within the single conversation being continued right now. Both are
    // scoped by RLS through `callerClient`, the exact same way the
    // conversation-ownership check above already is — no manual
    // user_id filtering needed, and no elevated privileges. Best-effort:
    // if either lookup fails for any reason, the reply still generates
    // normally, just without that extra context.
    let memoryBlock = ''
    try {
      const { data: otherConvos } = await callerClient
        .from('chat_conversations')
        .select('conversation_id')
        .neq('conversation_id', conversationId)
        .order('updated_at', { ascending: false })
        .limit(5)
      if (otherConvos && otherConvos.length > 0) {
        const { data: pastMessages } = await callerClient
          .from('chat_messages')
          .select('sender_type, message, created_at')
          .in('conversation_id', otherConvos.map((c) => c.conversation_id))
          .eq('sender_type', 'user')
          .order('created_at', { ascending: false })
          .limit(10)
        if (pastMessages && pastMessages.length > 0) {
          const lines = pastMessages.map((m) => `- (${new Date(m.created_at).toISOString().slice(0, 10)}) "${m.message}"`).join('\n')
          memoryBlock += `\n\nThis user's messages from earlier, separate conversations (for context only — don't assume these are still current unless the user brings them up again):\n${lines}`
        }
      }

      const { data: pastConsultations } = await callerClient
        .from('consultations')
        .select('visit_date, chief_complaint, diagnosis')
        .order('visit_date', { ascending: false })
        .limit(3)
      if (pastConsultations && pastConsultations.length > 0) {
        const lines = pastConsultations
          .map((c) => `- ${c.visit_date}: complaint "${c.chief_complaint || 'n/a'}"${c.diagnosis ? `, diagnosis "${c.diagnosis}"` : ''}`)
          .join('\n')
        memoryBlock += `\n\nThis user's recent clinic consultation records (for context only — a real diagnosis from clinic staff, not something to re-diagnose):\n${lines}`
      }

      // Same RLS scoping as consultations above — document_requests_select
      // (migration 001) only ever returns a patient's OWN requests unless
      // the caller is staff/admin, so this needs no manual patient_id
      // filter to stay correctly scoped per-caller.
      const { data: docRequests } = await callerClient
        .from('document_requests')
        .select('document_type, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5)
      if (docRequests && docRequests.length > 0) {
        const lines = docRequests
          .map((d) => `- ${d.document_type}: ${d.status} (requested ${new Date(d.created_at).toISOString().slice(0, 10)})`)
          .join('\n')
        memoryBlock += `\n\nThis user's recent document requests (use this to directly answer "what's the status of my document request" — don't say you can't check status, this IS the real current status):\n${lines}`
      } else {
        memoryBlock += `\n\nThis user has no document requests on file right now.`
      }
    } catch (memoryErr) {
      console.error('[CHAT_COMPLETION_MEMORY_LOOKUP_FAILED]', memoryErr)
    }

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + memoryBlock },
      ...history.map((m) => ({ role: m.sender_type === 'bot' ? 'assistant' : 'user', content: m.message })),
      { role: 'user', content: message },
    ]

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 20_000)

    let groqRes
    try {
      groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: GROQ_MODEL, messages, ...GENERATION_CONFIG }),
        signal: controller.signal,
      })
    } catch (fetchErr) {
      if (fetchErr.name === 'AbortError') {
        return jsonResponse({ error: 'The assistant is taking too long to respond. Please try again in a moment.' }, 504)
      }
      return jsonResponse({ error: "Sorry, I couldn't reach the assistant service right now. Please check your connection and try again." }, 503)
    } finally {
      clearTimeout(timeout)
    }

    if (!groqRes.ok) {
      // Mirrors groqErrorHandler.js's classification, adapted to HTTP
      // status codes since this calls the REST API directly rather than
      // through the groq-sdk package (which threw typed error classes).
      const status = groqRes.status
      let reply = 'Sorry, something went wrong while contacting the assistant. Please try again in a moment.'
      if (status === 401) reply = "The assistant isn't configured correctly on the server (authentication issue). Please contact the site administrator."
      else if (status === 429) reply = 'MediBot is getting a lot of requests right now. Please wait a few seconds and try again.'
      else if (status === 404 || status === 403) reply = 'The assistant model is temporarily unavailable. Please try again shortly or contact support if this continues.'
      else if (status >= 500) reply = 'Sorry, something went wrong while contacting the assistant. Please try again in a moment.'

      const bodyText = await groqRes.text().catch(() => '')
      console.error('[GROQ_API_ERROR]', { status, body: bodyText })
      return jsonResponse({ error: reply }, status === 429 ? 429 : 502)
    }

    const completion = await groqRes.json()
    const reply = completion?.choices?.[0]?.message?.content
    if (typeof reply !== 'string' || !reply.trim()) {
      console.error('[GROQ_EMPTY_OR_MALFORMED_RESPONSE]', completion)
      return jsonResponse({ error: "Sorry, I didn't get a usable answer that time. Could you rephrase your question and try again?" }, 502)
    }

    // The model was instructed (SYSTEM_PROMPT) to open emergency replies
    // with this exact phrase — check for it instead of hardcoding false,
    // so an emergency the instant EMERGENCY_PATTERN check above didn't
    // catch (e.g. an unlisted phrasing) still gets flagged for the red
    // "emergency" bubble styling and, on the client, the SOS mention.
    const emergency = /this may be an emergency/i.test(reply)
    return jsonResponse({ reply, emergency })
  } catch (err) {
    console.error('[CHAT_COMPLETION_UNEXPECTED_ERROR]', err)
    return jsonResponse({ error: 'Sorry, something went wrong while contacting the assistant. Please try again in a moment.' }, 500)
  }
})