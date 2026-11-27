import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CornerDownLeft, SendHorizontal } from 'lucide-react'
import { formatPhone } from '../../utils/format.js'

const MAX_LENGTH = 4000 // the backend rejects longer replies

// Drafts are kept per conversation while the app is open.
const drafts = new Map()

// Rendered with key={conversationId}, so switching conversations starts from that draft.
export function Composer({ conversationId, contact, onSend, disabled }) {
  const [text, setText] = useState(() => drafts.get(conversationId) ?? '')
  const ref = useRef(null)

  useEffect(() => {
    drafts.set(conversationId, text)
  }, [conversationId, text])

  // Grow with the content, up to a limit set in CSS.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [text])

  useEffect(() => {
    if (!disabled && window.matchMedia('(pointer: fine)').matches) ref.current?.focus()
  }, [conversationId, disabled])

  const trimmed = text.trim()
  const tooLong = text.length > MAX_LENGTH
  const canSend = !disabled && trimmed.length > 0 && !tooLong

  const submit = () => {
    if (!canSend) return
    onSend(trimmed)
    setText('')
    drafts.delete(conversationId)
  }

  return (
    <form
      className={`composer ${disabled ? 'is-disabled' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      <label className="sr-only" htmlFor={`composer-${conversationId}`}>
        Reply to {formatPhone(contact)}
      </label>
      <textarea
        id={`composer-${conversationId}`}
        ref={ref}
        className="composer__input"
        value={text}
        rows={1}
        disabled={disabled}
        placeholder={disabled ? 'Reopen the conversation to reply' : `Reply to ${formatPhone(contact)}`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <div className="composer__footer">
        <span className="composer__hint">
          <CornerDownLeft size={12} strokeWidth={2} aria-hidden="true" />
          Enter to send, Shift + Enter for a new line
        </span>
        <div className="composer__actions">
          {text.length > MAX_LENGTH * 0.9 && (
            <span className={`composer__count ${tooLong ? 'is-over' : ''}`} aria-live="polite">
              {text.length} / {MAX_LENGTH}
            </span>
          )}
          <button type="submit" className="btn btn--primary btn--sm composer__send" disabled={!canSend}>
            <span>Send</span>
            <SendHorizontal size={14} strokeWidth={2} aria-hidden="true" />
          </button>
        </div>
      </div>
    </form>
  )
}
