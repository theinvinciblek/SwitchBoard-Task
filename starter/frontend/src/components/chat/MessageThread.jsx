import { Fragment, useLayoutEffect, useMemo, useRef } from 'react'
import { MessageSquareText, RotateCcw } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useNow } from '../../hooks/useNow.js'
import { EmptyState } from '../ui/Feedback.jsx'
import { MessageStatus } from './MessageStatus.jsx'
import { agentLabel, formatDateTime, formatDayLabel, formatTime } from '../../utils/format.js'

const GROUP_GAP_MS = 5 * 60 * 1000

const senderKey = (m) => (m.direction === 'inbound' ? 'customer' : `agent:${m.senderId ?? ''}`)

// Groups consecutive messages from the same sender within five minutes, and inserts
// a divider whenever the day changes.
function buildRows(messages) {
  const rows = []
  let previous = null
  for (const message of messages) {
    const at = new Date(message.occurredAt)
    if (!previous || new Date(previous.occurredAt).toDateString() !== at.toDateString()) {
      rows.push({ type: 'day', key: `day:${at.toDateString()}`, at })
      previous = null
    }
    const startsGroup =
      !previous || senderKey(previous) !== senderKey(message) || at - new Date(previous.occurredAt) > GROUP_GAP_MS
    if (!startsGroup) rows[rows.length - 1].last = false
    rows.push({ type: 'message', key: message._id, message, first: startsGroup, last: true })
    previous = message
  }
  return rows
}

function Bubble({ message, first, last, me, onRetry }) {
  const outbound = message.direction === 'outbound'
  const sending = message.localState === 'sending'
  const notStored = message.localState === 'error'
  const status = sending ? 'sending' : message.status

  return (
    <div className={`message ${outbound ? 'message--out' : 'message--in'} ${first ? 'is-first' : ''} ${last ? 'is-last' : ''}`}>
      {first && outbound && <span className="message__sender">{message.senderId ? agentLabel(message.senderId, me) : 'Agent'}</span>}
      <div
        className={`message__bubble ${notStored ? 'is-unsent' : ''} ${outbound && message.status === 'failed' ? 'is-failed' : ''}`}
        title={formatDateTime(message.occurredAt)}
      >
        {message.text}
      </div>
      {notStored ? (
        <div className="message__error" role="alert">
          <span>Not sent. {message.localError}</span>
          <button type="button" className="link-button" onClick={() => onRetry(message)}>
            <RotateCcw size={12} strokeWidth={2.25} aria-hidden="true" />
            Retry
          </button>
        </div>
      ) : (
        (last || (outbound && message.status === 'failed')) && (
          <div className="message__meta">
            <time dateTime={message.occurredAt}>{formatTime(message.occurredAt)}</time>
            {outbound && <MessageStatus status={status} showLabel={status === 'failed' || status === 'queued' || status === 'sending'} />}
          </div>
        )
      )}
    </div>
  )
}

export function MessageThread({ conversationId, messages, onRetry }) {
  const { user } = useAuth()
  const now = useNow(60000)
  const scrollRef = useRef(null)
  const stickToBottom = useRef(true)
  const rows = useMemo(() => buildRows(messages), [messages])

  // Open at the newest message; keep following new ones unless the user scrolled up.
  useLayoutEffect(() => {
    stickToBottom.current = true
  }, [conversationId])

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight
  }, [rows, conversationId])

  if (messages.length === 0) {
    return (
      <div className="thread thread--empty">
        <EmptyState
          icon={MessageSquareText}
          title="No messages yet"
          description="Send the first message. The customer receives it through Pigeon."
        />
      </div>
    )
  }

  return (
    <div
      className="thread"
      ref={scrollRef}
      onScroll={(e) => {
        const el = e.currentTarget
        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
      }}
      role="log"
      aria-live="polite"
      aria-label="Messages"
    >
      <div className="thread__inner">
        {rows.map((row) =>
          row.type === 'day' ? (
            <div key={row.key} className="day-divider" role="separator">
              <span>{formatDayLabel(row.at, now)}</span>
            </div>
          ) : (
            <Fragment key={row.key}>
              <Bubble message={row.message} first={row.first} last={row.last} me={user} onRetry={onRetry} />
            </Fragment>
          ),
        )}
      </div>
    </div>
  )
}
