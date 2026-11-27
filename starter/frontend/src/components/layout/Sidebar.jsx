import { useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronsUpDown,
  LogOut,
  Monitor,
  Moon,
  Sun,
  Waypoints,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useInbox } from '../../context/InboxContext.jsx'
import { useTheme } from '../../hooks/useTheme.js'
import { Avatar } from '../ui/Avatar.jsx'
import { IconButton } from '../ui/Button.jsx'
import { Menu, MenuItem, MenuLabel, MenuSeparator } from '../ui/Menu.jsx'
import { VIEWS } from '../inbox/views.js'
import { workspaceLabel } from '../../utils/format.js'

function Brand() {
  return (
    <div className="brand">
      <span className="brand__mark" aria-hidden="true">
        <Waypoints size={16} strokeWidth={2.25} />
      </span>
      <span className="brand__name">Switchboard</span>
    </div>
  )
}

function WorkspaceSwitcher({ workspaceId }) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const current = user.workspaces.find((w) => w.id === workspaceId)

  return (
    <Menu
      className="workspace-switcher"
      trigger={({ toggle, open, props }) => (
        <button type="button" className={`workspace-switcher__trigger ${open ? 'is-open' : ''}`} onClick={toggle} {...props}>
          <Avatar name={workspaceLabel(workspaceId)} seed={workspaceId} size={28} square />
          <span className="workspace-switcher__text">
            <span className="workspace-switcher__name">{workspaceLabel(workspaceId)}</span>
            <span className="workspace-switcher__role">{current?.role === 'admin' ? 'Admin' : 'Agent'}</span>
          </span>
          <ChevronsUpDown className="workspace-switcher__chevron" size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      )}
    >
      <MenuLabel>Your workspaces</MenuLabel>
      {/* Only the workspaces in the user's IdP claim; the server enforces the same list. */}
      {user.workspaces.map((w) => (
        <MenuItem
          key={w.id}
          radio
          checked={w.id === workspaceId}
          icon={Building2}
          hint={w.id === workspaceId ? <Check size={14} strokeWidth={2.25} aria-hidden="true" /> : w.role === 'admin' ? 'Admin' : 'Agent'}
          onSelect={() => navigate(`/w/${encodeURIComponent(w.id)}`)}
        >
          {workspaceLabel(w.id)}
        </MenuItem>
      ))}
    </Menu>
  )
}

function ConnectionStatus({ status }) {
  const live = status === 'live'
  const label = live ? 'Live' : status === 'reconnecting' ? 'Reconnecting' : 'Connecting'
  const Icon = live ? Wifi : WifiOff
  return (
    <div
      className={`connection connection--${status}`}
      role="status"
      title={live ? 'Receiving updates in real time' : 'Trying to reach the server. Missed updates are replayed when it reconnects.'}
    >
      <span className="connection__dot" aria-hidden="true" />
      <Icon size={13} strokeWidth={2} aria-hidden="true" />
      <span>{label}</span>
    </div>
  )
}

function UserMenu() {
  const { user, signOut } = useAuth()
  const [theme, setTheme] = useTheme()
  const themes = [
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
    { id: 'system', label: 'System', icon: Monitor },
  ]

  return (
    <Menu
      className="user-menu"
      placement="top"
      trigger={({ toggle, open, props }) => (
        <button type="button" className={`user-menu__trigger ${open ? 'is-open' : ''}`} onClick={toggle} {...props}>
          <Avatar name={user.name || user.email || user.sub} seed={user.sub} size={28} />
          <span className="user-menu__text">
            <span className="user-menu__name">{user.name || user.sub}</span>
            {user.email && <span className="user-menu__email">{user.email}</span>}
          </span>
          <ChevronsUpDown size={14} strokeWidth={2} aria-hidden="true" className="user-menu__chevron" />
        </button>
      )}
    >
      <MenuLabel>Appearance</MenuLabel>
      {themes.map((t) => (
        <MenuItem key={t.id} radio checked={theme === t.id} icon={t.icon} onSelect={() => setTheme(t.id)}
          hint={theme === t.id ? <Check size={14} strokeWidth={2.25} aria-hidden="true" /> : null}>
          {t.label}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem icon={LogOut} onSelect={signOut}>
        Sign out
      </MenuItem>
    </Menu>
  )
}

export function Sidebar({ workspaceId, activeView, open, onClose }) {
  const { user } = useAuth()
  const { state, connection, isUnread } = useInbox()

  const counts = useMemo(() => {
    const list = Object.values(state.conversations)
    return Object.fromEntries(
      VIEWS.map((v) => {
        const matching = list.filter((c) => v.match(c, user))
        return [v.id, { total: matching.length, unread: matching.filter(isUnread).length }]
      }),
    )
  }, [state.conversations, user, isUnread])

  return (
    <>
      <div className={`sidebar-scrim ${open ? 'is-visible' : ''}`} onClick={onClose} aria-hidden="true" />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="Main navigation">
        <div className="sidebar__header">
          <Brand />
          <IconButton icon={X} label="Close navigation" className="sidebar__close" onClick={onClose} />
        </div>

        <WorkspaceSwitcher workspaceId={workspaceId} />

        <nav className="sidebar__nav" aria-label="Inbox views">
          <p className="sidebar__section-label">Inbox</p>
          <ul>
            {VIEWS.map((view) => {
              const Icon = view.icon
              const count = counts[view.id]
              const loaded = state.list.state === 'ready'
              return (
                <li key={view.id}>
                  <Link
                    to={`/w/${encodeURIComponent(workspaceId)}/${view.id}`}
                    className={`nav-item ${activeView === view.id ? 'is-active' : ''}`}
                    aria-current={activeView === view.id ? 'page' : undefined}
                    onClick={onClose}
                  >
                    <Icon size={16} strokeWidth={2} aria-hidden="true" className="nav-item__icon" />
                    <span className="nav-item__label">{view.label}</span>
                    {loaded && count.unread > 0 && view.id !== 'closed' && (
                      <span className="nav-item__unread" title={`${count.unread} with new activity`} aria-label={`${count.unread} unread`} />
                    )}
                    {loaded && <span className="nav-item__count">{count.total}</span>}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className="sidebar__footer">
          <ConnectionStatus status={connection} />
          <UserMenu />
        </div>
      </aside>
    </>
  )
}
