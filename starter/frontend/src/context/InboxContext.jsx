import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import * as api from '../api/switchboard.js'
import { inboxReducer, initialInboxState } from '../state/inboxReducer.js'
import { useRealtime } from '../hooks/useRealtime.js'
import { useAuth } from './AuthContext.jsx'
import { useToast } from './ToastContext.jsx'
import { agentLabel } from '../utils/format.js'
import { newClientRef } from '../utils/ids.js'
import { readJSON, writeJSON } from '../utils/storage.js'

const InboxContext = createContext(null)

const PAGE_SIZE = 100 // the backend's maximum
const SEND_RETRY_DELAYS = [800, 2500] // automatic retries, same client_ref

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const time = (value) => (value ? new Date(value).getTime() : 0)

// Unread is tracked in this browser, per user and workspace (the API has no read state).
// A conversation is unread when it has activity after the user last looked at it.
// The provider is keyed by workspace, so `key` is fixed for this hook's lifetime.
function useReadMarkers(userSub, workspaceId) {
  const key = `sb:seen:${userSub}:${workspaceId}`
  const [markers, setMarkers] = useState(() => {
    const stored = readJSON(key, null)
    if (stored?.seen) return stored
    // First visit: everything that already happened counts as seen.
    const fresh = { baseline: new Date().toISOString(), seen: {} }
    writeJSON(key, fresh)
    return fresh
  })

  const markSeen = useCallback(
    (conversationId, at) => {
      setMarkers((current) => {
        if (!current) return current
        if (time(current.seen[conversationId]) >= time(at)) return current
        const next = { ...current, seen: { ...current.seen, [conversationId]: at } }
        writeJSON(key, next)
        return next
      })
    },
    [key],
  )

  const isUnread = useCallback(
    (conversation) => {
      if (!markers) return false
      const seenAt = Math.max(time(markers.baseline), time(markers.seen[conversation._id]))
      return time(conversation.lastMessageAt) > seenAt
    },
    [markers],
  )

  return { isUnread, markSeen }
}

export function InboxProvider({ workspaceId, children }) {
  const { user, refresh: refreshAuth } = useAuth()
  const toast = useToast()
  const [state, dispatch] = useReducer(inboxReducer, initialInboxState)
  const stateRef = useRef(state)
  const selectedRef = useRef(null)
  const { isUnread, markSeen } = useReadMarkers(user.sub, workspaceId)

  useEffect(() => {
    stateRef.current = state
  })

  // ---- loading ----

  const loadList = useCallback(
    async ({ more = false } = {}) => {
      dispatch({ type: 'list/loading', more })
      try {
        const page = more ? stateRef.current.list.page + 1 : 1
        const { data } = await api.listConversations(workspaceId, { page, limit: PAGE_SIZE })
        dispatch({ type: 'list/loaded', conversations: data.conversations, pagination: data.pagination, more })
      } catch (error) {
        dispatch({ type: 'list/failed', error: error.message })
        if (more) toast.error('Could not load more conversations', error.message)
      }
    },
    [workspaceId, toast],
  )

  const loadThread = useCallback(
    async (conversationId, { force = false } = {}) => {
      if (!conversationId) return
      if (!force) dispatch({ type: 'thread/loading', conversationId })
      try {
        const { data } = await api.getMessages(workspaceId, conversationId)
        dispatch({ type: 'thread/loaded', conversationId, conversation: data.conversation, messages: data.messages })
      } catch (error) {
        dispatch({ type: 'thread/failed', conversationId, error: error.message, status: error.status })
      }
    },
    [workspaceId],
  )

  useEffect(() => {
    dispatch({ type: 'reset' })
    loadList()
  }, [loadList])

  // A frame mentioned a contact that is not loaded: refetch the first page (debounced).
  useEffect(() => {
    if (!state.unknownContacts) return undefined
    const id = setTimeout(() => loadList(), 400)
    return () => clearTimeout(id)
  }, [state.unknownContacts, loadList])

  // ---- real time ----

  const onFrame = useCallback((frame) => dispatch({ type: 'frame', frame }), [])

  const onConnected = useCallback(
    ({ initial }) => {
      // The first connection starts at "now": refetch once so nothing that happened
      // between the first page load and the socket opening is missed. Reconnects are
      // covered by the server's replay (after=<last seq>).
      if (initial) {
        loadList()
        if (selectedRef.current) loadThread(selectedRef.current, { force: true })
      }
    },
    [loadList, loadThread],
  )

  const connection = useRealtime(workspaceId, { onFrame, onConnected, onConnectionTrouble: refreshAuth })

  // ---- actions ----

  const submitReply = useCallback(
    async (conversationId, clientRef, text) => {
      for (let attempt = 0; ; attempt++) {
        try {
          const { data } = await api.sendReply(workspaceId, conversationId, { text, clientRef })
          dispatch({ type: 'message/stored', conversationId, message: data.message })
          return
        } catch (error) {
          // Same client_ref on every retry: the backend stores one reply, however many arrive.
          if (error.retryable && attempt < SEND_RETRY_DELAYS.length) {
            await sleep(SEND_RETRY_DELAYS[attempt])
            continue
          }
          dispatch({ type: 'message/submitFailed', conversationId, clientRef, error: error.message })
          return
        }
      }
    },
    [workspaceId],
  )

  const sendReply = useCallback(
    (conversationId, text) => {
      const clientRef = newClientRef()
      dispatch({
        type: 'message/local',
        conversationId,
        message: {
          _id: `local:${clientRef}`,
          conversationId,
          clientRef,
          direction: 'outbound',
          senderType: 'agent',
          senderId: user.sub,
          text,
          status: 'queued',
          occurredAt: new Date().toISOString(),
          localState: 'sending',
        },
      })
      return submitReply(conversationId, clientRef, text)
    },
    [submitReply, user.sub],
  )

  const retryReply = useCallback(
    (conversationId, message) => {
      dispatch({ type: 'message/local', conversationId, message: { ...message, localState: 'sending', localError: null } })
      return submitReply(conversationId, message.clientRef, message.text)
    },
    [submitReply],
  )

  const claim = useCallback(
    async (conversationId) => {
      try {
        const { status, data } = await api.claimConversation(workspaceId, conversationId)
        dispatch({ type: 'conversation/updated', conversation: data.conversation })
        if (status === 409) {
          toast.error('Already assigned', `${agentLabel(data.conversation.assignee, user)} is handling this conversation.`)
        } else {
          toast.success('Assigned to you')
        }
      } catch (error) {
        toast.error('Could not assign the conversation', error.message)
      }
    },
    [workspaceId, toast, user],
  )

  const setStatus = useCallback(
    async (conversationId, status) => {
      try {
        const { data } = await api.setConversationStatus(workspaceId, conversationId, status)
        dispatch({ type: 'conversation/updated', conversation: data.conversation })
        toast.success(status === 'closed' ? 'Conversation closed' : 'Conversation reopened')
      } catch (error) {
        toast.error(status === 'closed' ? 'Could not close the conversation' : 'Could not reopen the conversation', error.message)
      }
    },
    [workspaceId, toast],
  )

  const select = useCallback(
    (conversationId) => {
      selectedRef.current = conversationId
      if (conversationId && stateRef.current.threads[conversationId]?.state !== 'ready') loadThread(conversationId)
    },
    [loadThread],
  )

  const value = useMemo(
    () => ({
      workspaceId,
      state,
      connection,
      isUnread,
      markSeen,
      loadList,
      loadThread,
      select,
      sendReply,
      retryReply,
      claim,
      setStatus,
    }),
    [workspaceId, state, connection, isUnread, markSeen, loadList, loadThread, select, sendReply, retryReply, claim, setStatus],
  )

  return <InboxContext.Provider value={value}>{children}</InboxContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useInbox = () => useContext(InboxContext)
