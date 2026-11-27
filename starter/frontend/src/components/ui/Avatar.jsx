import { UserRound } from 'lucide-react'
import { hueOf, initials } from '../../utils/format.js'

// Contact avatars use a person icon on a tint derived from the number; people with a
// name (agents, the signed-in user) get initials.
export function Avatar({ seed, name, size = 32, square = false, className = '' }) {
  const hue = hueOf(seed ?? name)
  const style = { '--avatar-size': `${size}px`, '--avatar-hue': hue }
  const classes = `avatar ${square ? 'avatar--square' : ''} ${className}`.trim()

  if (name) {
    return (
      <span className={classes} style={style} aria-hidden="true">
        <span className="avatar__initials">{initials(name)}</span>
      </span>
    )
  }

  return (
    <span className={classes} style={style} aria-hidden="true">
      <UserRound size={Math.round(size * 0.5)} strokeWidth={1.75} />
    </span>
  )
}
