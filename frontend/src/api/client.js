// Thin fetch wrapper. Requests are same-origin (Vite proxies /api and /auth to the
// backend), so the HttpOnly session cookie is sent automatically.

export class ApiError extends Error {
  constructor(status, message, data) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.data = data
  }

  // Worth retrying with the same idempotency key: no answer, or a server-side failure.
  get retryable() {
    return this.status === 0 || this.status >= 500
  }
}

let unauthorizedHandler = null

// AuthContext registers this so any 401 signs the user out of the UI.
export const onUnauthorized = (handler) => {
  unauthorizedHandler = handler
}

export async function request(path, { method = 'GET', body, signal, allowStatuses = [] } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    })
  } catch (error) {
    if (error.name === 'AbortError') throw error
    throw new ApiError(0, 'Cannot reach the server. Check your connection.', null)
  }

  const text = await res.text()
  let data = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }

  if (res.ok || allowStatuses.includes(res.status)) return { status: res.status, data }

  if (res.status === 401 && unauthorizedHandler) unauthorizedHandler()

  const message =
    data?.message || data?.error || (res.status >= 500 ? 'Something went wrong on the server.' : `Request failed (${res.status}).`)
  throw new ApiError(res.status, message, data)
}
