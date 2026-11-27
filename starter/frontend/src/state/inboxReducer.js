// Inbox state for one workspace: the conversation list and the loaded threads.
// Everything is merged by key, so applying the same data twice (an API response and
// a live frame, or a replayed frame) changes nothing.

const STATUS_RANK = { queued: 0, sent: 1, delivered: 2, failed: 2 }

// Same rule as the backend: a status only moves forward.
export const laterStatus = (a, b) => ((STATUS_RANK[b] ?? -1) > (STATUS_RANK[a] ?? -1) ? b : a)

const time = (value) => (value ? new Date(value).getTime() : 0)

export const initialInboxState = {
  list: { state: 'loading', error: null, page: 0, hasNextPage: false, loadingMore: false },
  conversations: {}, // id -> conversation
  threads: {}, // conversationId -> { state, error, messages }
  unknownContacts: 0, // bumps when a frame mentions a contact we have not loaded
}

const mergeConversation = (existing, incoming) => {
  if (!existing) return incoming
  const incomingIsNewer = time(incoming.lastMessageAt) >= time(existing.lastMessageAt)
  return {
    ...existing,
    ...incoming,
    lastMessageAt: incomingIsNewer ? incoming.lastMessageAt : existing.lastMessageAt,
    lastMessageText: incomingIsNewer ? (incoming.lastMessageText ?? existing.lastMessageText) : existing.lastMessageText,
  }
}

// Ids made in the browser before the server's message is known.
const isTemporaryId = (id) => /^(local|live):/.test(String(id))

const sameMessage = (a, b) =>
  a._id === b._id ||
  (a.clientRef && b.clientRef && a.clientRef === b.clientRef) ||
  (a.pigeonMessageId && b.pigeonMessageId && a.pigeonMessageId === b.pigeonMessageId && a.direction === b.direction)

const sortMessages = (messages) =>
  messages.sort((a, b) => time(a.occurredAt) - time(b.occurredAt) || String(a._id).localeCompare(String(b._id)))

const upsertMessage = (messages, incoming) => {
  const index = messages.findIndex((m) => sameMessage(m, incoming))
  if (index === -1) return sortMessages([...messages, incoming])

  const existing = messages[index]
  const incomingFromServer = !isTemporaryId(incoming._id)
  const merged = {
    ...existing,
    ...incoming,
    // Prefer the server's id and time once we have them; never move a status backwards.
    _id: incomingFromServer ? incoming._id : existing._id,
    occurredAt: incomingFromServer ? (incoming.occurredAt ?? existing.occurredAt) : (existing.occurredAt ?? incoming.occurredAt),
    status: laterStatus(existing.status, incoming.status),
  }
  const next = [...messages]
  next[index] = merged
  return sortMessages(next)
}

const updateThread = (state, conversationId, fn) => {
  const thread = state.threads[conversationId]
  if (!thread || thread.state !== 'ready') return state
  return { ...state, threads: { ...state.threads, [conversationId]: { ...thread, messages: fn(thread.messages) } } }
}

const updateConversation = (state, id, fn) => {
  const existing = state.conversations[id]
  if (!existing) return state
  return { ...state, conversations: { ...state.conversations, [id]: fn(existing) } }
}

const findByContact = (state, contact) => Object.values(state.conversations).find((c) => c.contact === contact)

const applyFrame = (state, frame) => {
  const conversation = findByContact(state, frame.contact)
  if (!conversation) {
    // A contact we have not loaded (new, or beyond the loaded pages): refetch the list.
    return frame.type.startsWith('message.') || frame.type.startsWith('conversation.')
      ? { ...state, unknownContacts: state.unknownContacts + 1 }
      : state
  }
  const id = conversation._id

  switch (frame.type) {
    case 'message.inbound': {
      const occurredAt = frame.occurred_at ?? new Date().toISOString()
      let next = updateConversation(state, id, (c) =>
        mergeConversation(c, { status: 'open', lastMessageAt: occurredAt, lastMessageText: frame.text ?? c.lastMessageText }),
      )
      next = updateThread(next, id, (messages) =>
        upsertMessage(messages, {
          _id: `live:${frame.message_id}`,
          conversationId: id,
          pigeonMessageId: frame.message_id,
          direction: 'inbound',
          senderType: 'customer',
          text: frame.text ?? '',
          status: 'delivered',
          occurredAt,
        }),
      )
      return next
    }

    case 'message.outbound': {
      const at = new Date().toISOString()
      let next = updateConversation(state, id, (c) =>
        mergeConversation(c, { lastMessageAt: at, lastMessageText: frame.text ?? c.lastMessageText }),
      )
      next = updateThread(next, id, (messages) =>
        upsertMessage(messages, {
          _id: `live:${frame.client_ref}`,
          conversationId: id,
          clientRef: frame.client_ref,
          direction: 'outbound',
          senderType: 'agent',
          senderId: frame.sender ?? null,
          text: frame.text ?? '',
          status: frame.status ?? 'queued',
          occurredAt: at,
        }),
      )
      return next
    }

    case 'message.status':
      return updateThread(state, id, (messages) => {
        const index = messages.findIndex((m) => m.clientRef === frame.client_ref)
        if (index === -1) return messages
        const next = [...messages]
        next[index] = { ...next[index], status: laterStatus(next[index].status, frame.status) }
        return next
      })

    case 'conversation.assigned':
      return updateConversation(state, id, (c) => ({ ...c, assignee: frame.assignee ?? null }))

    case 'conversation.status':
      return updateConversation(state, id, (c) => ({ ...c, status: frame.status }))

    default:
      return state
  }
}

export function inboxReducer(state, action) {
  switch (action.type) {
    case 'reset':
      return initialInboxState

    case 'list/loading':
      return action.more
        ? { ...state, list: { ...state.list, loadingMore: true } }
        : { ...state, list: { ...state.list, state: state.list.page ? state.list.state : 'loading', error: null } }

    case 'list/loaded': {
      const conversations = { ...state.conversations }
      for (const c of action.conversations) conversations[c._id] = mergeConversation(conversations[c._id], c)
      const page = action.more ? action.pagination.page : Math.max(state.list.page, action.pagination.page)
      return {
        ...state,
        conversations,
        list: {
          state: 'ready',
          error: null,
          page,
          hasNextPage: action.more ? action.pagination.hasNextPage : state.list.page > 1 ? state.list.hasNextPage : action.pagination.hasNextPage,
          loadingMore: false,
        },
      }
    }

    case 'list/failed':
      return {
        ...state,
        list: { ...state.list, state: state.list.page ? state.list.state : 'error', error: action.error, loadingMore: false },
      }

    case 'thread/loading': {
      const existing = state.threads[action.conversationId]
      if (existing?.state === 'ready') return state
      return { ...state, threads: { ...state.threads, [action.conversationId]: { state: 'loading', error: null, messages: [] } } }
    }

    case 'thread/loaded': {
      const existing = state.threads[action.conversationId]
      let messages = existing?.state === 'ready' ? existing.messages : []
      for (const m of action.messages) messages = upsertMessage(messages, m)
      return {
        ...state,
        conversations: { ...state.conversations, [action.conversation._id]: mergeConversation(state.conversations[action.conversation._id], action.conversation) },
        threads: { ...state.threads, [action.conversationId]: { state: 'ready', error: null, messages } },
      }
    }

    case 'thread/failed': {
      const existing = state.threads[action.conversationId]
      if (existing?.state === 'ready') return state
      return { ...state, threads: { ...state.threads, [action.conversationId]: { state: 'error', error: action.error, messages: [] } } }
    }

    case 'conversation/updated':
      return {
        ...state,
        conversations: { ...state.conversations, [action.conversation._id]: mergeConversation(state.conversations[action.conversation._id], action.conversation) },
      }

    case 'message/local':
      return updateConversation(
        updateThread(state, action.conversationId, (messages) => upsertMessage(messages, action.message)),
        action.conversationId,
        (c) => mergeConversation(c, { lastMessageAt: action.message.occurredAt, lastMessageText: action.message.text }),
      )

    case 'message/stored':
      return updateThread(state, action.conversationId, (messages) =>
        upsertMessage(messages, { ...action.message, localState: null, localError: null }),
      )

    case 'message/submitFailed':
      return updateThread(state, action.conversationId, (messages) =>
        messages.map((m) => (m.clientRef === action.clientRef ? { ...m, localState: 'error', localError: action.error } : m)),
      )

    case 'frame':
      return applyFrame(state, action.frame)

    default:
      return state
  }
}
