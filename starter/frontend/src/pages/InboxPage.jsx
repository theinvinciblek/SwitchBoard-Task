import { useCallback, useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { InboxProvider, useInbox } from '../context/InboxContext.jsx'
import { useMediaQuery } from '../hooks/useMediaQuery.js'
import { Sidebar } from '../components/layout/Sidebar.jsx'
import { ConversationList } from '../components/inbox/ConversationList.jsx'
import { ChatPanel } from '../components/chat/ChatPanel.jsx'
import { DetailsPanel } from '../components/details/DetailsPanel.jsx'
import { DEFAULT_VIEW, findView } from '../components/inbox/views.js'
import { NoAccessPage } from './StatusPages.jsx'
import { workspaceLabel } from '../utils/format.js'

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)

function InboxShell({ workspaceId, view, conversationId }) {
  const navigate = useNavigate()
  const { state, select, markSeen, isUnread } = useInbox()
  const wide = useMediaQuery('(min-width: 1280px)')
  const [detailsPreference, setDetailsPreference] = useState(null) // null: follow screen width
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [query, setQuery] = useState('')
  const searchRef = useRef(null)

  const detailsOpen = Boolean(conversationId) && (detailsPreference ?? wide)
  const selected = conversationId ? state.conversations[conversationId] : null
  const base = `/w/${encodeURIComponent(workspaceId)}/${view.id}`

  useEffect(() => {
    select(conversationId ?? null)
  }, [conversationId, select])

  // Looking at a conversation marks its activity as seen.
  useEffect(() => {
    if (selected?.lastMessageAt) markSeen(selected._id, selected.lastMessageAt)
  }, [selected?._id, selected?.lastMessageAt, markSeen])

  // Tab title shows how many open conversations have new activity.
  useEffect(() => {
    const unread = Object.values(state.conversations).filter((c) => c.status !== 'closed' && c._id !== conversationId && isUnread(c)).length
    document.title = `${unread ? `(${unread}) ` : ''}${view.label} - ${workspaceLabel(workspaceId)} - Switchboard`
  }, [state.conversations, isUnread, view.label, workspaceId, conversationId])

  useEffect(() => () => {
    document.title = 'Switchboard'
  }, [])

  // Keyboard: "/" search, "j"/"k" next/previous conversation, Escape closes overlays.
  const move = useCallback((delta) => {
    const links = [...document.querySelectorAll('.conversation-list__items a[data-conversation-id]')]
    if (!links.length) return
    const index = links.findIndex((a) => a.getAttribute('aria-current') === 'true')
    const next = links[Math.min(links.length - 1, Math.max(0, index === -1 ? 0 : index + delta))]
    next.click()
    next.scrollIntoView({ block: 'nearest' })
  }, [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'Escape' && drawerOpen) setDrawerOpen(false)
      if (isTyping(document.activeElement) || document.querySelector('[role="menu"]')) return
      if (e.key === '/') {
        e.preventDefault()
        searchRef.current?.focus()
      } else if (e.key === 'j') move(1)
      else if (e.key === 'k') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, drawerOpen])

  return (
    <div className="app-shell">
      <Sidebar workspaceId={workspaceId} activeView={view.id} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      <main className={`inbox ${conversationId ? 'has-selection' : ''} ${detailsOpen ? 'details-open' : ''}`}>
        <ConversationList
          ref={searchRef}
          workspaceId={workspaceId}
          view={view}
          selectedId={conversationId}
          query={query}
          onQueryChange={setQuery}
          onOpenSidebar={() => setDrawerOpen(true)}
        />
        <ChatPanel
          conversationId={conversationId}
          onBack={() => navigate(base)}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsPreference(!detailsOpen)}
        />
        {detailsOpen && (
          <>
            <div className="details-scrim" onClick={() => setDetailsPreference(false)} aria-hidden="true" />
            <DetailsPanel conversationId={conversationId} onClose={() => setDetailsPreference(false)} />
          </>
        )}
      </main>
    </div>
  )
}

export function InboxPage() {
  const { user } = useAuth()
  const { workspaceId, view: viewId, conversationId } = useParams()

  // The server enforces membership on every request (403). Checking here as well
  // avoids even asking for another workspace's data.
  if (!user.workspaces.some((w) => w.id === workspaceId)) return <NoAccessPage />

  const view = findView(viewId)
  if (!view) return <Navigate to={`/w/${encodeURIComponent(workspaceId)}/${DEFAULT_VIEW}`} replace />

  return (
    // key: switching workspace starts from a clean state and a new socket.
    <InboxProvider key={workspaceId} workspaceId={workspaceId}>
      <InboxShell workspaceId={workspaceId} view={view} conversationId={conversationId} />
    </InboxProvider>
  )
}
