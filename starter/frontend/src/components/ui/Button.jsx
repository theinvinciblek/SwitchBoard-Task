import { forwardRef } from 'react'
import { LoaderCircle } from 'lucide-react'

// variant: 'primary' | 'secondary' | 'ghost' | 'danger'   size: 'sm' | 'md' | 'lg'
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, loading = false, children, className = '', disabled, ...props },
  ref,
) {
  const iconSize = size === 'lg' ? 16 : 14
  return (
    <button
      ref={ref}
      type="button"
      className={`btn btn--${variant} btn--${size} ${className}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <LoaderCircle className="spin" size={iconSize} strokeWidth={2} aria-hidden="true" />
      ) : (
        Icon && <Icon size={iconSize} strokeWidth={2} aria-hidden="true" />
      )}
      {children && <span>{children}</span>}
      {IconRight && <IconRight size={iconSize} strokeWidth={2} aria-hidden="true" />}
    </button>
  )
})

export const IconButton = forwardRef(function IconButton(
  { icon: Icon, label, size = 'md', active = false, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-button icon-button--${size} ${active ? 'is-active' : ''} ${className}`.trim()}
      aria-label={label}
      title={label}
      {...props}
    >
      <Icon size={size === 'sm' ? 14 : 16} strokeWidth={2} aria-hidden="true" />
    </button>
  )
})
