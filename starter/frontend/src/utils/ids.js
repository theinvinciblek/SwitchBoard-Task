// A new client_ref for each reply. The backend treats a repeated client_ref as the same
// reply, so the composer keeps the ref when it retries a failed send.
export const newClientRef = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID()
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
}
