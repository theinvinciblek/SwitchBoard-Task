import { request } from './client.js'

// Every endpoint here exists in backend/routes. Response shapes match the controllers.

const ws = (workspaceId) => `workspace=${encodeURIComponent(workspaceId)}`
const conv = (id) => encodeURIComponent(id)

// GET /api/me -> { sub, name, email, workspaces: [{ id, role }] }
export const getMe = () => request('/api/me')

// POST /auth/logout -> 204
export const logout = () => request('/auth/logout', { method: 'POST' })

// GET /api/conversations -> { conversations, pagination: { page, limit, total, totalPages, hasNextPage } }
export const listConversations = (workspaceId, { page = 1, limit = 100, signal } = {}) =>
  request(`/api/conversations?${ws(workspaceId)}&page=${page}&limit=${limit}`, { signal })

// GET /api/conversations/:id/messages -> { conversation, messages }
export const getMessages = (workspaceId, conversationId, { signal } = {}) =>
  request(`/api/conversations/${conv(conversationId)}/messages?${ws(workspaceId)}`, { signal })

// POST /api/conversations/:id/messages { text, client_ref } -> 202 { message, duplicate }
// The same client_ref is the same reply, so a retry can never send twice.
export const sendReply = (workspaceId, conversationId, { text, clientRef }) =>
  request(`/api/conversations/${conv(conversationId)}/messages?${ws(workspaceId)}`, {
    method: 'POST',
    body: { text, client_ref: clientRef },
  })

// POST /api/conversations/:id/claim -> 200 { conversation } | 409 { conversation }
export const claimConversation = (workspaceId, conversationId) =>
  request(`/api/conversations/${conv(conversationId)}/claim?${ws(workspaceId)}`, {
    method: 'POST',
    allowStatuses: [409],
  })

// POST /api/conversations/:id/close | /reopen -> { conversation }
export const setConversationStatus = (workspaceId, conversationId, status) =>
  request(
    `/api/conversations/${conv(conversationId)}/${status === 'closed' ? 'close' : 'reopen'}?${ws(workspaceId)}`,
    { method: 'POST' },
  )
