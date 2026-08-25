import { supabase } from './supabaseClient'
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

    const err = new Error(detailedMessage)
    // The real HTTP status (e.g. 429 from chat-completion forwarding
    // Groq's own rate limit) — callers that need to react differently to
    // "rate limited" vs. "genuinely broken" (see chatService.getAiReply /
    // ChatbotPage's cooldown) would otherwise have to guess by matching
    // on message text, which breaks the moment the wording changes.
    // undefined for a network-level failure, which never got a Response.
    err.status = error.context?.status
    throw err
  }

  // Some functions return 200 with an { error } payload rather than a
  // non-2xx status — handled here too so callers only need one check.
  if (data?.error) throw new Error(data.error)

  return data
}