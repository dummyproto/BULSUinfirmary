// supabase/functions/verify-pin/index.ts
//
// Verifies a 4-digit quick-login PIN (set by the account owner in Account
// Settings) for the QR-scan login flow, and, if correct, mints a REAL
// Supabase Auth session for that account via a one-time magic-link token.
//
// Lockout rules (same as password login):
//   * 5 wrong PINs            -> 60-second lockout
//   * 10 more wrong PINs (15) -> account disabled until an admin re-enables it
//   * admin accounts are never auto-disabled (60s lock every 5 wrong PINs,
//     15 minutes once 15+ have failed)
//
// SELF-CONTAINED: only needs the users columns from migration 045
// (pin_hash, pin_attempts, pin_locked_until) and the verify_pin_hash()
// function from 045/046. No other migration is required.
//
// Deploy:   npm run deploy:pin   (= supabase functions deploy verify-pin)
//           The '@supabase/supabase-js' import below is resolved by
//           supabase/functions/deno.json, same as the other functions. If you
//           ever paste this file into the Dashboard editor instead, change that
//           import to: 'npm:@supabase/supabase-js@2'
// Secrets:  SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
//           ALLOWED_ORIGIN (optional but recommended)
//
// Response shape on failure: { error, retry_after_seconds?, disabled?, disabled_now? }

import { createClient } from '@supabase/supabase-js'

const VERSION = 'verify-pin v3 (self-contained)'

const corsHeaders = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') ?? '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Vary': 'Origin',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', 'X-Function-Version': VERSION },
  })
}

// Postgres/PostgREST errors are plain objects, not Error instances.
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  if (typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    const e = err as { message: string; details?: string; hint?: string; code?: string }
    return [e.message, e.details, e.hint, e.code ? `(code ${e.code})` : ''].filter(Boolean).join(' ')
  }
  try {
    return JSON.stringify(err)
  } catch {
    return String(err)
  }
}

const FIRST_LOCK_AT = 5 // wrong PINs before the 60s lock
const DISABLE_AT = 15 // total wrong PINs before the account is disabled
const GENERIC_FAILURE = 'Incorrect PIN.'
const DISABLED_MESSAGE = 'Your account is disabled — contact admin.'

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

function lockedResponse(seconds: number) {
  return jsonResponse(
    { error: `Too many failed attempts. Try again in ${seconds}s.`, retry_after_seconds: seconds },
    429
  )
}

// Lock to apply if THIS attempt (the n-th) turns out to be wrong.
function lockSecondsFor(n: number, isAdmin: boolean): number {
  if (isAdmin) {
    if (n >= DISABLE_AT) return 900
    return n % 5 === 0 ? 60 : 0
  }
  return n === FIRST_LOCK_AT ? 60 : 0
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Server misconfiguration: missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.' }, 500)
  }

  try {
    const { email, pin } = await req.json()
    if (!email || typeof pin !== 'string' || !/^[0-9]{4}$/.test(pin)) {
      throw new Error('A valid email and 4-digit PIN are required')
    }
    const normalizedEmail = String(email).trim().toLowerCase()

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: userRow, error: userError } = await adminClient
      .from('users')
      .select('user_id, role, is_active, pin_hash, pin_attempts, pin_locked_until')
      .ilike('email', escapeLike(normalizedEmail))
      .maybeSingle()
    if (userError) throw userError

    // Unknown email, or PIN login not set up: same answer as a wrong PIN.
    if (!userRow || !userRow.pin_hash) {
      return jsonResponse({ error: GENERIC_FAILURE }, 400)
    }

    // Already disabled (by 15 failures or by an admin): say so, every time.
    if (userRow.is_active === false) {
      return jsonResponse({ error: DISABLED_MESSAGE, disabled: true }, 403)
    }

    const isAdmin = userRow.role === 'admin'
    const attemptsBefore: number = userRow.pin_attempts ?? 0

    // Still locked out?
    if (userRow.pin_locked_until) {
      const remainingMs = new Date(userRow.pin_locked_until).getTime() - Date.now()
      if (remainingMs > 0) return lockedResponse(Math.ceil(remainingMs / 1000))
    }

    // Non-admin already at 15 failures but not yet disabled: finish disabling.
    if (!isAdmin && attemptsBefore >= DISABLE_AT) {
      await adminClient.from('users').update({ is_active: false, pin_locked_until: null }).eq('user_id', userRow.user_id)
      return jsonResponse({ error: DISABLED_MESSAGE, disabled: true }, 403)
    }

    // Count this attempt BEFORE checking the PIN. The WHERE on the old count
    // makes it atomic: if two requests race, only one wins the update.
    const n = attemptsBefore + 1
    const lockSeconds = lockSecondsFor(n, isAdmin)
    const { data: claimed, error: claimError } = await adminClient
      .from('users')
      .update({
        pin_attempts: n,
        pin_locked_until: lockSeconds > 0 ? new Date(Date.now() + lockSeconds * 1000).toISOString() : null,
      })
      .eq('user_id', userRow.user_id)
      .eq('pin_attempts', attemptsBefore)
      .select('user_id')
    if (claimError) throw claimError
    if (!claimed || claimed.length === 0) {
      return jsonResponse({ error: 'Please wait a moment and try again.', retry_after_seconds: 5 }, 429)
    }

    // Compare with bcrypt inside Postgres (pgcrypto), via migration 045/046.
    const { data: isMatch, error: verifyError } = await adminClient.rpc('verify_pin_hash', {
      p_hash: userRow.pin_hash,
      p_pin: pin,
    })
    if (verifyError) throw verifyError

    if (!isMatch) {
      // 15th wrong PIN (non-admin): disable the account.
      if (!isAdmin && n >= DISABLE_AT) {
        const { data: disabledRows, error: disableError } = await adminClient
          .from('users')
          .update({ is_active: false, pin_locked_until: null })
          .eq('user_id', userRow.user_id)
          .eq('is_active', true)
          .select('user_id')
        if (disableError) throw disableError
        return jsonResponse(
          {
            error: `Incorrect PIN. Your account is disabled — contact admin.`,
            disabled: true,
            disabled_now: (disabledRows?.length ?? 0) > 0,
          },
          403
        )
      }

      // This wrong PIN triggered a lockout (5th wrong PIN; admins also every 5th).
      if (lockSeconds > 0) return lockedResponse(lockSeconds)

      if (n < FIRST_LOCK_AT) {
        return jsonResponse(
          { error: `Incorrect PIN. ${FIRST_LOCK_AT - n} attempt(s) left before temporary lockout.` },
          400
        )
      }
      if (!isAdmin) {
        return jsonResponse(
          { error: `Incorrect PIN. ${DISABLE_AT - n} attempt(s) left before your account is disabled.` },
          400
        )
      }
      return jsonResponse({ error: `Incorrect PIN. ${5 - (n % 5)} attempt(s) left before temporary lockout.` }, 400)
    }

    // Correct PIN: clear the counter and any lock, then mint a real session.
    const { error: clearError } = await adminClient
      .from('users')
      .update({ pin_attempts: 0, pin_locked_until: null })
      .eq('user_id', userRow.user_id)
    if (clearError) throw clearError

    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email: normalizedEmail,
    })
    if (linkError) throw linkError
    const tokenHash = linkData?.properties?.hashed_token
    if (!tokenHash) throw new Error('Could not complete sign-in')

    return jsonResponse({ token_hash: tokenHash, email: normalizedEmail })
  } catch (err) {
    const message = errorMessage(err)
    const status =
      typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number'
        ? (err as { status: number }).status
        : 400
    return jsonResponse({ error: message }, status)
  }
})