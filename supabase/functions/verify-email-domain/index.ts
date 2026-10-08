// supabase/functions/verify-email-domain/index.ts
//
// Checks that a registration email's DOMAIN has real MX records (catches
// typos like "gmial.com"). It is a DOMAIN check, not a mailbox check; the
// real mailbox verification is still the email-confirmation-link flow.
//
// Deploy with:
//   supabase functions deploy verify-email-domain --no-verify-jwt
//
// No secrets required. Callable while signed out.

// Makes this file a module so its top-level names don't clash with other
// function files in the editor (no effect at runtime).
export {}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your actual domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

const KNOWN_GOOD_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'live.com', 'aol.com', 'protonmail.com',
])

Deno.serve(async (req) => {
  // Preflight must return a 2xx with the CORS headers
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405)

  try {
    const { email } = await req.json()
    if (typeof email !== 'string' || !email.includes('@')) {
      return jsonResponse({ error: 'A valid email address is required' }, 400)
    }

    const domain = email.trim().toLowerCase().split('@')[1]
    if (!domain) return jsonResponse({ error: 'A valid email address is required' }, 400)

    if (KNOWN_GOOD_DOMAINS.has(domain)) {
      return jsonResponse({ valid: true, domain })
    }

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    let dnsRes
    try {
      dnsRes = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(domain)}&type=MX`, {
        signal: controller.signal,
      })
    } catch (fetchErr) {
      console.error('[VERIFY_EMAIL_DOMAIN] DNS lookup failed, failing open:', fetchErr instanceof Error ? fetchErr.message : fetchErr)
      return jsonResponse({ valid: true, domain, checked: false })
    } finally {
      clearTimeout(timeout)
    }

    if (!dnsRes.ok) {
      console.error('[VERIFY_EMAIL_DOMAIN] DNS resolver returned', dnsRes.status, '- failing open')
      return jsonResponse({ valid: true, domain, checked: false })
    }

    const dnsData = await dnsRes.json()
    const hasMx = dnsData.Status === 0 && Array.isArray(dnsData.Answer) && dnsData.Answer.length > 0

    return jsonResponse({ valid: hasMx, domain, checked: true })
  } catch (err) {
    console.error('[VERIFY_EMAIL_DOMAIN_UNEXPECTED_ERROR]', err)
    return jsonResponse({ valid: true, checked: false })
  }
})