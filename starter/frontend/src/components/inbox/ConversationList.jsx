import { forwardRef, memo, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CircleAlert, CircleDashed, Menu as MenuIcon, RefreshCw, Search, SearchX, UserRound, X } from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useInbox } from '../../context/InboxContext.jsx'
import { useNow } from '../../hooks/useNow.js'
import { Avatar } from '../ui/Avatar.jsx'
import { Button, IconButton } from '../ui/Button.jsx'
import { EmptyState } from '../ui/Feedback.jsx'
import { VIEWS } from './views.js'
import { agentLabel, formatListTime, formatPhone } from '../../utils/format.js'

const time = (value) => (value ? new Date(value).getTime() : 0)

const ConversationRow = memo(function ConversationRow({ conversation, href, selected, unread, me, now }) {
  const assignee = conversation.assignee
  return (
    <li>
      <Link
        to={href}
        className={`conversation-row ${selected ? 'is-selected' : ''} ${unread ? 'is-unread' : ''}`}
        aria-current={selected ? 'true' : undefined}
        data-conversation-id={conversation._id}
      >
        <Avatar seed={conversation.contact} size={36} />
        <div className="conversation-row__body">
          <div className="conversation-row__top">
            <span className="conversation-row__contact">{formatPhone(conversation.contact)}</span>
            <time className="conversation-row__time" dateTime={conversation.lastMessageAt}>
              {formatListTime(conversation.lastMessageAt, now)}
            </time>
          </div>
          <div className="conversation-row__bottom">
            <p className="conversation-row__preview">{conversation.lastMessageText || 'No messages yet'}</p>
            {unread && <span className="unread-dot" aria-label="New activity" />}
          </div>
          <div className="conversation-row__meta">
            {assignee ? (
              <span className={`assignee-chip ${assignee === me.sub ? 'is-me' : ''}`}>
                <UserRound size={12} strokeWidth={2.25} aria-hidden="true" />
                {agentLabel(assignee, me)}
              </span>
            ) : (
              <span className="assignee-chip is-unassigned">
                <CircleDashed size={12} strokeWidth={2.25} aria-hidden="true" />
                Unassigned
              </span>
            )}
            {conversation.status === 'closed' && <span className="status-chip">Closed</span>}
          </div>
        </div>
      </Link>
    </li>
  )
})

function SkeletonRows() {
  return (
    <ul className="conversation-list__items" aria-hidden="true">
      {Array.from({ length: 7 }, (_, i) => (
        <li key={i} className="conversation-row conversation-row--skeleton">
          <span className="skeleton skeleton--circle" />
          <div className="conversation-row__body">
            <span className="skeleton" style={{ width: `${55 + ((i * 13) % 25)}%` }} />
            <span className="skeleton skeleton--thin" style={{ width: `${70 + ((i * 7) % 20)}%` }} />
          </div>
        </li>
      ))}
    </ul>
  )
}

export const ConversationList = forwardRef(function ConversationList(
  { workspaceId, view, selectedId, query, onQueryChange, onOpenSidebar },
  searchRef,
) {
  const { user } = useAuth()
  const { state, isUnread, loadList } = useInbox()
  const now = useNow(30000)

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const digits = needle.replace(/\D/g, '')
    return Object.values(state.conversations)
      .filter((c) => view.match(c, user))
      .filter((c) => {
        if (!needle) return true
        if (digits && c.contact.replace(/\D/g, '').includes(digits)) return true
        return (c.lastMessageText ?? '').toLowerCase().includes(needle)
      })
      .sort((a, b) => time(b.lastMessageAt) - time(a.lastMessageAt) || String(b._id).localeCompare(String(a._id)))
  }, [state.conversations, view, user, query])

  const base = `/w/${encodeURIComponent(workspaceId)}`
  const { list } = state

  let content
  if (list.state === 'loading') {
    content = <SkeletonRows />
  } else if (list.state === 'error') {
    content = (
      <EmptyState
        icon={CircleAlert}
        tone="danger"
        title="Could not load conversations"
        description={list.error}
        action={<Button icon={RefreshCw} onClick={() => loadList()}>Try again</Button>}
      />
    )
  } else if (visible.length === 0) {
    content = query.trim() ? (
      <EmptyState
        icon={SearchX}
        title="No matches"
        description={`Nothing in ${view.label.toLowerCase()} matches "${query.trim()}".`}
        action={<Button variant="ghost" onClick={() => onQueryChange('')}>Clear search</Button>}
      />
    ) : (
      <EmptyState icon={view.icon} title={view.empty.title} description={view.empty.description} />
    )
  } else {
    content = (
      <ul className="conversation-list__items">
        {visible.map((c) => (
          <ConversationRow
            key={c._id}
            conversation={c}
            href={`${base}/${view.id}/${c._id}`}
            selected={c._id === selectedId}
            unread={c._id !== selectedId && isUnread(c)}
            me={user}
            now={now}
          />
        ))}
      </ul>
    )
  }

  return (
    <section className="conversation-list" aria-label={`${view.label} conversations`}>
      <header className="conversation-list__header">
        <div className="conversation-list__title-row">
          <IconButton icon={MenuIcon} label="Open navigation" className="conversation-list__menu" onClick={onOpenSidebar} />
          <h1 className="conversation-list__title">{view.label}</h1>
          {list.state === 'ready' && <span className="conversation-list__count">{visible.length}</span>}
        </div>

        <label className="search-field">
          <Search size={15} strokeWidth={2} aria-hidden="true" className="search-field__icon" />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search number or latest message"
            aria-label="Search conversations"
            title="Search conversations (press / from anywhere)"
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                onQueryChange('')
                e.currentTarget.blur()
              }
            }}
          />
          {query && (
            <button type="button" className="search-field__clear" onClick={() => onQueryChange('')} aria-label="Clear search">
              <X size={14} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
        </label>

        {/* On narrow screens the sidebar is hidden, so the views are also offered here. */}
        <div className="view-tabs" role="tablist" aria-label="Inbox views">
          {VIEWS.map((v) => (
            <Link
              key={v.id}
              role="tab"
              aria-selected={v.id === view.id}
              to={`${base}/${v.id}`}
              className={`view-tabs__tab ${v.id === view.id ? 'is-active' : ''}`}
            >
              {v.shortLabel ?? v.label}
            </Link>
          ))}
        </div>
      </header>

      <div className="conversation-list__scroll">
        {content}
        {list.state === 'ready' && list.hasNextPage && (
          <div className="conversation-list__more">
            <Button variant="ghost" size="sm" loading={list.loadingMore} onClick={() => loadList({ more: true })}>
              Load older conversations
            </Button>
          </div>
        )}
      </div>
    </section>
  )
})
