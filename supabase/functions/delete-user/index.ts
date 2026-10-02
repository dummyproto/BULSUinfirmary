// supabase/functions/delete-user/index.ts
//
// Server-side account removal — the other half of what Maintenance's
// "Add User" flow needed create-user/ for. Deleting a row from
// public.users on its own never touched auth.users, so a "deleted" user
// could still log in afterward (their Supabase Auth account was still
// live — AuthContext would just fail to find a matching public.users
// row for them post-login, which is a confusing broken state, not an
// actual block on signing in). This function does the part the browser
// can never safely do itself: remove the auth.users account with the
// service-role key. Deploy with:
//
//   supabase functions deploy delete-user
//
// Required secrets (set once, never exposed to the client) — same three
// as create-user/, and likely already set if that function is deployed:
//
//   supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
//   supabase secrets set SUPABASE_ANON_KEY=your-anon-key
//
// ── What this does ──
// 1. Verifies the caller is authenticated AND has role='admin' in
//    public.users (checked via a client scoped to the CALLER's own JWT,
//    so it's fully subject to the Phase A RLS policies — no bypass here).
//    Same check as create-user/, and for the same reason: this must never
//    be callable by anyone but an admin.
// 2. Only then uses the service-role client to delete the given
//    auth.users row by UUID.
// 3. Deliberately does NOT touch public.users — usersService.deleteUser()
//    calls this FIRST and only deletes the public.users row after this
//    succeeds, so a failure here leaves both rows intact instead of
//    leaving an orphaned auth.users account behind with no matching
//    profile (the failure mode this function exists to prevent, just
//    inverted — silent instead of loud).

import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your actual domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// `Deno` is a global provided by the Deno runtime this function actually
// executes in. The editor's default TypeScript service doesn't know about
// Deno globals and flags them as "Cannot find name 'Deno'" even though the
// code is correct — @ts-ignore silences just that, in the two places it's
// used, rather than fighting editor config (same approach as create-user/).
function denoEnv(key: string): string | undefined {
  // @ts-ignore -- Deno global, see note above
  return Deno.env.get(key)
}

// @ts-ignore -- Deno global, see note above
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = denoEnv('SUPABASE_URL')
  const SUPABASE_ANON_KEY = denoEnv('SUPABASE_ANON_KEY')
  const SUPABASE_SERVICE_ROLE_KEY = denoEnv('SUPABASE_SERVICE_ROLE_KEY')

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Server is missing required Supabase configuration' }, 500)
  }

  try {
    // ── 1. Identify the caller and verify they're an admin ──
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
    if (callerRowError || callerRow?.role !== 'admin') {
      throw new Error('Forbidden — only admins can delete users')
    }

    // ── 2. Validate the request body ──
    // userId (public.users.user_id, the integer PK — distinct from
    // authUserId's auth.users UUID) is optional; when present it's used
    // in step 4 below to free up any registration QR code this person
    // had claimed.
    // email (optional) is used in step 3 to ALSO remove any auth.users row
    // that still holds this address. Accounts whose public.users row never
    // got an auth_user_id linked (older/self-registered ones that haven't
    // hit the "link on first login" bridge) used to skip this function
    // entirely, leaving an orphaned auth account behind — and an orphan
    // still holding the email is exactly what stopped that address from
    // getting a fresh verification email when someone registered with it
    // again after being deleted.
    const { authUserId, userId, email } = await req.json()
    if (!authUserId && !email) throw new Error('authUserId or email is required')

    // An admin can never delete their own account through this path —
    // same self-protection principle as the client already applies to
    // role==='admin' rows in Maintenance (see UserManagementTab.jsx), just
    // enforced here too since this function is the one actually holding
    // the privileged key.
    if (authUserId && authUserId === caller.id) throw new Error('You cannot delete your own account')

    // ── 3. Delete the auth.users row with the service-role client ──
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    if (authUserId) {
      const { error } = await adminClient.auth.admin.deleteUser(authUserId)
      // "User not found" here means auth.users already has no row for this
      // ID — e.g. a demo/seed account created directly in public.users, or
      // an auth account removed some other way earlier. The goal of this
      // step ("no live auth.users row for this ID") is already true, so it
      // isn't treated as a failure. Any OTHER error still fails loudly.
      const alreadyGone = error && /user not found/i.test(error.message || '')
      if (error && !alreadyGone) throw error
    }

    // Also remove any OTHER auth.users row still holding this email (see
    // step 2's note on `email`). Guards: never the caller's own account,
    // and never an auth account that another public.users row still
    // points to.
    if (email) {
      const target = String(email).trim().toLowerCase()
      const staleIds: string[] = []
      for (let page = 1; page <= 20; page++) {
        const { data, error: listError } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
        if (listError) throw listError
        const users = data?.users ?? []
        for (const u of users) {
          if ((u.email || '').toLowerCase() === target && u.id !== caller.id && u.id !== authUserId) staleIds.push(u.id)
        }
        if (users.length < 1000) break
      }
      for (const id of staleIds) {
        let query = adminClient.from('users').select('user_id').eq('auth_user_id', id)
        if (userId) query = query.neq('user_id', userId)
        const { data: stillLinked } = await query.limit(1)
        if (stillLinked && stillLinked.length > 0) continue
        const { error: staleError } = await adminClient.auth.admin.deleteUser(id)
        if (staleError && !/user not found/i.test(staleError.message || '')) throw staleError
      }
    }

    // ── 4. Permanently delete this person's registration QR code row, if
    //       they had one ──
    // Previously this UPDATEd the row back to unused (is_used: false,
    // used_by_user_id/used_at cleared) instead of deleting it, so the
    // exact same physical QR code could register a brand new account
    // afterward. Per updated requirements, a deleted account's scanned
    // QR record should be gone from the system/Supabase permanently
    // instead — so this now DELETEs the row outright. `userId` is
    // optional (only usersService.deleteUser() passes it, which already
    // has it on hand) so this stays backward-compatible with any other
    // caller of this function that doesn't.
    if (userId) {
      const { error: qrError } = await adminClient
        .from('registration_qr_codes')
        .delete()
        .eq('used_by_user_id', userId)
      // Non-fatal — the account is already fully deleted at this point;
      // failing to remove the QR row shouldn't undo that or block the
      // delete from being reported as successful.
      if (qrError) console.error('Failed to delete registration_qr_codes row for deleted user:', qrError.message)
    }

    return jsonResponse({ deleted: true })
  } catch (err) {
    // TypeScript types a catch binding as `unknown` by default (Deno's
    // strict-by-default checker flags .message on it as an error) —
    // errors thrown above are always real Error objects, but this
    // narrows properly instead of assuming that, so a genuinely
    // non-Error throw (rare, but possible from a dependency) still
    // produces a readable string instead of crashing this handler itself.
    const message = err instanceof Error ? err.message : String(err)
    return jsonResponse({ error: message }, 400)
  }
})