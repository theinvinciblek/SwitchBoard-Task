import { useMemo, useState } from 'react'
import {
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  Check,
  CheckCheck,
  CircleAlert,
  CircleDot,
  Clock,
  Copy,
  Globe,
  Hash,
  History,
  Phone,
  UserRound,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useInbox } from '../../context/InboxContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { Avatar } from '../ui/Avatar.jsx'
import { IconButton } from '../ui/Button.jsx'
import { agentLabel, countryOf, formatDateTime, formatPhone } from '../../utils/format.js'

function CopyButton({ value, label }) {
  const toast = useToast()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error('Could not copy', 'Your browser blocked clipboard access.')
    }
  }
  return <IconButton icon={copied ? Check : Copy} label={copied ? 'Copied' : label} size="sm" onClick={copy} />
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="details-row">
      <dt>
        <Icon size={14} strokeWidth={2} aria-hidden="true" />
        {label}
      </dt>
      <dd>{children}</dd>
    </div>
  )
}

export function DetailsPanel({ conversationId, onClose }) {
  const { user } = useAuth()
  const { state } = useInbox()
  const conversation = conversationId ? state.conversations[conversationId] : null
  const messages = state.threads[conversationId]?.messages

  const stats = useMemo(() => {
    const list = messages ?? []
    const outbound = list.filter((m) => m.direction === 'outbound')
    return {
      inbound: list.length - outbound.length,
      outbound: outbound.length,
      delivered: outbound.filter((m) => m.status === 'delivered').length,
      inFlight: outbound.filter((m) => m.status === 'queued' || m.status === 'sent').length,
      failed: outbound.filter((m) => m.status === 'failed').length,
      firstAt: list[0]?.occurredAt,
    }
  }, [messages])

  if (!conversation) return null

  const country = countryOf(conversation.contact)

  return (
    <aside className="details" aria-label="Customer details">
      <header className="details__header">
        <h2>Details</h2>
        <IconButton icon={X} label="Hide customer details" onClick={onClose} />
      </header>

      <div className="details__scroll">
        <section className="details__profile">
          <Avatar seed={conversation.contact} size={56} />
          <p className="details__name">{formatPhone(conversation.contact)}</p>
          <p className="details__sub">Customer via Pigeon</p>
        </section>

        <section className="details__section" aria-labelledby="details-contact">
          <h3 id="details-contact">Contact</h3>
          <dl>
            <Row icon={Phone} label="Phone">
              <span className="details__value-with-action">
                <span className="mono">{conversation.contact}</span>
                <CopyButton value={conversation.contact} label="Copy phone number" />
              </span>
            </Row>
            <Row icon={Globe} label="Region">{country ?? 'Unknown'}</Row>
          </dl>
        </section>

        <section className="details__section" aria-labelledby="details-conversation">
          <h3 id="details-conversation">Conversation</h3>
          <dl>
            <Row icon={CircleDot} label="Status">
              <span className="details__status">
                <span className={`status-dot status-dot--${conversation.status}`} aria-hidden="true" />
                {conversation.status === 'closed' ? 'Closed' : 'Open'}
              </span>
            </Row>
            <Row icon={UserRound} label="Assignee">
              {conversation.assignee ? agentLabel(conversation.assignee, user) : <span className="muted">Unassigned</span>}
            </Row>
            <Row icon={Calendar} label="First message">{formatDateTime(stats.firstAt ?? conversation.createdAt)}</Row>
            <Row icon={History} label="Last activity">{formatDateTime(conversation.lastMessageAt)}</Row>
          </dl>
        </section>

        {messages && (
          <section className="details__section" aria-labelledby="details-messages">
            <h3 id="details-messages">Messages</h3>
            <div className="stat-grid">
              <div className="stat">
                <ArrowDownLeft size={14} strokeWidth={2} aria-hidden="true" />
                <span className="stat__value">{stats.inbound}</span>
                <span className="stat__label">Received</span>
              </div>
              <div className="stat">
                <ArrowUpRight size={14} strokeWidth={2} aria-hidden="true" />
                <span className="stat__value">{stats.outbound}</span>
                <span className="stat__label">Sent</span>
              </div>
            </div>
            {stats.outbound > 0 && (
              <ul className="delivery-list">
                <li>
                  <CheckCheck size={14} strokeWidth={2} aria-hidden="true" className="tone-success" />
                  <span>Delivered</span>
                  <span className="delivery-list__count">{stats.delivered}</span>
                </li>
                <li>
                  <Clock size={14} strokeWidth={2} aria-hidden="true" className="tone-muted" />
                  <span>In progress</span>
                  <span className="delivery-list__count">{stats.inFlight}</span>
                </li>
                <li>
                  <CircleAlert size={14} strokeWidth={2} aria-hidden="true" className={stats.failed ? 'tone-danger' : 'tone-muted'} />
                  <span>Not delivered</span>
                  <span className="delivery-list__count">{stats.failed}</span>
                </li>
              </ul>
            )}
          </section>
        )}

        <section className="details__section" aria-labelledby="details-reference">
          <h3 id="details-reference">Reference</h3>
          <dl>
            <Row icon={Hash} label="ID">
              <span className="details__value-with-action">
                <span className="mono truncate" title={conversation._id}>{conversation._id}</span>
                <CopyButton value={conversation._id} label="Copy conversation ID" />
              </span>
            </Row>
          </dl>
        </section>
      </div>
    </aside>
  )
}
