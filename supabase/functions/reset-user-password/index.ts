// supabase/functions/reset-user-password/index.ts
//
// Server-side admin password reset — System Maintenance -> User
// Management's "Change Password" action. Supabase's client SDK only
// lets a signed-in user change their OWN password (auth.updateUser) or
// send themselves a reset-link email (resetPasswordForEmail, used by
// "Forgot password?" on LoginPage) — there's no client-callable way for
// one user to directly set another's password. That requires the
// service-role key (supabase.auth.admin.updateUserById), which must
// never be shipped to the browser, so — same shape as create-user/ and
// delete-user/ already in this folder — this function is the only safe
// place that key can live. Deploy with:
//
//   supabase functions deploy reset-user-password
//
// Uses the same three secrets as create-user/ and delete-user/ (already
// set if either of those is deployed):
//
//   supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
//   supabase secrets set SUPABASE_ANON_KEY=your-anon-key
//
// ── What this does ──
// 1. Verifies the caller is authenticated AND has role='admin' in
//    public.users (checked via a client scoped to the CALLER's own JWT,
//    so it's fully subject to the Phase A RLS policies — no bypass
//    here). Identical check to create-user/ and delete-user/.
// 2. Only then uses the service-role client to set the target
//    auth.users row's password by UUID.

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
      throw new Error('Forbidden — only admins can reset another user\u2019s password')
    }

    // ── 2. Validate the request body ──
    const { authUserId, newPassword } = await req.json()
    if (!authUserId) throw new Error('authUserId is required')
    if (!newPassword || newPassword.length < 8) {
      throw new Error('newPassword must be at least 8 characters')
    }

    // ── 3. Set the password with the service-role client ──
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { error } = await adminClient.auth.admin.updateUserById(authUserId, {
      password: newPassword,
    })
    if (error) throw error

    return jsonResponse({ reset: true })
  } catch (err) {
    return jsonResponse({ error: err.message }, 400)
  }
})