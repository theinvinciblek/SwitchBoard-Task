import { useEffect, useRef, useState } from 'react'

// Native WebSocket to the backend's GET /ws?workspace=<id>[&after=<seq>].
//
// - Every change frame carries `seq`. The last seq seen is kept, and a reconnect asks
//   for `after=<last seq>`, so the server replays exactly what was missed.
// - Frames at or below the last seq are ignored, so a replay that overlaps live
//   frames is harmless.
// - Reconnects with exponential backoff and jitter; immediately when the browser
//   comes back online or the tab becomes visible again.
// - After repeated failures, onConnectionTrouble lets the app check whether the
//   session expired (the server refuses the upgrade without one).
//
// status: 'connecting' | 'live' | 'reconnecting'
export function useRealtime(workspaceId, { onFrame, onConnected, onConnectionTrouble }) {
  const [status, setStatus] = useState('connecting')
  const handlers = useRef({ onFrame, onConnected, onConnectionTrouble })

  useEffect(() => {
    handlers.current = { onFrame, onConnected, onConnectionTrouble }
  })

  useEffect(() => {
    if (!workspaceId) return undefined

    let socket = null
    let timer = null
    let failures = 0
    let lastSeq = null
    let everConnected = false
    let disposed = false

    const scheduleReconnect = () => {
      if (disposed) return
      failures += 1
      setStatus(everConnected ? 'reconnecting' : 'connecting')
      if (failures % 3 === 0) handlers.current.onConnectionTrouble?.()
      const base = Math.min(15000, 500 * 2 ** Math.min(failures, 5))
      timer = setTimeout(connect, base / 2 + Math.random() * (base / 2))
    }

    function connect() {
      if (disposed) return
      clearTimeout(timer)
      const params = new URLSearchParams({ workspace: workspaceId })
      if (lastSeq !== null) params.set('after', String(lastSeq))
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws?${params}`)
      socket = ws

      ws.onmessage = (event) => {
        let frame
        try {
          frame = JSON.parse(event.data)
        } catch {
          return
        }

        if (frame.type === 'ready') {
          // Sent once per connection, after any replay.
          const initial = !everConnected
          lastSeq = Math.max(lastSeq ?? 0, Number(frame.latestSeq) || 0)
          everConnected = true
          failures = 0
          setStatus('live')
          handlers.current.onConnected?.({ initial })
          return
        }

        if (typeof frame.seq !== 'number') return
        if (lastSeq !== null && frame.seq <= lastSeq) return
        lastSeq = frame.seq
        handlers.current.onFrame?.(frame)
      }

      ws.onclose = () => {
        if (socket === ws) scheduleReconnect()
      }
    }

    const reconnectNow = () => {
      if (disposed) return
      if (!socket || socket.readyState === WebSocket.CLOSED) {
        failures = 0
        connect()
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') reconnectNow()
    }

    connect()
    window.addEventListener('online', reconnectNow)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      disposed = true
      clearTimeout(timer)
      window.removeEventListener('online', reconnectNow)
      document.removeEventListener('visibilitychange', onVisible)
      const ws = socket
      socket = null
      ws?.close()
    }
  }, [workspaceId])

  return status
}
