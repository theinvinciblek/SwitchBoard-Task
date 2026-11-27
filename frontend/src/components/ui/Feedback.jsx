import { LoaderCircle } from 'lucide-react'

export function Spinner({ size = 16, label = 'Loading' }) {
  return (
    <span className="spinner" role="status" aria-label={label}>
      <LoaderCircle className="spin" size={size} strokeWidth={2} aria-hidden="true" />
    </span>
  )
}

export function EmptyState({ icon: Icon, title, description, action, tone = 'neutral', compact = false }) {
  return (
    <div className={`empty-state empty-state--${tone} ${compact ? 'empty-state--compact' : ''}`}>
      {Icon && (
        <span className="empty-state__icon" aria-hidden="true">
          <Icon size={compact ? 18 : 20} strokeWidth={1.75} />
        </span>
      )}
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__description">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  )
}

// tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger'
export function Badge({ tone = 'neutral', icon: Icon, children, title }) {
  return (
    <span className={`badge badge--${tone}`} title={title}>
      {Icon && <Icon size={12} strokeWidth={2.25} aria-hidden="true" />}
      {children}
    </span>
  )
}
