// supabase/functions/create-user/index.ts
//
// Server-side user provisioning — this is the piece Maintenance's "Add
// User" flow could never do safely from the browser (see the architecture
// note at the top of src/services/usersService.js). Deploy with:
//
//   supabase functions deploy create-user
//
// Required secrets (set once, never exposed to the client):
//
//   supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
//   supabase secrets set SUPABASE_ANON_KEY=your-anon-key
//
// (SUPABASE_URL and SUPABASE_ANON_KEY are auto-injected by the Supabase
// platform in most cases — the explicit `secrets set` above is only needed
// if you're running this locally via `supabase functions serve`.)
//
// ── What this does ──
// 1. Verifies the caller is authenticated AND has role='admin' in
//    public.users (checked via a client scoped to the CALLER's own JWT, so
//    it's fully subject to the Phase A RLS policies — no bypass here).
// 2. Only then uses the service-role client to either invite the new user
//    by email (mode: 'invite', default — Supabase emails them a set-password
//    link, no password ever passes through this app) or create them with
//    an admin-chosen temporary password (mode: 'password', for projects
//    without email sending configured).
// 3. Returns the new `auth.users` UUID so the client can create the
//    matching `public.users` row with `auth_user_id` already linked —
//    skipping the "link on first login" bridge entirely for admin-created
//    accounts.

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
      throw new Error('Forbidden — only admins can create new users')
    }

    // ── 2. Validate the request body ──
    const { email, name, role, mode = 'invite', temporaryPassword } = await req.json()
    if (!email || !name || !role) throw new Error('email, name, and role are required')
    if (!['admin', 'staff', 'patient'].includes(role)) throw new Error('role must be admin, staff, or patient')
    if (mode === 'password' && (!temporaryPassword || temporaryPassword.length < 8)) {
      throw new Error('temporaryPassword must be at least 8 characters when mode is "password"')
    }

    // ── 3. Create the auth.users row with the service-role client ──
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    let created
    if (mode === 'password') {
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true, // skip the confirmation email since an admin is vouching for this account
        user_metadata: { name, role },
      })
      if (error) throw error
      created = data
    } else {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { name, role },
      })
      if (error) throw error
      created = data
    }

    return jsonResponse({ authUserId: created.user.id, mode })
  } catch (err) {
    return jsonResponse({ error: err.message }, 400)
  }
})
