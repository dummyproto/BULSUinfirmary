// supabase/functions/send-sms/index.ts
//
// Actually sends the parent/guardian notification SMS via IPROG SMS —
// replaces the previous Twilio-based version. Adapted directly from a
// working prototype (server.js in SMS_PROTOTYPE.zip) that already sends
// real messages through IPROG, a Philippines-focused SMS gateway — a
// better fit here than Twilio, which isn't PH-specific and needs more
// setup for reliable local delivery. Same shape as reset-user-password/
// in this folder otherwise: the secret that must never reach the
// browser here is the IPROG API token, not the Supabase service-role
// key, but the reasoning for needing an Edge Function is identical
// either way.
//
// ── Before this works, you need an IPROG SMS account ──
// No code can send a real SMS without a real account behind it. Sign up
// at https://sms.iprogtech.com, get your API token from the dashboard,
// then set:
//
//   supabase secrets set IPROG_API_TOKEN=your-iprog-api-token
//
// (Never commit this token or paste it into a chat — set it directly
// with the command above. If a token has ever been shared anywhere
// outside your own machine/terminal, treat it as compromised and
// regenerate it from the IPROG dashboard.)
//
// Also needs the same three secrets as create-user/, delete-user/, and
// reset-user-password/ (already set if any of those is deployed) to
// verify the caller is actually staff/admin before sending anything:
//
//   supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
//   supabase secrets set SUPABASE_ANON_KEY=your-anon-key
//
// Deploy with:
//   supabase functions deploy send-sms
//
// Swapping providers again later: only the "3. Send via IPROG" block
// below needs to change — everything else (the auth check, the
// sms_log/emergency_alerts writes on the client side in
// emergencyAlertsService.js) stays the same regardless of which
// provider actually carries the message.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

const IPROG_ENDPOINT = 'https://sms.iprogtech.com/api/v1/sms_messages'

// Same normalization the prototype used — IPROG expects PH numbers as
// 63XXXXXXXXXX (no leading +, no leading 0).
function normalizePHPhone(num) {
  const cleaned = (num || '').replace(/[\s\-().]/g, '')
  if (/^09\d{9}$/.test(cleaned)) return '63' + cleaned.slice(1)
  if (/^\+639\d{9}$/.test(cleaned)) return cleaned.slice(1)
  if (/^639\d{9}$/.test(cleaned)) return cleaned
  return null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const IPROG_API_TOKEN = Deno.env.get('IPROG_API_TOKEN')

  try {
    // ── 1. Identify the caller and verify they're staff or admin ──
    // (Notify Parent is a Staff+Admin route — see
    // AppRoutes.jsx's STAFF_ADMIN-wrapped /emergency-alerts route.)
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

    const { data: callerRow, error: callerRowError } = await callerClient
      .from('users')
      .select('role')
      .eq('auth_user_id', caller.id)
      .single()
    if (callerRowError || !['staff', 'admin'].includes(callerRow?.role)) {
      throw new Error('Forbidden — only staff or admins can send SMS alerts')
    }

    // ── 2. Validate the request body ──
    // Accepts `to` in whatever PH format the caller already validated
    // client-side (09XXXXXXXXX, +639XXXXXXXXX, or 639XXXXXXXXX) —
    // normalizePHPhone below handles all three, matching the prototype.
    const { to, message } = await req.json()
    if (!message || !message.trim()) throw new Error('message is required')
    if (message.length > 1600) throw new Error('message is too long (max 1600 characters)')

    const normalizedPhone = normalizePHPhone(to)
    if (!normalizedPhone) {
      throw new Error('to must be a valid Philippine mobile number (e.g. 09171234567)')
    }

    if (!IPROG_API_TOKEN) {
      // Fails loudly rather than silently pretending to send — the
      // original "demo mode, logged only" behavior this replaces was
      // exactly this kind of silent no-op, which is what's being fixed.
      throw new Error(
        'SMS is not configured yet — set IPROG_API_TOKEN (see the comment at the top of this file) and redeploy this function before Notify Parent can actually send messages.'
      )
    }

    // ── 3. Send via IPROG ──
    const iprogRes = await fetch(IPROG_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_token: IPROG_API_TOKEN,
        phone_number: normalizedPhone,
        message,
      }),
    })

    const iprogData = await iprogRes.json()
    if (!iprogRes.ok || iprogData.status !== 200) {
      // IPROG's own error message is far more actionable than a
      // generic "failed to send" here (e.g. insufficient credits, an
      // invalid/blacklisted number, an expired token).
      throw new Error(iprogData.message || `IPROG error (status ${iprogRes.status})`)
    }

    return jsonResponse({ sent: true, providerMessageId: iprogData.message_id })
  } catch (err) {
    return jsonResponse({ error: err.message }, 400)
  }
})