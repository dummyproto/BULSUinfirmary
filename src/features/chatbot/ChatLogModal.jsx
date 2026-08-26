import Modal from '@components/ui/Modal'
import { formatDateTime } from '@lib/format'
import { timeAgo } from '@features/inventory/lib/inventoryHelpers'
import { BarChartIcon, TrashIcon, UserIcon, ConsultationIcon } from '@components/ui/icons'
import { sanitizeBotHtml } from './chatText'

// Shows every past conversation (Phase 2 — "the Log view shows every
// past session, not just the current one"), not a single derived list.
// "Delete All History" is deliberately the only destructive action
// anywhere in the chatbot UI now — Clear (on the main chat screen) no
// longer deletes anything, it just starts a fresh session; this button
// is what actually removes rows from Supabase, and only this button.
export default function ChatLogModal({ isOpen, onClose, history, loading, onDeleteAll }) {
  const totalMessages = history.reduce((sum, c) => sum + c.messages.length, 0)

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Chat History"
      icon={<BarChartIcon width={16} height={16} />}
      actions={
        <>
          <button type="button" className="btn btn-sm btn-red" onClick={onDeleteAll} title="Permanently deletes every past conversation">
            <TrashIcon width={13} height={13} /> Delete All History
          </button>
          <button type="button" className="btn btn-sm" onClick={onClose}>
            Close
          </button>
        </>
      }
    >
      <div className="chat-log-readonly" style={{ maxHeight: 450, overflowY: 'auto' }}>
        {loading ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>Loading your conversation history…</div>
        ) : history.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)' }}>No past conversations yet. Start chatting!</div>
        ) : (
          history.map((conv) => {
            const pairs = []
            for (let i = 0; i < conv.messages.length; i++) {
              const m = conv.messages[i]
              if (m.type !== 'user') continue
              const reply = conv.messages[i + 1]?.type === 'bot' ? conv.messages[i + 1] : null
              pairs.push({ id: m.id, ts: m.ts, userMessage: m.text, botResponse: reply?.text || '' })
            }
            return (
              <div key={conv.conversation_id} style={{ borderBottom: '1px solid var(--border)', marginTop: 8 }}>
                <div
                  style={{
                    padding: '10px 16px',
                    background: 'var(--surface2)',
                    fontSize: 11,
                    fontWeight: 700,
                    color: 'var(--text-3)',
                    letterSpacing: '.03em',
                    textTransform: 'uppercase',
                    position: 'sticky',
                    top: 0,
                    borderRadius: 8,
                  }}
                >
                  Session started {formatDateTime(conv.created_at)} · {conv.messages.length} message{conv.messages.length === 1 ? '' : 's'}
                </div>
                {pairs.length === 0 ? (
                  <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-3)' }}>No user messages in this session.</div>
                ) : (
                  pairs.map((l) => (
                    <div key={l.id} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
                        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>{timeAgo(l.ts)}</span>
                      </div>
                      <div style={{ color: 'var(--text)', marginBottom: 10, display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                        <UserIcon width={13} height={13} style={{ flexShrink: 0, marginTop: 2 }} />
                        <strong style={{ lineHeight: 1.5 }}>{l.userMessage}</strong>
                      </div>
                      <div
                        style={{
                          color: 'var(--text-2)',
                          display: 'flex',
                          alignItems: 'flex-start',
                          gap: 6,
                          background: 'var(--surface2)',
                          borderRadius: 10,
                          padding: '10px 12px',
                        }}
                      >
                        <ConsultationIcon width={13} height={13} style={{ flexShrink: 0, marginTop: 2 }} />
                        <span style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: sanitizeBotHtml(l.botResponse) }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            )
          })
        )}
      </div>
      {!loading && history.length > 0 && (
        <div style={{ padding: '8px 4px 0', fontSize: 11, color: 'var(--text-3)', textAlign: 'right' }}>
          {history.length} session{history.length === 1 ? '' : 's'} · {totalMessages} total messages
        </div>
      )}
    </Modal>
  )
}