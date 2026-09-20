// supabase/functions/verify-email-domain/index.ts
//
// Checks that a registration email's DOMAIN can actually receive mail
// (has real MX records) before registration is allowed to proceed —
// catches typo'd or nonexistent domains (e.g. "gmial.com", "yaho.com",
// a company domain that was mistyped) at the moment someone submits the
// email, instead of only finding out later when the confirmation email
// silently bounces.
//
// ── What this can and can't actually verify — read before relying on it ──
// This is a DOMAIN check, not a mailbox check. It answers "can this
// domain receive email at all", not "does this exact address exist".
// "doesnotexist12345@gmail.com" passes this check every time — gmail.com
// itself is a completely valid, real mail domain; genuinely confirming
// one SPECIFIC mailbox exists without sending a real email to it isn't
// something a browser or an Edge Function can do at all: it would need
// either a paid third-party verification API (Abstract, ZeroBounce,
// NeverBounce, etc. — a recurring cost and a new external dependency
// this app doesn't have) or a raw SMTP handshake probe (outbound port 25
// is blocked by nearly every cloud host, Deno Deploy included, and many
// real mail servers refuse to answer this kind of probe honestly
// anyway). The app's REAL mailbox-level verification is, and remains,
// the existing email-confirmation-link flow (registerPatient() in
// usersService.js) — a person only gets a working account once they've
// actually clicked a link that was delivered to that inbox. This
// function is purely a faster, friendlier first line of defense against
// an obvious typo, not a replacement for that.
//
// Deploy with:
//
//   supabase functions deploy verify-email-domain
//
// No secrets required — this only makes an outbound DNS query, it
// doesn't touch the database or Supabase Auth at all. Callable while
// signed out (registration happens before any session exists).

const corsHeaders = {
  'Access-Control-Allow-Origin': '*', // tighten to your actual domain in production
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// A handful of domains that are real, well-known, and DO have MX
// records, but are consumer webmail providers with wildly overloaded
// DNS infrastructure that occasionally answers a DNS-over-HTTPS query
// slower than this function's own timeout — skipping the live lookup
// for these avoids a false "domain doesn't exist" rejection for the
// most common addresses real people actually register with.
const KNOWN_GOOD_DOMAINS = new Set([
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'live.com', 'aol.com', 'protonmail.com',
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
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

    // Google's public DNS-over-HTTPS resolver — free, no API key, no
    // rate-limit concerns for this app's realistic volume.
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
      console.error('[VERIFY_EMAIL_DOMAIN] DNS resolver returned', dnsRes.status, '— failing open')
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