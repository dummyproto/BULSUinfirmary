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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

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
    const { authUserId, userId } = await req.json()
    if (!authUserId) throw new Error('authUserId is required')

    // An admin can never delete their own account through this path —
    // same self-protection principle as the client already applies to
    // role==='admin' rows in Maintenance (see UserManagementTab.jsx), just
    // enforced here too since this function is the one actually holding
    // the privileged key.
    if (authUserId === caller.id) throw new Error('You cannot delete your own account')

    // ── 3. Delete the auth.users row with the service-role client ──
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error } = await adminClient.auth.admin.deleteUser(authUserId)
    // "User not found" here means auth.users already has no row for this
    // ID — e.g. a demo/seed account created directly in public.users
    // without ever going through Supabase Auth signup, or an auth
    // account that was already removed some other way in the past. Either
    // way, the actual GOAL of this step ("no live auth.users row for this
    // ID") is already true, so treating it as a hard failure only ever
    // blocked usersService.deleteUser() from ever reaching the
    // public.users delete — the row became permanently undeletable
    // through the app, even though there was nothing left to protect
    // against orphaning. Any OTHER error (network, permissions, a real
    // Auth service failure) still fails loudly as before.
    const alreadyGone = error && /user not found/i.test(error.message || '')
    if (error && !alreadyGone) throw error

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