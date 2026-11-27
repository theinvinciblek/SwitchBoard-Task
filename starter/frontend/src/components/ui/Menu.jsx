import { useEffect, useId, useRef, useState } from 'react'

// A small accessible dropdown: opens on click, closes on outside click, Escape, or
// choosing an item. Arrow keys move between items.
export function Menu({ trigger, children, align = 'start', placement = 'bottom', className = '' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)
  const menuRef = useRef(null)
  const id = useId()

  useEffect(() => {
    if (!open) return undefined
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false)
    }
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false)
        rootRef.current?.querySelector('[data-menu-trigger]')?.focus()
      }
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault()
        const items = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled), [role="menuitemradio"]') ?? [])]
        if (!items.length) return
        const index = items.indexOf(document.activeElement)
        const next = event.key === 'ArrowDown' ? (index + 1) % items.length : (index - 1 + items.length) % items.length
        items[next].focus()
      }
    }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    requestAnimationFrame(() => menuRef.current?.querySelector('[role^="menuitem"]')?.focus())
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div className={`menu-root ${className}`} ref={rootRef}>
      {trigger({
        open,
        toggle: () => setOpen((o) => !o),
        props: { 'aria-haspopup': 'menu', 'aria-expanded': open, 'aria-controls': id, 'data-menu-trigger': true },
      })}
      {open && (
        <div
          id={id}
          ref={menuRef}
          role="menu"
          className={`menu menu--${align} menu--${placement}`}
          onClick={(event) => {
            if (event.target.closest('[role^="menuitem"]')) setOpen(false)
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}

export function MenuItem({ icon: Icon, children, hint, checked, onSelect, tone = 'neutral', radio = false }) {
  return (
    <button
      type="button"
      role={radio ? 'menuitemradio' : 'menuitem'}
      aria-checked={radio ? Boolean(checked) : undefined}
      className={`menu__item menu__item--${tone} ${checked ? 'is-checked' : ''}`}
      onClick={onSelect}
    >
      {Icon && <Icon className="menu__icon" size={15} strokeWidth={2} aria-hidden="true" />}
      <span className="menu__label">{children}</span>
      {hint && <span className="menu__hint">{hint}</span>}
    </button>
  )
}

export const MenuLabel = ({ children }) => <div className="menu__section-label">{children}</div>
export const MenuSeparator = () => <div className="menu__separator" role="separator" />
