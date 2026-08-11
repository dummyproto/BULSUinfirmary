import { supabase } from './supabaseClient'

/**
 * Wrapper around supabase.functions.invoke() that surfaces the REAL
 * failure reason instead of a generic one.
 *
 * ── Why this exists ──
 * Every Edge Function in supabase/functions/ ends with the same
 * catch-all shape:
 *
 *   catch (err) { return jsonResponse({ error: err.message }, 400) }
 *
 * So EVERY server-side failure — a missing Authorization header, a
 * non-admin caller, a missing/invalid body field, an unset secret, an
 * expired session, or the actual Supabase Auth admin call failing —
 * comes back as one indistinguishable `400 (Bad Request)`, with the
 * only thing that tells them apart sitting in the response BODY.
 *
 * supabase-js does not read that body. On a non-2xx it hands back a
 * FunctionsHttpError whose `.message` is always the same generic
 * string ("Edge Function returned a non-2xx status code"), and stashes
 * the raw Response object on `.context`. Code that throws `error`
 * directly therefore shows the person a message that identifies
 * nothing, which is why a failed delete looked like an unexplained 400
 * in the console with no usable reason in the UI toast.
 *
 * This reads `.context` and pulls out the function's own `error` text,
 * falling back to the generic message only if the body genuinely can't
 * be read or parsed — so the reason is never silently lost either way.
 *
 * (emergencyAlertsService.sendSms() already did exactly this inline for
 * the send-sms function; this is that same logic factored out so every
 * other Edge Function call gets it too, rather than each call site
 * re-implementing it or — as was the case — going without.)
 *
 * @param {string} name  Edge Function name, e.g. 'delete-user'
 * @param {object} body  JSON payload for the function
 * @returns {Promise<any>} the function's parsed success payload
 */
export async function invokeEdgeFunction(name, body) {
  const { data, error } = await supabase.functions.invoke(name, { body })

  if (error) {
    let detailedMessage = error.message

    try {
      // .context is the raw Response. Cloning first so this helper
      // never consumes a body a caller might still want to read.
      const parsed = await error.context?.clone().json()
      if (parsed?.error) detailedMessage = parsed.error
    } catch {
      // Body wasn't JSON, was already consumed, or .context wasn't
      // available (e.g. a network-level failure rather than an HTTP
      // error response) — fall back to error.message above.
    }

    // A network-level failure never reaches the function at all, so
    // there's no server-side reason to surface — flag it as such
    // rather than letting it read like the function rejected the
    // request on its merits.
    if (error.name === 'FunctionsFetchError' || /failed to fetch/i.test(detailedMessage)) {
      detailedMessage =
        `Could not reach the "${name}" service. Check your internet connection, ` +
        `and that the Supabase project URL in your environment is correct and the project is active.`
    }

    throw new Error(detailedMessage)
  }

  // Some functions return 200 with an { error } payload rather than a
  // non-2xx status — handled here too so callers only need one check.
  if (data?.error) throw new Error(data.error)

  return data
}