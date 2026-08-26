// supabase/functions/send-verification-email/index.ts
//
// Auth "Send Email" Hook — replaces Supabase's built-in auth email sender
// so the account-verification email can include a generated QR code.
//
// ── Why this exists ──
// Registration (registerPatient() in src/services/usersService.js) already
// requires email confirmation before finalizeSelfRegistration() writes the
// public.users/patient_profiles rows — see that file's comments. That part
// needed no changes. What Supabase's DEFAULT confirmation email can't do is
// embed a per-user generated image (its templates are static HTML edited in
// the Dashboard). This function takes over sending EVERY auth email
// (signup, recovery, invite, magic link, email change) so it can generate
// and embed a QR code of the confirmation/reset link.
//
// ── Deploy ──
//   supabase functions deploy send-verification-email --no-verify-jwt
//
// (--no-verify-jwt because Supabase Auth calls this server-to-server with
// its OWN signed webhook payload, not a user JWT — see verification below.)
//
// ── Required secrets ──
//   supabase secrets set RESEND_API_KEY=your_resend_api_key
//   supabase secrets set RESEND_FROM_EMAIL="BulSU Clinic <onboarding@resend.dev>"
//   supabase secrets set SEND_EMAIL_HOOK_SECRET=v1,whsec_xxxxxxxxxxxx
//
// (SEND_EMAIL_HOOK_SECRET is generated FOR you by Supabase the moment you
// enable the hook below — copy it from there, don't invent one.)
//
// ── One-time Dashboard setup (can't be done from code) ──
//   1. Deploy this function (command above) and copy its URL, e.g.
//      https://<project-ref>.supabase.co/functions/v1/send-verification-email
//   2. In the Supabase Dashboard: Authentication → Hooks → "Send Email hook"
//      → Enable → paste that URL → Save.
//   3. Copy the secret Supabase generates there and run the
//      `supabase secrets set SEND_EMAIL_HOOK_SECRET=...` command above with it.
//   4. Sign up for a free Resend account (https://resend.com), verify a
//      sending domain (or use their onboarding@resend.dev for testing), and
//      set RESEND_API_KEY / RESEND_FROM_EMAIL as above.
//   5. Try registering a new test account — the confirmation email should
//      now arrive with a QR code in it.
// Until step 2 is done, Supabase keeps sending its own plain default email
// (this function simply isn't called yet) — nothing breaks in the meantime.

import QRCode from 'https://esm.sh/qrcode@1.5.4'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const RESEND_FROM_EMAIL = Deno.env.get('RESEND_FROM_EMAIL') || 'onboarding@resend.dev'
const HOOK_SECRET = Deno.env.get('SEND_EMAIL_HOOK_SECRET') || ''

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

// Manual Standard Webhooks signature verification — replaces the
// `standardwebhooks` npm/esm.sh library, which repeatedly failed with a
// "Base64Coder: incorrect characters for decoding" error in this Deno
// Edge Runtime across three different secret-entry methods (typed,
// quoted, and pasted via Dashboard) — the same failure every time despite
// different secrets pointed strongly at a library/runtime incompatibility
// rather than a copy-paste mistake. This does the exact same check the
// library would, using only Deno's built-in Web Crypto (no external
// dependency to go wrong).
//
// Per the Standard Webhooks spec (which Supabase Auth Hooks follow):
//   secret format:     "v1,whsec_<base64-encoded-key>"
//   signed content:    "<webhook-id>.<webhook-timestamp>.<raw-body>"
//   signature header:  one or more space-separated "v1,<base64-signature>"
//                       values — a match against ANY of them is valid.
function secretToKeyBytes(secret) {
  const withoutVersion = secret.startsWith('v1,') ? secret.slice(3) : secret
  const base64Part = withoutVersion.startsWith('whsec_') ? withoutVersion.slice(6) : withoutVersion
  return Uint8Array.from(atob(base64Part), (c) => c.charCodeAt(0))
}

function bytesToBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

async function verifyStandardWebhook(payload, headers, secret) {
  const id = headers['webhook-id']
  const timestamp = headers['webhook-timestamp']
  const signatureHeader = headers['webhook-signature']
  if (!id || !timestamp || !signatureHeader) {
    throw new Error(`Missing required webhook headers (id=${!!id}, timestamp=${!!timestamp}, signature=${!!signatureHeader})`)
  }

  // Reject requests older than 5 minutes — standard replay-attack guard,
  // matches the tolerance the official standardwebhooks library uses.
  const timestampMs = Number(timestamp) * 1000
  if (!Number.isFinite(timestampMs) || Math.abs(Date.now() - timestampMs) > 5 * 60 * 1000) {
    throw new Error('Webhook timestamp is outside the allowed 5-minute tolerance')
  }

  const signedContent = `${id}.${timestamp}.${payload}`
  const keyBytes = secretToKeyBytes(secret)
  const cryptoKey = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(signedContent))
  const expectedSignature = bytesToBase64(new Uint8Array(signatureBuffer))

  // webhook-signature can list multiple "v1,<sig>" values space-separated
  // (relevant if a hook is ever configured with more than one secret) —
  // matching any one of them is a valid signature.
  const providedSignatures = signatureHeader
    .split(' ')
    .map((part) => part.split(',')[1])
    .filter(Boolean)

  if (!providedSignatures.includes(expectedSignature)) {
    throw new Error('No matching signature found')
  }

  return JSON.parse(payload)
}

// Per email_action_type copy — recovery is the odd one out: this app's
// ForgotPasswordModal/ResetPasswordPage flow (src/context/AuthContext.jsx)
// has the person TYPE IN the 6-digit `token`, not click a link, so that
// code has to be shown prominently in plain text too — the QR is a
// secondary, optional "or scan to open the reset page" convenience there,
// not the primary path like it is for signup.
function contentFor(actionType, { confirmUrl, token }) {
  switch (actionType) {
    case 'signup':
      return {
        subject: 'Verify your BulSU Clinic account',
        heading: 'Confirm your email address',
        body: `Thanks for registering with the BulSU Clinic Appointment & Patient System. Click the button below, or scan the QR code with your phone, to verify your email and activate your account. Your account will not be added to our records until this is confirmed.`,
        cta: 'Verify Email',
      }
    case 'recovery':
      return {
        subject: 'Reset your BulSU Clinic password',
        heading: 'Reset your password',
        body: `We received a request to reset your password. Enter this code on the reset page: <strong style="font-size:22px;letter-spacing:4px;">${token}</strong><br/><br/>Or click the button below, or scan the QR code, to open the reset page directly. If you didn't request this, you can safely ignore this email.`,
        cta: 'Reset Password',
      }
    case 'invite':
      return {
        subject: "You've been invited to BulSU Clinic",
        heading: 'Accept your invitation',
        body: `An administrator created an account for you on the BulSU Clinic Appointment & Patient System. Click the button below, or scan the QR code, to set your password and activate your account.`,
        cta: 'Accept Invite',
      }
    case 'email_change':
      return {
        subject: 'Confirm your new email address',
        heading: 'Confirm your new email',
        body: `Click the button below, or scan the QR code, to confirm this is your new email address for your BulSU Clinic account.`,
        cta: 'Confirm New Email',
      }
    default:
      return {
        subject: 'Your BulSU Clinic sign-in link',
        heading: 'Sign in',
        body: `Click the button below, or scan the QR code, to sign in to BulSU Clinic.`,
        cta: 'Sign In',
      }
  }
}

function buildEmailHtml({ heading, body, cta, confirmUrl }) {
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

Deno.serve(async (req) => {
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)
  if (!RESEND_API_KEY) return jsonResponse({ error: { message: 'RESEND_API_KEY is not configured' } }, 500)

  const payload = await req.text()
  const headers = Object.fromEntries(req.headers)

  let user, email_data
  try {
    if (!HOOK_SECRET) {
      throw new Error('SEND_EMAIL_HOOK_SECRET is empty/unset in this function\'s secrets')
    }
    // TEMPORARY DIAGNOSTIC — safe to log: reveals only the secret's
    // length and first/last few characters (never the middle), plus
    // which of the three required Standard Webhooks headers actually
    // arrived. Remove this console.error once verification is confirmed
    // working end-to-end.
    console.error('DIAGNOSTIC', JSON.stringify({
      secretLength: HOOK_SECRET.length,
      secretPreview: `${HOOK_SECRET.slice(0, 10)}...${HOOK_SECRET.slice(-6)}`,
      hasWebhookId: !!headers['webhook-id'],
      hasWebhookTimestamp: !!headers['webhook-timestamp'],
      hasWebhookSignature: !!headers['webhook-signature'],
    }))
    // Verifies this request genuinely came from Supabase Auth — without
    // this, anyone who found this function's URL could make it blast
    // arbitrary email through your Resend account.
    const verified = await verifyStandardWebhook(payload, headers, HOOK_SECRET)
    user = verified.user
    email_data = verified.email_data
  } catch (err) {
    console.error('send-verification-email signature check failed:', err?.message || err)
    return jsonResponse({ error: { message: `Invalid webhook signature: ${err?.message || err}` } }, 401)
  }

  try {
    const { token, token_hash, redirect_to, email_action_type } = email_data

    // Same confirmation-link shape Supabase's own default template uses —
    // hits Supabase's own /auth/v1/verify endpoint, which validates the
    // token_hash then redirects on to `redirect_to` (this app's
    // emailRedirectTo: `${window.location.origin}/login`, set in
    // usersService.js's registerPatient()/resendConfirmationEmail()).
    const confirmUrl =
      `${SUPABASE_URL}/auth/v1/verify?token=${encodeURIComponent(token_hash)}` +
      `&type=${encodeURIComponent(email_action_type)}` +
      `&redirect_to=${encodeURIComponent(redirect_to)}`

    // Generate the QR code server-side, sent as a CID-embedded attachment
    // (not a data: URI in <img src>) — several major email clients (Gmail
    // among them) strip inline base64 images but do render CID-embedded
    // attachment images correctly.
    //
    // Uses toDataURL (a plain string) rather than toBuffer — toBuffer
    // relies on Node's Buffer semantics, which is a common source of
    // silent failures in Supabase's Deno-based Edge Runtime. toDataURL
    // avoids that entirely; we just strip the "data:image/png;base64,"
    // prefix to get the same raw base64 payload Resend's attachment
    // `content` field expects.
    const qrDataUrl = await QRCode.toDataURL(confirmUrl, {
      type: 'image/png',
      width: 440,
      margin: 2,
      color: { dark: '#0f172a', light: '#ffffff' },
    })
    const qrBase64 = qrDataUrl.split(',')[1]

    const { subject, heading, body, cta } = contentFor(email_action_type, { confirmUrl, token })

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [user.email],
        subject,
        html: buildEmailHtml({ heading, body, cta, confirmUrl }),
        attachments: [
          {
            filename: 'verification-qr.png',
            content: qrBase64,
            content_id: 'qrcode',
          },
        ],
      }),
    })

    if (!res.ok) {
      const errBody = await res.text()
      throw new Error(`Resend API error (${res.status}): ${errBody}`)
    }
  } catch (err) {
    // Whatever went wrong (QR generation, Resend API, etc.), log it in
    // full server-side (visible in Dashboard -> Edge Functions ->
    // send-verification-email -> Logs) and return a proper JSON error
    // response rather than letting an unexpected throw crash the
    // function — Supabase Auth surfaces THIS response's content as the
    // reason the signup/reset call itself failed for the end user.
    console.error('send-verification-email failed:', err)
    return jsonResponse({ error: { http_code: 500, message: err?.message || String(err) } }, 500)
  }

  return jsonResponse({})
})