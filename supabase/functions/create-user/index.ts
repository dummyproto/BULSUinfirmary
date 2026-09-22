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
//    by email (mode: 'invite' — Supabase emails them a set-password link,
//    no password ever passes through this app) or create them with an
//    admin-chosen initial password (mode: 'password', default) that is
//    still unconfirmed until they click the verification email — same as
//    'invite', just with a known starting password instead of one the new
//    user picks themselves. Either way the account can't log in until the
//    email is confirmed; only 'invite' skips issuing a password at all.
// 3. Returns the new `auth.users` UUID so the client can create the
//    matching `public.users` row with `auth_user_id` already linked —
//    skipping the "link on first login" bridge entirely for admin-created
//    accounts.

import { createClient } from '@supabase/supabase-js'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your actual domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type UserRole = 'admin' | 'staff' | 'patient'
type CreateMode = 'password' | 'invite'

interface CreateUserRequestBody {
  email: string
  name: string
  role: UserRole
  mode?: CreateMode
  temporaryPassword?: string
}

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

// `Deno` is a global provided by the Deno runtime this function actually
// executes in (see deno.enablePaths in .vscode/settings.json). Some editors'
// default JS/TS language service doesn't know about Deno globals and flags
// them as "Cannot find name 'Deno'" even though the code is correct and
// Deno's own checker has no issue with it — @ts-ignore silences just that,
// in exactly one place, rather than fighting editor config.
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
      throw new Error('Forbidden — only admins can create new users')
    }

    // ── 2. Validate the request body ──
    const { email, name, role, mode = 'password', temporaryPassword } =
      (await req.json()) as CreateUserRequestBody
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
      // email_confirm: false (not true) — the whole point of this mode is
      // an admin-set STARTING password the new user can change later in
      // Account Settings, not a shortcut around verification. Leaving the
      // account unconfirmed here means Supabase Auth still blocks sign-in
      // until the link below is clicked, exactly like 'invite' does.
      const { data, error } = await adminClient.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: false,
        user_metadata: { name, role },
      })
      if (error) throw error
      created = data

      // admin.createUser() does NOT send any email by itself — it only
      // writes the row. .resend() is what actually asks Auth to send the
      // pending "confirm your signup" email, which routes through the
      // same send-verification-email Hook (case 'signup') as every other
      // confirmation email in this app. A failure here is non-fatal: the
      // account still exists, just without a verification email sent yet
      // — surfaced back to the caller as resendFailed so the UI can warn
      // the admin instead of silently leaving the new user stuck.
      const { error: resendError } = await adminClient.auth.resend({ type: 'signup', email })
      if (resendError) {
        return jsonResponse({ authUserId: created.user.id, mode, resendFailed: resendError.message })
      }
    } else {
      const { data, error } = await adminClient.auth.admin.inviteUserByEmail(email, {
        data: { name, role },
      })
      if (error) throw error
      created = data
    }

    return jsonResponse({ authUserId: created.user!.id, mode })
  } catch (err) {
    return jsonResponse({ error: errorMessage(err) }, 400)
  }
})