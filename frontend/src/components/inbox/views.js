import { Archive, CircleDashed, Inbox, UserCheck } from 'lucide-react'

// Inbox views. They filter the conversations already loaded from
// GET /api/conversations (the API has no filter parameters).
export const VIEWS = [
  {
    id: 'open',
    label: 'Open',
    icon: Inbox,
    match: (c) => c.status !== 'closed',
    empty: { title: 'Inbox zero', description: 'No open conversations right now. New customer messages appear here as they arrive.' },
  },
  {
    id: 'mine',
    label: 'Assigned to me',
    shortLabel: 'Mine',
    icon: UserCheck,
    match: (c, me) => c.status !== 'closed' && c.assignee === me.sub,
    empty: { title: 'Nothing assigned to you', description: 'Assign an open conversation to yourself and it will show up here.' },
  },
  {
    id: 'unassigned',
    label: 'Unassigned',
    icon: CircleDashed,
    match: (c) => c.status !== 'closed' && !c.assignee,
    empty: { title: 'Everything is covered', description: 'Every open conversation has someone assigned.' },
  },
  {
    id: 'closed',
    label: 'Closed',
    icon: Archive,
    match: (c) => c.status === 'closed',
    empty: { title: 'No closed conversations', description: 'Conversations you close are kept here and can be reopened at any time.' },
  },
]

export const DEFAULT_VIEW = 'open'
export const findView = (id) => VIEWS.find((v) => v.id === id) ?? null
