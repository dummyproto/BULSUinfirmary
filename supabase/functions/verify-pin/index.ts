// supabase/functions/verify-pin/index.ts
//
// Verifies a 4-digit quick-login PIN (set by the account owner in Account
// Settings — see 045_pin_login.sql) for the QR-scan login flow, and, if
// correct, mints a REAL Supabase Auth session for that account — this is
// not a mock/shortcut login, it's the same kind of session a normal
// signInWithPassword() produces. Deploy with:
//
//   supabase functions deploy verify-pin
//
// Required secrets (usually auto-injected by the Supabase platform;
// see create-user/index.ts's own comment for when you'd set them
// manually):
//
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
//
// ── Why this has to be an Edge Function, not a client-side check ──
// This runs BEFORE the person has a session at all — that's the whole
// point of the PIN (an alternative to typing the real password). A PIN
// is only 4 digits (10,000 possibilities), so unlike a real password
// this genuinely needs server-side rate limiting/lockout to be safe —
// nothing client-side can actually enforce that against a determined
// attacker hitting the API directly. The service-role client here can
// read/update the account's pin_attempts / pin_locked_until regardless
// of RLS, which a plain anon-key client could never do safely.
//
// ── How it actually signs the person in ──
// Supabase Auth has no "sign in with an arbitrary PIN" primitive. What
// this does instead: once the PIN checks out, it uses
// admin.generateLink({ type: 'magiclink' }) to mint a genuine one-time
// sign-in token for that email (the same mechanism a real "email me a
// login link" flow would use), and returns its token_hash to the
// client. The client then calls supabase.auth.verifyOtp({ email,
// token: token_hash, type: 'magiclink' }) itself, which establishes a
// full, ordinary Supabase session — no email round-trip needed since
// the token_hash is handed back directly rather than actually emailed.

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

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  try {
    const { email, pin } = await req.json()
    if (!email || typeof pin !== 'string' || !/^[0-9]{4}$/.test(pin)) {
      throw new Error('A valid email and 4-digit PIN are required')
    }
    const normalizedEmail = String(email).trim().toLowerCase()

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: row, error: fetchError } = await adminClient
      .from('users')
      .select('user_id, pin_hash, pin_attempts, pin_locked_until, is_active')
      .ilike('email', normalizedEmail)
      .maybeSingle()
    if (fetchError) throw fetchError
    if (!row || !row.pin_hash) throw new Error('PIN login is not set up for this account')
    if (row.is_active === false) throw new Error('This account has been disabled — contact admin')

    if (row.pin_locked_until && new Date(row.pin_locked_until).getTime() > Date.now()) {
      const secondsLeft = Math.ceil((new Date(row.pin_locked_until).getTime() - Date.now()) / 1000)
      return jsonResponse({ error: `Too many attempts. Try again in ${secondsLeft}s.` }, 429)
    }

    const { data: isMatch, error: verifyError } = await adminClient.rpc('verify_pin_hash', {
      p_hash: row.pin_hash,
      p_pin: pin,
    })
    if (verifyError) throw verifyError

    if (!isMatch) {
      const attempts = (row.pin_attempts || 0) + 1
      const patch =
        attempts >= MAX_ATTEMPTS
          ? { pin_attempts: 0, pin_locked_until: new Date(Date.now() + LOCKOUT_MINUTES * 60_000).toISOString() }
          : { pin_attempts: attempts }
      await adminClient.from('users').update(patch).eq('user_id', row.user_id)
      const remaining = MAX_ATTEMPTS - attempts
      throw new Error(
        attempts >= MAX_ATTEMPTS
          ? `Too many incorrect attempts. PIN login is locked for ${LOCKOUT_MINUTES} minutes.`
          : `Incorrect PIN. ${remaining} attempt(s) left.`
      )
    }

    // Correct PIN — clear the attempt counter and mint a real session.
    await adminClient.from('users').update({ pin_attempts: 0, pin_locked_until: null }).eq('user_id', row.user_id)

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    })
    if (linkError) throw linkError
    const tokenHash = linkData?.properties?.hashed_token
    if (!tokenHash) throw new Error('Could not complete sign-in')

    return jsonResponse({ token_hash: tokenHash, email: normalizedEmail })
    } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 400
    return jsonResponse({ error: message }, status)
  }
})