import { useEffect, useRef, useState, lazy, Suspense } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import { useConfirm } from '@context/ConfirmContext'
import Spinner from '@components/ui/Spinner'
import { listDocumentRequests } from '@services/documentRequestsService'
import { getOrCreateActiveConversation, addMessage, createConversation, getAiReply, listConversationsForUser, listRecentUserMessages, deleteAllConversationsForUser } from '@services/chatService'
import { classifyIntent, getBotReply, isHealthConcernMessage } from './lib/botEngine'
import { useSpeechSynthesis } from '@hooks/useSpeechSynthesis'
import Toggle from '@components/ui/Toggle'
import ChatMessage, { toSpeechText } from './ChatMessage'
import ChatLogModal from './ChatLogModal'
import BotFace from './BotFace'
import {
  ClockIcon,
  MapPinIcon,
  BuildingIcon,
  DocumentIcon,
  ConsultationIcon,
  PillIcon,
  AlertOctagonIcon,
  ClipboardIcon,
  BarChartIcon,
  TrashIcon,
  ChatbotIcon,
  PhoneIcon,
  MailIcon,
  InfoIcon,
  XIcon,
  AlertTriangleIcon,
} from '@components/ui/icons'

const EmergencyReportModal = lazy(() => import('@features/emergency-alerts/EmergencyReportModal'))

const BOT_NAME = 'MediBot'

const TOPICS = [
  { Icon: ClockIcon, label: 'Clinic Hours', q: 'clinic hours' },
  { Icon: MapPinIcon, label: 'Location', q: 'location' },
  { Icon: BuildingIcon, label: 'Services', q: 'services' },
  { Icon: DocumentIcon, label: 'Documents', q: 'documents' },
  { Icon: ConsultationIcon, label: 'Symptom Check', q: 'symptom check' },
  { Icon: PillIcon, label: 'Health Tips', q: 'health tips' },
  { Icon: AlertOctagonIcon, label: 'Emergency', q: 'emergency' },
  { Icon: ClipboardIcon, label: 'Pre-Clinic', q: 'prepare for clinic visit' },
]

function greetingMessage() {
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return {
    type: 'bot',
    text: `${greet}! I'm <strong>MediBot</strong>, your 24/7 intelligent clinic assistant.<br><br>I can help you with clinic information, health tips, symptom checking, document guidance, and <strong>emotional support</strong>.<br><br>How are you feeling today?`,
    ts: new Date().toISOString(),
  }
}

// Matches "sos" as a standalone word (not part of another word like
// "sostenuto"), case-insensitive — typing it anywhere in a message
// triggers the emergency form instead of a normal bot reply.
function isSosTrigger(text) {
  return /\bsos\b/i.test(text)
}

// Voice Mode is a per-device UI preference, not sensitive/account data
// — same reasoning as ThemeContext.jsx's dark/light mode persistence.
// Without this, turning it off only lasted until the next refresh,
// since it was plain in-memory React state with nothing writing it
// anywhere persistent.
const VOICE_MODE_STORAGE_KEY = 'chatbot_voice_mode'
function getInitialVoiceMode() {
  try {
    const stored = localStorage.getItem(VOICE_MODE_STORAGE_KEY)
    // Only an explicit "off" ever overrides the default-on behavior —
    // anything else (never set yet, a corrupted value, storage
    // blocked) falls back to true, matching what every user already
    // saw before this had any persistence at all.
    return stored !== 'off'
  } catch {
    return true
  }
}

export default function ChatbotPage() {
  const { profile, role } = useAuth()
  const { show } = useToast()
  const confirm = useConfirm()
  const firstName = profile?.name?.split(' ')[0]
  // Scoped to this patient's own requests, same as My Requests page. Fetched
  // once on mount — the chatbot only needs a status summary, not live
  // updates, so no need to refetch on every message.
  const [myDocRequests, setMyDocRequests] = useState([])

  useEffect(() => {
    if (!profile?.user_id) return
    listDocumentRequests({ patientId: profile.user_id })
      .then(setMyDocRequests)
      .catch((err) => show(`Failed to load your document requests: ${err.message}`, 'error'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id])

  const [messages, setMessages] = useState([])
  const [conversationId, setConversationId] = useState(null)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [awaitingSymptoms, setAwaitingSymptoms] = useState(false)
  const [inputValue, setInputValue] = useState('')
  const [typing, setTyping] = useState(false)
  const [logOpen, setLogOpen] = useState(false)
  const { speakingId, toggle: toggleSpeak, stop: stopSpeaking, supported: speechOutputSupported } = useSpeechSynthesis()
  // Voice mode is output-only now — MediBot can read its replies aloud,
  // but voice input (the mic/speech-recognition button) has been
  // removed entirely, not just hidden. Only shown at all (see the
  // header below) in a browser that actually supports speech synthesis
  // — no point offering a switch that can't do anything.
  const [voiceMode, setVoiceMode] = useState(getInitialVoiceMode)
  const voiceModeAvailable = speechOutputSupported

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_MODE_STORAGE_KEY, voiceMode ? 'on' : 'off')
    } catch {
      // Persistence failing (storage blocked/full) shouldn't block the
      // toggle from working for the rest of this session — it just
      // won't survive the next refresh.
    }
  }, [voiceMode])

  // Auto-speaks a new bot reply the moment it arrives, when Voice Mode
  // is on — without this, "voice mode" only ever did anything if the
  // person manually tapped the speaker icon on each individual message,
  // which isn't how an always-on toggle reads to someone using it: with
  // Voice Mode on (the default), MediBot should just talk back, not
  // require a tap per reply to hear anything at all.
  // Only triggers when the list grew by exactly one message (a single
  // reply appended) — not on the initial greeting, not when switching/
  // loading a past conversation's full history, and not on a "New
  // Chat" reset, all of which replace/reset the whole array rather than
  // appending one message, and none of which followed a fresh user
  // gesture (several browsers silently block speechSynthesis.speak()
  // without one — same silent-failure category as the voices-not-
  // loaded bug fixed in useSpeechSynthesis.js). A genuine new reply
  // naturally follows the person having just typed and sent a message,
  // which does satisfy that requirement.
  const prevMessageCountRef = useRef(0)
  useEffect(() => {
    const prevCount = prevMessageCountRef.current
    prevMessageCountRef.current = messages.length
    if (messages.length !== prevCount + 1) return
    if (!voiceMode || !speechOutputSupported) return
    const last = messages[messages.length - 1]
    if (!last || last.type !== 'bot') return
    const id = last.id ?? `local-${messages.length - 1}`
    toggleSpeak(id, toSpeechText(last.text))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages])
  // Mobile-only — the Topic Categories / Clinic Contacts / Medical
  // Disclaimer panel renders as an off-canvas drawer below 900px (no
  // room next to the chat itself). Starts OPEN (not closed-until-tapped)
  // per product decision — someone landing on the Chatbot page on a
  // phone should see this info immediately, not have to discover the
  // Info button first. Still fully closable via the × button or by
  // tapping the backdrop (chat-panel-overlay), and reopenable via Info.
  // Irrelevant above the 900px breakpoint, where the panel is always
  // visible as a static side column regardless of this state — see
  // chat-panel-toggle-btn's CSS, which is only shown on mobile in the
  // first place.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [emgOpen, setEmgOpen] = useState(false)

  // See MobileBottomNav.jsx's handleItemClick — tapping "Chat-Bot" there
  // while already on this page dispatches this event instead of causing
  // a route change, specifically so the drawer has a way to close from
  // outside this component's own tree.
  useEffect(() => {
    function handleTabTap() {
      setMobilePanelOpen(false)
    }
    window.addEventListener('mobile-chatbot-tab-tap', handleTabTap)
    return () => window.removeEventListener('mobile-chatbot-tab-tap', handleTabTap)
  }, [])
  // Mobile-only swipe support for the Topic Categories / Clinic Contacts /
  // Medical Disclaimer drawer. Previously the ONLY way to open it was the
  // "Info" button in the header — no touch gesture existed at all — so
  // this adds a deliberate, mostly-horizontal swipe as a second entry
  // point without removing the button, the × close, or the backdrop tap.
  // Lives on a ref (not state) since touch-start coordinates don't need
  // to trigger a re-render themselves.
  const panelTouchStartRef = useRef(null)
  const [emgDescription, setEmgDescription] = useState('')
  // Recent messages from the user's OTHER (past) conversations — light,
  // eager-loaded alongside the active conversation, used only for the
  // rule-based fallback's "you mentioned this before" callback
  // (botEngine.checkPastMentions). Deliberately NOT the same fetch as
  // fullHistory below (much smaller, always loaded vs. only on demand).
  const [pastMessages, setPastMessages] = useState([])
  // Every past conversation with its messages, for the Log modal's full
  // history view (Phase 2) — fetched lazily, only when the modal is
  // actually opened, not on every page load. null = not yet fetched
  // (also the "loading" signal — see the effect below); reset back to
  // null whenever the active conversation changes (Clear, Delete All)
  // so the next time the modal opens it re-fetches fresh instead of
  // showing a stale list that doesn't include the just-started session.
  const [fullHistory, setFullHistory] = useState(null)

  const messagesRef = useRef(null)

  // Load (or start) this user's conversation on mount — "previous
  // conversations load automatically after login". Every user only ever
  // sees their own history: getOrCreateActiveConversation scopes strictly
  // to `profile.user_id`, and RLS enforces the same boundary server-side
  // regardless of what the client asks for.
  useEffect(() => {
    if (!profile?.user_id || !role) return undefined
    let cancelled = false
    getOrCreateActiveConversation(profile.user_id, role)
      .then(async ({ conversation, messages: history }) => {
        if (cancelled) return
        setConversationId(conversation.conversation_id)
        if (history.length > 0) {
          setMessages(history)
        } else {
          // Brand new conversation — persist the greeting as the real
          // first message so it's part of the stored history too, not
          // just a client-side artifact.
          const greeting = greetingMessage()
          setMessages([greeting])
          try {
            await addMessage({ conversationId: conversation.conversation_id, senderType: 'bot', message: greeting.text })
          } catch {
            // Non-critical — the greeting still shows locally even if
            // persisting it failed; the next real message will retry the
            // round trip.
          }
        }
        // Best-effort — the pattern-recognition callback is a nice-to-have,
        // never something that should block the chat from loading.
        listRecentUserMessages(profile.user_id, conversation.conversation_id)
          .then((list) => { if (!cancelled) setPastMessages(list) })
          .catch(() => {})
      })
      .catch((err) => show(`Failed to load chat history: ${err.message}`, 'error'))
      .finally(() => {
        if (!cancelled) setLoadingHistory(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.user_id, role])

  // The "Logs" modal used to be backed by its own separately-accumulated,
  // in-memory-only array, then a single-session derived view (queryLog).
  // As of Phase 2, the modal shows the real multi-session history
  // (fullHistory, loaded lazily when it opens — see the effect above),
  // so there's no separate derived log to maintain here anymore.

  useEffect(() => {
    const el = messagesRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, typing])

  async function handleSend(text) {
    const msg = text.trim()
    // typing is true from the moment a non-SOS message is sent until its
    // reply (AI or fallback) arrives — reusing it here as the rate limit
    // itself, rather than a separate cooldown timer: while a reply is
    // still pending, every additional send (rapid Enter presses, mashing
    // the Send button) is simply ignored instead of firing a second
    // concurrent AI API call / DB write. SOS-triggering messages never
    // set `typing` (they return early below), so this never delays or
    // blocks an emergency report.
    if (!msg || !conversationId || typing) return
    setInputValue('')
    const userTs = new Date().toISOString()
    setMessages((list) => [...list, { type: 'user', text: msg, ts: userTs }])

    if (isSosTrigger(msg)) {
      // Only the most recent message that was actually about a health
      // concern (a physical symptom or emotional-distress intent) goes
      // into the emergency description — not just whatever the person
      // happened to type last, which could be small talk unrelated to
      // why they're triggering SOS. Scans backward through this
      // conversation's user messages, most recent first; the SOS message
      // itself is checked too, since typing e.g. "chest pain sos" in one
      // line should still count.
      const allUserMessages = [...messages, { type: 'user', text: msg }].filter((m) => m.type === 'user')
      const healthConcernMsg = [...allUserMessages].reverse().find((m) => isHealthConcernMessage(m.text))
      // Falls back to the SOS message itself if nothing in the
      // conversation matched a health-concern pattern — still better than
      // leaving the field blank, and the person reviews/edits it anyway
      // before submitting.
      const emergencyDescription = healthConcernMsg ? healthConcernMsg.text : msg

      addMessage({ conversationId, senderType: 'user', message: msg }).catch(() => {})
      setMessages((list) => [
        ...list,
        { type: 'bot', text: "I've opened the Emergency Alert form for you with what you've told me so far — please review it and submit.", ts: new Date().toISOString(), emergency: true },
      ])
      setEmgDescription(emergencyDescription)
      setEmgOpen(true)
      return
    }

    setTyping(true)

    // Optimistic UI first (unchanged feel from before), persistence
    // happens alongside — a failed insert doesn't block the conversation,
    // just surfaces a toast, consistent with how the rest of the app
    // treats non-critical background writes.
    addMessage({ conversationId, senderType: 'user', message: msg }).catch((err) =>
      show(`Message may not have saved: ${err.message}`, 'warning')
    )

    let reply
    let emergency = false
    try {
      try {
        // Real AI reply (Groq, via the chat-completion Edge Function) when
        // it's deployed and configured.
        const ai = await getAiReply(conversationId, msg)
        reply = ai.reply
        emergency = ai.emergency
      } catch {
        // Not deployed, no GROQ_API_KEY yet, rate-limited, or genuinely
        // down — fall back to the built-in rule-based engine so the chat
        // still works, just less capably. Keeps the original simulated
        // "thinking" delay for this path only, since there's no real
        // network round-trip to provide one naturally.
        await new Promise((resolve) => setTimeout(resolve, 500 + Math.min(msg.length * 8, 800)))
        const currentMessages = messages.filter((m) => m.type === 'user').map((m) => ({ text: m.text, ts: m.ts }))
        reply = getBotReply(msg, { firstName, docRequests: myDocRequests, awaitingSymptoms, setAwaitingSymptoms, pastMessages, currentMessages })
      }

      setMessages((list) => [...list, { type: 'bot', text: reply, ts: new Date().toISOString(), emergency }])
      addMessage({ conversationId, senderType: 'bot', message: reply }).catch((err) =>
        show(`Reply may not have saved: ${err.message}`, 'warning')
      )
    } catch (err) {
      // Both the AI path AND the rule-based fallback failed (e.g. a bug
      // in getBotReply itself, not just Groq being unreachable) — without
      // this, that exception would propagate straight out of
      // handleSend, skipping setTyping(false) below entirely and
      // leaving the input permanently stuck on "Waiting for a reply…"
      // with no way to type again short of a full page refresh. A
      // visible error is still far better than a silently broken input.
      show(`MediBot couldn't respond: ${err.message}`, 'error')
    } finally {
      // Guaranteed to run whether the reply succeeded, fell back, or
      // both attempts failed above — this is what actually re-enables
      // the input, and it needs to run unconditionally, not just on the
      // success path.
      setTyping(false)
    }
  }

  function handleInputKeyPress(e) {
    if (e.key === 'Enter') handleSend(inputValue)
  }

  // Single delegated handler for every data-reply chip/topic tile rendered
  // via dangerouslySetInnerHTML — replaces the legacy inline
  // onclick="sendQuickReply(...)" attributes, which can't work as React
  // event handlers inside injected HTML strings.
  function handleMessagesClick(e) {
    const target = e.target.closest('[data-reply]')
    if (target) handleSend(target.dataset.reply)
  }

  // Same as handleMessagesClick, but for the Topic Categories grid
  // specifically — also closes the mobile drawer after sending, since
  // picking a topic is a natural "I'm done with this panel" signal on
  // mobile. setMobilePanelOpen(false) is a no-op on desktop (the drawer
  // classes only affect layout below 900px), so this is safe to call
  // unconditionally rather than needing a viewport check here.
  function handleTopicClick(e) {
    handleMessagesClick(e)
    setMobilePanelOpen(false)
  }

  // Load the full multi-session history only when the Log modal is
  // actually opened — this is a heavier fetch (every past conversation
  // and all of its messages) than pastMessages above, so there's no
  // reason to pay for it on every page load when most visits never open
  // the log at all.
  useEffect(() => {
    if (!logOpen || !profile?.user_id || fullHistory !== null) return
    let cancelled = false
    listConversationsForUser(profile.user_id)
      .then((list) => { if (!cancelled) setFullHistory(list) })
      .catch((err) => { if (!cancelled) show(`Failed to load chat history: ${err.message}`, 'error') })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logOpen, profile?.user_id, fullHistory])

  // "Clear" now only resets what's on screen — it starts a fresh
  // conversation for whatever comes next, but the conversation that was
  // just cleared is NOT deleted; it still exists in full in the Log
  // (Phase 2). This is the safe, frequently-clicked action; the only way
  // to actually delete stored history is the explicit "Delete All
  // History" button inside the Log modal below.
  async function handleClearChat() {
    try {
      const fresh = await createConversation(profile.user_id, role)
      setConversationId(fresh.conversation_id)
      const greeting = greetingMessage()
      setMessages([greeting])
      setAwaitingSymptoms(false)
      setFullHistory(null)
      await addMessage({ conversationId: fresh.conversation_id, senderType: 'bot', message: greeting.text })
      show('Chat cleared — your previous conversation is still available in Logs.', 'success')
    } catch (err) {
      show(`Failed to clear chat: ${err.message}`, 'error')
    }
  }

  // The ONLY action that actually deletes stored conversations/messages
  // (Phase 2) — deliberately separate from, and more clearly labeled
  // than, the Clear button above. Confirmed the same way every other
  // destructive action in this codebase is (the styled confirm() dialog
  // from ConfirmContext), since this one is irreversible in a way Clear
  // no longer is.
  async function handleDeleteAllHistory() {
    if (!(await confirm('Delete ALL chat history?\nThis permanently removes every past conversation and cannot be undone.'))) return
    try {
      await deleteAllConversationsForUser(profile.user_id)
      const fresh = await createConversation(profile.user_id, role)
      setConversationId(fresh.conversation_id)
      const greeting = greetingMessage()
      setMessages([greeting])
      setAwaitingSymptoms(false)
      setPastMessages([])
      setFullHistory(null)
      await addMessage({ conversationId: fresh.conversation_id, senderType: 'bot', message: greeting.text })
      setLogOpen(false)
      show('All chat history deleted', 'success')
    } catch (err) {
      show(`Failed to delete history: ${err.message}`, 'error')
    }
  }

  function handleExportLog() {
    const rows = (fullHistory || []).flatMap((conv) => {
      const log = []
      for (let i = 0; i < conv.messages.length; i++) {
        const m = conv.messages[i]
        if (m.type !== 'user') continue
        const reply = conv.messages[i + 1]?.type === 'bot' ? conv.messages[i + 1] : null
        log.push({
          timestamp: m.ts,
          detectedIntent: classifyIntent(m.text) || 'unknown',
          userMessage: m.text,
          botResponse: (reply?.text || '').replace(/<[^>]*>/g, '').substring(0, 200),
        })
      }
      return log
    })
    if (!rows.length) return show('No logs to export', 'warning')
    const csv = ['Timestamp,Intent,User Message,Bot Response']
      .concat(rows.map((l) => `"${l.timestamp}","${l.detectedIntent}","${l.userMessage.replace(/"/g, "'")}","${l.botResponse.replace(/"/g, "'")}"`))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `chatlog_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    show('Log exported as CSV', 'success')
  }

  // ── Mobile drawer swipe gesture ──
  // touchend fires for the vertical scroll inside .chat-messages too, so
  // this only acts once a gesture is clearly horizontal (not someone
  // scrolling the conversation) and deliberate (a real swipe, not a tap
  // that drifted a few px) — otherwise scrolling the chat would risk
  // randomly toggling the drawer.
  function handlePanelTouchStart(e) {
    const t = e.touches[0]
    panelTouchStartRef.current = { x: t.clientX, y: t.clientY, time: Date.now() }
  }

  function handlePanelTouchEnd(e) {
    const start = panelTouchStartRef.current
    panelTouchStartRef.current = null
    if (!start) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x
    const dy = t.clientY - start.y
    const elapsed = Date.now() - start.time
    const isDeliberateHorizontalSwipe = elapsed < 800 && Math.abs(dx) >= 50 && Math.abs(dx) >= Math.abs(dy) * 1.2
    if (!isDeliberateHorizontalSwipe) return
    // Swipe left (dx < 0) opens the drawer sliding in from the right;
    // swipe right (dx > 0) closes it — matches the direction the panel
    // itself slides via .chat-side-panels' transform:translateX.
    if (dx < 0 && !mobilePanelOpen) setMobilePanelOpen(true)
    else if (dx > 0 && mobilePanelOpen) setMobilePanelOpen(false)
  }

  if (loadingHistory) return <Spinner label="Loading your conversation…" />

  return (
    <div className="chatbot-layout" onTouchStart={handlePanelTouchStart} onTouchEnd={handlePanelTouchEnd}>
      <div className="chat-main-panel card">
        <div className="chat-main-header">
          <div className="bot-identity">
            <div className="bot-avatar-lg"><BotFace size={36} talking={typing} /></div>
            <div>
              <div className="bot-name">{BOT_NAME}</div>
              <div className="bot-status">
                <span className="online-dot" /> Online 24/7 · Clinic AI Assistant
              </div>
            </div>
          </div>
          <div className="chat-header-actions" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {voiceModeAvailable && (
              <div className="chat-voice-toggle" title="Talking chatbot — voice replies and the mic button">
                <Toggle
                  checked={voiceMode}
                  onChange={(next) => {
                    setVoiceMode(next)
                    if (!next) stopSpeaking()
                  }}
                  label="Talking chatbot (voice replies and mic input)"
                />
                <span>Voice</span>
              </div>
            )}
            <button type="button" className="btn btn-sm btn-outline chat-panel-toggle-btn" onClick={() => setMobilePanelOpen(true)} title="View topics, contacts & disclaimer">
              <InfoIcon width={13} height={13} /> Info
            </button>
            <button type="button" className="btn btn-sm btn-outline" onClick={() => setLogOpen(true)} title="View chat log">
              <BarChartIcon width={13} height={13} /> Logs
            </button>
            <button type="button" className="btn btn-sm btn-red" onClick={handleClearChat} title="Clear conversation">
              <TrashIcon width={13} height={13} /> Clear
            </button>
          </div>
        </div>

        <div className="chat-messages" ref={messagesRef} onClick={handleMessagesClick}>
          {messages.map((m, i) => (
            <ChatMessage
              key={m.id ?? `local-${i}`}
              message={m}
              userInitials={profile?.avatar_initials}
              userAvatarUrl={profile?.profile_img_url}
              speakId={m.id ?? `local-${i}`}
              speakingId={speakingId}
              onToggleSpeak={toggleSpeak}
              speechSupported={speechOutputSupported && voiceMode}
            />
          ))}
          {typing && (
            <div className="msg msg-bot-wrap">
              <div className="msg-avatar bot-av"><BotFace size={32} talking /></div>
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        <div className="chat-input-row">
          <input
            type="text"
            placeholder={typing ? 'Waiting for a reply…' : 'Ask me anything about the clinic…'}
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleInputKeyPress}
            autoComplete="off"
            disabled={typing}
          />
          <button type="button" className="chat-send-btn" onClick={() => handleSend(inputValue)} title="Send message" disabled={typing}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <div className={`chat-side-panels${mobilePanelOpen ? ' mobile-open' : ''}`}>
        <button type="button" className="chat-panel-close-btn" onClick={() => setMobilePanelOpen(false)} aria-label="Close panel" title="Close">
          <XIcon width={16} height={16} />
        </button>
        <div className="card chat-side-card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ChatbotIcon width={15} height={15} /> Topic Categories</h3>
          </div>
          <div className="chat-topic-grid" onClick={handleTopicClick}>
            {TOPICS.map((t) => (
              <div key={t.label} className="topic-chip" data-reply={t.q}>
                <span style={{ fontSize: 18, display: 'inline-flex' }}>
                  <t.Icon width={18} height={18} />
                </span>
                <span>{t.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="card chat-side-card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><PhoneIcon width={15} height={15} /> Clinic Contacts</h3>
          </div>
          <div style={{ padding: 12 }}>
            {[
              [PhoneIcon, 'Phone', '0907-684-2769'],
              [MailIcon, 'Email', 'infirmary.meneses@bulsu.edu.ph'],
              [MapPinIcon, 'Location', 'Bulsu Meneses Campus (Near Gate 1)'],
              [ClockIcon, 'Hours', 'Mon–Fri 8:00AM–5:00PM'],
              [AlertOctagonIcon, 'Facebook', 'Bulsu Health Services Unit-Meneses Campus'],
            ].map(([ContactIcon, l, v]) => (
              <div className="detail-row" key={l}>
                <span className="detail-label" style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                  <ContactIcon width={12} height={12} /> {l}
                </span>
                <span className="detail-value" style={{ fontSize: 12 }}>
                  {v}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="card chat-side-card" style={{ background: 'var(--warning-light)', border: '1px solid #f15757' }}>
          <div className="chat-disclaimer-text" style={{ padding: 12, fontSize: 11.5, lineHeight: 1.5 }}>
            <strong style={{ display: 'flex', alignItems: 'center', gap: 6 }}><AlertTriangleIcon width={13} height={13} /> Medical Disclaimer</strong>
            <br />
            <br />
            MediBot provides general health information only. It is <strong>not a substitute</strong> for professional medical advice, diagnosis, or treatment.
            <br />
            <br />
            For medical emergencies, call <strong>911</strong> or go to the nearest hospital immediately.
          </div>
        </div>
      </div>
      {mobilePanelOpen && <div className="chat-panel-overlay" onClick={() => setMobilePanelOpen(false)} />}

      <ChatLogModal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        history={fullHistory || []}
        loading={fullHistory === null}
        onExport={handleExportLog}
        onDeleteAll={handleDeleteAllHistory}
      />

      {emgOpen && (
        <Suspense fallback={null}>
          <EmergencyReportModal
            isOpen={emgOpen}
            profile={profile}
            initialDescription={emgDescription}
            onClose={() => setEmgOpen(false)}
            onError={(msg) => show(msg, 'error')}
            onSuccess={() => {
              setEmgOpen(false)
              show('Emergency alert sent.', 'success')
            }}
          />
        </Suspense>
      )}
    </div>
  )
}