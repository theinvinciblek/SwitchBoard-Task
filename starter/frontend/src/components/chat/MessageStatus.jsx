import { Check, CheckCheck, CircleAlert, Clock, LoaderCircle } from 'lucide-react'

// Delivery status of an outbound message, as reported by Pigeon through the backend.
const STATUS = {
  sending: { icon: LoaderCircle, label: 'Sending', spin: true },
  queued: { icon: Clock, label: 'Queued' },
  sent: { icon: Check, label: 'Sent' },
  delivered: { icon: CheckCheck, label: 'Delivered' },
  failed: { icon: CircleAlert, label: 'Not delivered' },
}

export function MessageStatus({ status, showLabel = false }) {
  const meta = STATUS[status] ?? STATUS.queued
  const Icon = meta.icon
  return (
    <span className={`message-status message-status--${status}`} title={meta.label}>
      <Icon size={13} strokeWidth={2.25} className={meta.spin ? 'spin' : undefined} aria-hidden="true" />
      {showLabel ? <span>{meta.label}</span> : <span className="sr-only">{meta.label}</span>}
    </span>
  )
}
