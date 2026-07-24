import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@context/AuthContext'
import { useToast } from '@context/ToastContext'
import Spinner from '@components/ui/Spinner'
import { listDocumentRequests } from '@services/documentRequestsService'
import { getOrCreateActiveConversation, addMessage, createConversation, getAiReply, listConversationsForUser, listRecentUserMessages, deleteAllConversationsForUser } from '@services/chatService'
import { classifyIntent, getBotReply } from './lib/botEngine'
import { QUICK_REPLY_SETS } from './data/knowledgeBase'
import ChatMessage from './ChatMessage'
import ChatLogModal from './ChatLogModal'
import {
  ClockIcon,
  MapPinIcon,
  BuildingIcon,
  DocumentIcon,
  ConsultationIcon,
  PillIcon,
  AlertOctagonIcon,
  UserIcon,
  DollarSignIcon,
  CalendarIcon,
  ToothIcon,
  ClipboardIcon,
  BarChartIcon,
  TrashIcon,
  ChatbotIcon,
  PhoneIcon,
  MailIcon,
  AlertTriangleIcon,
} from '@components/ui/icons'

function BotAvatar(props) {
  return <ConsultationIcon {...props} />
}
const BOT_NAME = 'MediBot'

const TOPICS = [
  { Icon: ClockIcon, label: 'Clinic Hours', q: 'clinic hours' },
  { Icon: MapPinIcon, label: 'Location', q: 'location' },
  { Icon: BuildingIcon, label: 'Services', q: 'services' },
  { Icon: DocumentIcon, label: 'Documents', q: 'documents' },
  { Icon: ConsultationIcon, label: 'Symptoms', q: 'symptom check' },
  { Icon: PillIcon, label: 'Health Tips', q: 'health tips' },
  { Icon: AlertOctagonIcon, label: 'Emergency', q: 'emergency' },
  { Icon: UserIcon, label: 'Staff Info', q: 'staff' },
  { Icon: DollarSignIcon, label: 'Service Fees', q: 'fees' },
  { Icon: CalendarIcon, label: 'Appointments', q: 'appointment' },
  { Icon: ToothIcon, label: 'Dental', q: 'dental services' },
  { Icon: ClipboardIcon, label: 'Pre-Clinic', q: 'prepare for clinic visit' },
]

function greetingMessage() {
  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  return {
    type: 'bot',
    text: `${greet}! 👋 I'm <strong>MediBot</strong>, your 24/7 intelligent clinic assistant.<br><br>I can help you with clinic information, health tips, symptom checking, document guidance, and <strong>emotional support</strong>. 💙<br><br>How are you feeling today?`,
    ts: new Date().toISOString(),
  }
}

export default function ChatbotPage() {
  const { profile, role } = useAuth()
  const { show } = useToast()
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
    if (!msg || !conversationId) return
    setInputValue('')
    const userTs = new Date().toISOString()
    setMessages((list) => [...list, { type: 'user', text: msg, ts: userTs }])
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
      reply = getBotReply(msg, { firstName, docRequests: myDocRequests, awaitingSymptoms, setAwaitingSymptoms, pastMessages })
    }

    setMessages((list) => [...list, { type: 'bot', text: reply, ts: new Date().toISOString(), emergency }])
    setTyping(false)
    addMessage({ conversationId, senderType: 'bot', message: reply }).catch((err) =>
      show(`Reply may not have saved: ${err.message}`, 'warning')
    )
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
  // destructive action in this codebase is (window.confirm), since this
  // one is irreversible in a way Clear no longer is.
  async function handleDeleteAllHistory() {
    if (!window.confirm('Delete ALL chat history?\nThis permanently removes every past conversation and cannot be undone.')) return
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

  if (loadingHistory) return <Spinner label="Loading your conversation…" />

  return (
    <div className="chatbot-layout">
      <div className="chat-main-panel card">
        <div className="chat-main-header">
          <div className="bot-identity">
            <div className="bot-avatar-lg"><BotAvatar width={26} height={26} /></div>
            <div>
              <div className="bot-name">{BOT_NAME}</div>
              <div className="bot-status">
                <span className="online-dot" /> Online 24/7 · Clinic AI Assistant
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
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
            <ChatMessage key={m.id ?? `local-${i}`} message={m} userInitials={profile?.avatar_initials} />
          ))}
          {typing && (
            <div className="msg msg-bot-wrap">
              <div className="msg-avatar bot-av"><BotAvatar width={16} height={16} /></div>
              <div className="typing-indicator">
                <span />
                <span />
                <span />
              </div>
            </div>
          )}
        </div>

        <div className="quick-replies-bar">
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', padding: '10px 16px 8px' }}>
            {QUICK_REPLY_SETS.default.map((r) => (
              <button key={r} type="button" className="btn btn-sm btn-outline quick-reply-btn" onClick={() => handleSend(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="chat-input-row">
          <input
            type="text"
            placeholder="Ask me anything about the clinic…"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyPress={handleInputKeyPress}
            autoComplete="off"
          />
          <button type="button" className="chat-send-btn" onClick={() => handleSend(inputValue)} title="Send message">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>
      </div>

      <div className="chat-side-panels">
        <div className="card chat-side-card">
          <div className="card-header">
            <h3 style={{ display: 'flex', alignItems: 'center', gap: 7 }}><ChatbotIcon width={15} height={15} /> Topic Categories</h3>
          </div>
          <div className="chat-topic-grid" onClick={handleMessagesClick}>
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
              [PhoneIcon, 'Phone', 'Ext. 1234'],
              [MailIcon, 'Email', 'clinic@capstone.edu'],
              [MapPinIcon, 'Location', 'Main Bldg, GF Rm 101'],
              [ClockIcon, 'Hours', 'Mon–Fri 7:30–5:30PM'],
              [AlertOctagonIcon, 'Emergency', 'Ext. 0000 (24/7)'],
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

        <div className="card chat-side-card" style={{ background: 'var(--warning-light)', border: '1px solid #FCD34D' }}>
          <div style={{ padding: 12, fontSize: 11.5, color: '#92400E', lineHeight: 1.5 }}>
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

      <ChatLogModal
        isOpen={logOpen}
        onClose={() => setLogOpen(false)}
        history={fullHistory || []}
        loading={fullHistory === null}
        onExport={handleExportLog}
        onDeleteAll={handleDeleteAllHistory}
      />
    </div>
  )
}
