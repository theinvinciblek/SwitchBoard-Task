// Formatting helpers: phone numbers, times, names.

const COUNTRIES = [
  ['1', 'US / Canada'],
  ['44', 'United Kingdom'],
  ['49', 'Germany'],
  ['34', 'Spain'],
  ['33', 'France'],
  ['39', 'Italy'],
  ['31', 'Netherlands'],
  ['61', 'Australia'],
  ['91', 'India'],
]

const splitNumber = (phone) => {
  const digits = String(phone ?? '').replace(/\D/g, '')
  const match = COUNTRIES.find(([code]) => digits.startsWith(code))
  return match ? { code: match[0], country: match[1], rest: digits.slice(match[0].length) } : { code: null, country: null, rest: digits }
}

export const countryOf = (phone) => splitNumber(phone).country

export const formatPhone = (phone) => {
  if (!phone) return 'Unknown contact'
  if (!String(phone).startsWith('+')) return phone
  const { code, rest } = splitNumber(phone)
  if (code === '1' && rest.length === 10) return `+1 (${rest.slice(0, 3)}) ${rest.slice(3, 6)}-${rest.slice(6)}`
  if (code === '44' && rest.length === 10) return `+44 ${rest.slice(0, 2)} ${rest.slice(2, 6)} ${rest.slice(6)}`
  if (!code) return phone
  const groups = rest.match(/.{1,3}(?=(.{3})*$)/g) ?? [rest]
  return `+${code} ${groups.join(' ')}`
}

const sameDay = (a, b) => a.toDateString() === b.toDateString()

const toDate = (value) => (value instanceof Date ? value : new Date(value))

export const formatTime = (value) =>
  toDate(value).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })

// Compact time for list rows: Now, 12m, 3:05 PM, Yesterday, Mon, Nov 18
export const formatListTime = (value, now = new Date()) => {
  if (!value) return ''
  const date = toDate(value)
  const diffMinutes = Math.floor((now - date) / 60000)
  if (diffMinutes < 1) return 'Now'
  if (diffMinutes < 60) return `${diffMinutes}m`
  if (sameDay(date, now)) return formatTime(date)
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return 'Yesterday'
  if (now - date < 6 * 24 * 3600 * 1000) return date.toLocaleDateString(undefined, { weekday: 'short' })
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

// Day dividers in the thread: Today, Yesterday, Monday, November 18
export const formatDayLabel = (value, now = new Date()) => {
  const date = toDate(value)
  if (sameDay(date, now)) return 'Today'
  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return 'Yesterday'
  if (now - date < 6 * 24 * 3600 * 1000) return date.toLocaleDateString(undefined, { weekday: 'long' })
  return date.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    ...(date.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  })
}

export const formatDateTime = (value) =>
  value
    ? toDate(value).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : 'Not yet'

export const initials = (name, fallback = '') => {
  const source = (name || fallback || '').trim()
  if (!source) return '?'
  const parts = source.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

// "u_ben" -> "Ben". Agent ids are opaque; this is only a display fallback.
export const agentLabel = (sub, me) => {
  if (!sub) return 'Unassigned'
  if (me && sub === me.sub) return 'You'
  const bare = String(sub).replace(/^u_/, '').replace(/[_-]+/g, ' ')
  return bare.charAt(0).toUpperCase() + bare.slice(1)
}

export const workspaceLabel = (id) => {
  const bare = String(id ?? '').replace(/^ws_/, '').replace(/[_-]+/g, ' ')
  return bare.replace(/\b\p{L}/gu, (c) => c.toUpperCase()) || id
}

// Stable hue from a string, for avatars.
export const hueOf = (value) => {
  let hash = 0
  for (const ch of String(value ?? '')) hash = (hash * 31 + ch.codePointAt(0)) | 0
  return Math.abs(hash) % 360
}
