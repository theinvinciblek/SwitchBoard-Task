import { useState } from 'react'
import { Archive, ChevronLeft, CircleAlert, CircleCheck, MessagesSquare, PanelRight, RefreshCw, RotateCcw, UserCheck, UserPlus } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useInbox } from '../../context/InboxContext.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { Badge, EmptyState, Spinner } from '../ui/Feedback.jsx'
import { Button, IconButton } from '../ui/Button.jsx'
import { MessageThread } from './MessageThread.jsx'
import { Composer } from './Composer.jsx'
import { agentLabel, countryOf, formatPhone } from '../../utils/format.js'

function AssignAction({ conversation }) {
  const { user } = useAuth()
  const { claim } = useInbox()
  const [busy, setBusy] = useState(false)

  if (conversation.assignee === user.sub) {
    return (
      <Badge tone="accent" icon={UserCheck} title="You are handling this conversation">
        Assigned to you
      </Badge>
    )
  }

  const run = async () => {
    setBusy(true)
    await claim(conversation._id)
    setBusy(false)
  }

  // Someone else holds it: the server would answer 409, so say who instead of offering the action.
  if (conversation.assignee) {
    return (
      <Badge tone="neutral" icon={UserCheck} title="Only one agent can hold a conversation">
        {agentLabel(conversation.assignee, user)}
      </Badge>
    )
  }

  return (
    <Button size="sm" icon={UserPlus} loading={busy} onClick={run}>
      Assign to me
    </Button>
  )
}

function StatusAction({ conversation }) {
  const { setStatus } = useInbox()
  const [busy, setBusy] = useState(false)
  const closed = conversation.status === 'closed'

  const run = async () => {
    setBusy(true)
    await setStatus(conversation._id, closed ? 'open' : 'closed')
    setBusy(false)
  }

  return closed ? (
    <Button size="sm" icon={RotateCcw} loading={busy} onClick={run}>
      Reopen
    </Button>
  ) : (
    <Button size="sm" variant="primary" icon={CircleCheck} loading={busy} onClick={run}>
      Close
    </Button>
  )
}

export function ChatPanel({ conversationId, onBack, detailsOpen, onToggleDetails }) {
  const { state, loadThread, sendReply, retryReply, setStatus } = useInbox()
  const conversation = conversationId ? state.conversations[conversationId] : null
  const thread = conversationId ? state.threads[conversationId] : null

  if (!conversationId) {
    return (
      <section className="chat chat--empty" aria-label="Conversation">
        <EmptyState
          icon={MessagesSquare}
          title="Select a conversation"
          description="Choose a conversation from the list to read the messages and reply."
        />
      </section>
    )
  }

  if (thread?.state === 'error' && !conversation) {
    return (
      <section className="chat chat--empty" aria-label="Conversation">
        <EmptyState
          icon={CircleAlert}
          tone="danger"
          title="Conversation unavailable"
          description={thread.error}
          action={<Button icon={RefreshCw} onClick={() => loadThread(conversationId)}>Try again</Button>}
        />
      </section>
    )
  }

  if (!conversation || !thread || thread.state === 'loading') {
    return (
      <section className="chat chat--empty" aria-label="Conversation" aria-busy="true">
        <Spinner size={20} label="Loading conversation" />
      </section>
    )
  }

  const closed = conversation.status === 'closed'
  const country = countryOf(conversation.contact)

  return (
    <section className="chat" aria-label={`Conversation with ${formatPhone(conversation.contact)}`}>
      <header className="chat__header">
        <IconButton icon={ChevronLeft} label="Back to conversations" className="chat__back" onClick={onBack} />
        <Avatar seed={conversation.contact} size={32} />
        <div className="chat__title">
          <h2>{formatPhone(conversation.contact)}</h2>
          <p>
            <span className={`status-dot status-dot--${conversation.status}`} aria-hidden="true" />
            {closed ? 'Closed' : 'Open'}
            {country && (
              <>
                <span className="chat__sep" aria-hidden="true" />
                {country}
              </>
            )}
          </p>
        </div>
        <div className="chat__actions">
          <AssignAction conversation={conversation} />
          <StatusAction conversation={conversation} />
          <IconButton
            icon={PanelRight}
            label={detailsOpen ? 'Hide customer details' : 'Show customer details'}
            active={detailsOpen}
            onClick={onToggleDetails}
          />
        </div>
      </header>

      {thread.state === 'error' ? (
        <div className="chat__body-state">
          <EmptyState
            icon={CircleAlert}
            tone="danger"
            title="Could not load messages"
            description={thread.error}
            action={<Button icon={RefreshCw} onClick={() => loadThread(conversationId)}>Try again</Button>}
          />
        </div>
      ) : (
        <MessageThread
          conversationId={conversationId}
          messages={thread.messages}
          onRetry={(message) => retryReply(conversationId, message)}
        />
      )}

      {closed && (
        <div className="closed-banner" role="status">
          <Archive size={15} strokeWidth={2} aria-hidden="true" />
          <span>This conversation is closed. A new customer message reopens it automatically.</span>
          <button type="button" className="link-button" onClick={() => setStatus(conversation._id, 'open')}>
            Reopen
          </button>
        </div>
      )}

      <Composer
        key={conversationId}
        conversationId={conversationId}
        contact={conversation.contact}
        disabled={closed}
        onSend={(text) => sendReply(conversationId, text)}
      />
    </section>
  )
}
