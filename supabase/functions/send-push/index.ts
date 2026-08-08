// supabase/functions/send-push/index.ts
//
// Sends a real Web Push notification to every device a target user (or
// role) has subscribed on, via push_subscriptions (migration 031).
// Called from notify()/notifyIfNew() in notificationsService.js right
// after a row is inserted into `notifications` — this is what turns an
// in-app notification into one that also reaches the device itself
// (lock screen / notification tray), even if the app isn't open.
//
// ── Before this works ──
// The VAPID key pair was generated once for this project. Set the
// private half as a secret (never the public half — that one belongs
// in .env.local as VITE_VAPID_PUBLIC_KEY, since the browser needs it to
// subscribe):
//
//   supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
//   supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
//   supabase secrets set VAPID_SUBJECT=mailto:your-real-contact-email@example.com
//
// (VAPID_SUBJECT identifies who's sending, for push services' own abuse
// contact purposes — must be a real mailto: or https: URL, not a
// placeholder; some push services reject requests without one.)
//
// Also needs the same three secrets as the other Edge Functions in this
// folder — SUPABASE_ANON_KEY verifies the caller is a genuine logged-in
// user before anything else runs; SUPABASE_SERVICE_ROLE_KEY then looks
// up subscriptions with elevated access (a caller can only see their
// OWN push_subscriptions rows per RLS — migration 031 — but a
// notification's targetUserId is very often someone other than
// whoever triggered it, e.g. a patient's alert going to staff):
//
//   supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
//   supabase secrets set SUPABASE_ANON_KEY=your-anon-key
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
//
// Deploy with:
//   supabase functions deploy send-push

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'https://esm.sh/web-push@3.6.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
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
  const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
  const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
  const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT')

  try {
    // Requires the caller to be a genuine logged-in user of this app —
    // matching the same minimum bar notifications_insert already
    // requires (TO authenticated, see migration 001). Deliberately does
    // NOT restrict by role beyond that: the notifications table itself
    // already trusts any authenticated user to notify anyone else (a
    // patient notifying staff about a new request needs exactly that),
    // so requiring more here would just break legitimate patient-
    // triggered flows without actually raising the real security bar —
    // this app's accepted trust model is already "any logged-in user,
    // not literally anyone with the public anon key and no session at
    // all," and that's the bar this restores.
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

    const { targetUserId, targetRole, title, body, url, tag } = await req.json()
    if (!title || !body) throw new Error('title and body are required')
    if (!targetUserId && !targetRole) throw new Error('targetUserId or targetRole is required')

    if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
      // Fails loudly rather than pretending to succeed — same principle
      // as send-sms/index.ts's identical check.
      throw new Error('Push is not configured yet — set VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY (see the comment at the top of this file) and redeploy.')
    }

    webpush.setVapidDetails(VAPID_SUBJECT || 'mailto:admin@example.com', VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

    // Mirrors notify()'s own targeting: a specific user, OR everyone
    // currently holding a role (e.g. every staff account, for an
    // emergency alert). Never both — same XOR the notifications table
    // itself enforces via its own CHECK constraint.
    let query = adminClient.from('push_subscriptions').select('*')
    if (targetUserId) {
      query = query.eq('user_id', targetUserId)
    } else {
      const { data: roleUsers, error: roleErr } = await adminClient.from('users').select('user_id').eq('role', targetRole)
      if (roleErr) throw roleErr
      const ids = (roleUsers || []).map((u) => u.user_id)
      if (ids.length === 0) return jsonResponse({ sent: 0, failed: 0 })
      query = query.in('user_id', ids)
    }

    const { data: subscriptions, error: subError } = await query
    if (subError) throw subError
    if (!subscriptions || subscriptions.length === 0) return jsonResponse({ sent: 0, failed: 0 })

    const payload = JSON.stringify({ title, body, url: url || '/dashboard', tag: tag || undefined })

    let sent = 0
    let failed = 0
    const staleEndpoints = []

    // Sequential, not Promise.all — a burst of simultaneous requests to
    // the same push service (many subscriptions on the same provider,
    // e.g. several staff all on Chrome/FCM) risks tripping that
    // provider's own rate limiting. This function already only runs
    // once per notification, not on a hot path, so the small time cost
    // of sequential sending isn't noticeable in practice.
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload
        )
        sent++
      } catch (err) {
        failed++
        // 404/410 from the push service means that specific
        // subscription is permanently dead (browser data cleared,
        // extension/app uninstalled, etc.) — not a transient failure,
        // so the row is cleaned up rather than left to fail forever on
        // every future notification.
        if (err.statusCode === 404 || err.statusCode === 410) {
          staleEndpoints.push(sub.endpoint)
        }
      }
    }

    if (staleEndpoints.length > 0) {
      await adminClient.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
    }

    return jsonResponse({ sent, failed, staleRemoved: staleEndpoints.length })
  } catch (err) {
    return jsonResponse({ error: err.message }, 400)
  }
})