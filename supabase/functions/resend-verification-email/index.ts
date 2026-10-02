// supabase/functions/resend-verification-email/index.ts
//
// Admin-only "Resend Verification" for Maintenance -> User Management.
// Deploy with:
//
//   supabase functions deploy resend-verification-email
//
// Uses the same secrets as the other functions (SUPABASE_URL,
// SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY) plus the ones the
// send-verification-email hook already uses: RESEND_API_KEY and
// RESEND_FROM_EMAIL.
//
// ── Why this isn't just supabase.auth.resend() ──
// auth.resend({ type: 'signup' }) (a) does nothing for an account that has
// already verified, and (b) is throttled by Supabase to one email per address
// per minute, so a second click soon after the first fails. This function
// instead generates a fresh one-time link server-side with the service-role
// key (generateLink is not subject to that throttle and works whether or not
// the account is verified) and emails it itself through Resend, with the same
// look (button + QR code) as the send-verification-email hook. Every call
// sends a brand-new email, even if one was sent before.
//
//   * Unverified account -> "Verify your BulSU Clinic account". Opening the
//     link confirms the email address.
//   * Already-verified account -> "Your BulSU Clinic sign-in link".

// createClient and qrcode are imported inside the request handler (not at the
// top of the file) on purpose: if either import fails to load in the Edge
// runtime, the function still boots, answers the browser's CORS preflight, and
// returns the real reason as a normal error message — instead of crashing at
// startup, which the browser reports only as a confusing "blocked by CORS
// policy / ERR_FAILED".

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your actual domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

function denoEnv(key: string): string | undefined {
  // @ts-ignore -- Deno global
  return Deno.env.get(key)
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] as string))
}

function buildEmailHtml({ heading, body, cta, confirmUrl }: { heading: string; body: string; cta: string; confirmUrl: string }): string {
  return `
  <div style="font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px; color: #1a1a1a;">
    <h2 style="margin: 0 0 16px; font-size: 20px;">${heading}</h2>
    <p style="font-size: 14px; line-height: 1.6; margin: 0 0 24px;">${body}</p>
    <div style="text-align: center; margin: 0 0 24px;">
      <a href="${confirmUrl}" style="display:inline-block; background:#0f766e; color:#fff; text-decoration:none; font-weight:600; font-size:14px; padding:12px 28px; border-radius:8px;">${cta}</a>
    </div>
    <div style="text-align: center; margin: 0 0 24px;">
      <img src="cid:qrcode" width="220" height="220" alt="QR code — scan to ${cta.toLowerCase()}" style="display:inline-block; border:8px solid #fff; box-shadow:0 0 0 1px #e5e7eb;" />
      <p style="font-size: 12px; color:#6b7280; margin: 10px 0 0;">Scan with your phone's camera</p>
    </div>
    <p style="font-size: 11px; color: #9ca3af; word-break: break-all; margin: 0;">
      Or paste this link into your browser: ${confirmUrl}
    </p>
  </div>`
}

// @ts-ignore -- Deno global
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  const SUPABASE_URL = denoEnv('SUPABASE_URL')
  const SUPABASE_ANON_KEY = denoEnv('SUPABASE_ANON_KEY')
  const SUPABASE_SERVICE_ROLE_KEY = denoEnv('SUPABASE_SERVICE_ROLE_KEY')
  const RESEND_API_KEY = denoEnv('RESEND_API_KEY')
  const RESEND_FROM_EMAIL = denoEnv('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: 'Server is missing required Supabase configuration' }, 500)
  }
  if (!RESEND_API_KEY) return jsonResponse({ error: 'RESEND_API_KEY is not configured for this function' }, 500)

  try {
    const { createClient } = await import('@supabase/supabase-js')

    // ── 1. Caller must be a signed-in admin ──
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
    if (callerRowError || callerRow?.role !== 'admin') throw new Error('Forbidden — only admins can resend verification emails')

    // ── 2. Look up the target account ──
    const { userId, redirectTo } = await req.json()
    if (!userId) throw new Error('userId is required')

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: target, error: targetError } = await adminClient
      .from('users')
      .select('email, name, auth_user_id')
      .eq('user_id', userId)
      .single()
    if (targetError || !target) throw new Error('User not found')
    const email = (target.email || '').trim().toLowerCase()
    if (!email) throw new Error('This account has no email address on file')

    // Is the auth login already verified? Looked up by id when linked,
    // otherwise by email.
    let alreadyVerified = false
    let authFound = false
    if (target.auth_user_id) {
      const { data, error } = await adminClient.auth.admin.getUserById(target.auth_user_id)
      if (!error && data?.user) {
        authFound = true
        alreadyVerified = !!data.user.email_confirmed_at
      }
    }
    if (!authFound) {
      for (let page = 1; page <= 20 && !authFound; page++) {
        const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 })
        if (error) throw error
        const match = (data?.users ?? []).find((u) => (u.email || '').toLowerCase() === email)
        if (match) {
          authFound = true
          alreadyVerified = !!match.email_confirmed_at
        }
        if ((data?.users ?? []).length < 1000) break
      }
    }
    if (!authFound) {
      throw new Error('This account has no login to verify yet (profile only). Delete and re-add the user so a login is created.')
    }

    // ── 3. Fresh one-time link (not throttled, works verified or not) ──
    const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: 'magiclink',
      email,
      options: redirectTo ? { redirectTo } : undefined,
    })
    if (linkError) throw linkError
    const hashedToken = linkData?.properties?.hashed_token
    if (!hashedToken) throw new Error('Could not generate a verification link')

    const confirmUrl =
      `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(hashedToken)}` +
      `&type=magiclink` +
      (redirectTo ? `&redirect_to=${encodeURIComponent(redirectTo)}` : '')

    // ── 4. Email it via Resend, with the same QR-code layout as the hook ──
    // @ts-ignore -- qrcode ships no type declarations the editor can find; Deno
    // resolves and runs it fine via the import map in ../deno.json.
    const { default: QRCode } = await import('qrcode')
    const qrDataUrl: string = await QRCode.toDataURL(confirmUrl, {
      type: 'image/png',
      width: 440,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
    const qrBase64 = qrDataUrl.split(',')[1]

    const name = escapeHtml(target.name || 'there')
    const content = alreadyVerified
      ? {
          subject: 'Your BulSU Clinic sign-in link',
          heading: 'Sign in to BulSU Clinic',
          body: `Hi ${name}, an administrator sent you a new sign-in link. Your email is already verified. Click the button below, or scan the QR code with your phone, to open BulSU Clinic.`,
          cta: 'Sign In',
        }
      : {
          subject: 'Verify your BulSU Clinic account',
          heading: 'Confirm your email address',
          body: `Hi ${name}, an administrator sent you a new verification email. Click the button below, or scan the QR code with your phone, to verify your email and activate your account. You will not be able to log in until this is confirmed.`,
          cta: 'Verify Email',
        }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [email],
        subject: content.subject,
        html: buildEmailHtml({ heading: content.heading, body: content.body, cta: content.cta, confirmUrl }),
        attachments: [{ filename: 'verification-qr.png', content: qrBase64, content_id: 'qrcode' }],
      }),
    })
    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Resend API error (${res.status}): ${errBody}`)
    }

    return jsonResponse({ sent: true, alreadyVerified, email })
  } catch (err) {
    return jsonResponse({ error: errorMessage(err) }, 400)
  }
})