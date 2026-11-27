import { Link, Navigate } from 'react-router-dom'
import { Building2, CloudOff, LogOut, MapPinOff, RefreshCw, ShieldAlert } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '../components/ui/Button.jsx'
import { EmptyState, Spinner } from '../components/ui/Feedback.jsx'

const FullPage = ({ children }) => <div className="full-page">{children}</div>

export function LoadingPage() {
  return (
    <FullPage>
      <Spinner size={22} label="Loading Switchboard" />
    </FullPage>
  )
}

export function ServerErrorPage() {
  const { refresh, error } = useAuth()
  return (
    <FullPage>
      <EmptyState
        icon={CloudOff}
        tone="danger"
        title="Cannot reach Switchboard"
        description={error?.message ?? 'The server did not answer. It may be starting up.'}
        action={<Button icon={RefreshCw} onClick={refresh}>Try again</Button>}
      />
    </FullPage>
  )
}

// "/" sends the user to their first workspace.
export function HomeRedirect() {
  const { user, signOut } = useAuth()
  const first = user.workspaces[0]
  if (first) return <Navigate to={`/w/${encodeURIComponent(first.id)}/open`} replace />
  return (
    <FullPage>
      <EmptyState
        icon={Building2}
        title="No workspaces yet"
        description="Your account is not a member of any workspace. Ask an admin to add you, then sign in again."
        action={<Button icon={LogOut} onClick={signOut}>Sign out</Button>}
      />
    </FullPage>
  )
}

export function NoAccessPage() {
  const { user } = useAuth()
  const first = user.workspaces[0]
  return (
    <FullPage>
      <EmptyState
        icon={ShieldAlert}
        title="You do not have access to this workspace"
        description="Your account is not a member of it, so its conversations are not available to you."
        action={
          first && (
            <Link className="btn btn--secondary btn--md" to={`/w/${encodeURIComponent(first.id)}/open`}>
              <span>Go to your workspace</span>
            </Link>
          )
        }
      />
    </FullPage>
  )
}

export function NotFoundPage() {
  return (
    <FullPage>
      <EmptyState
        icon={MapPinOff}
        title="Page not found"
        description="The address may be mistyped, or the page has moved."
        action={<Link className="btn btn--secondary btn--md" to="/"><span>Back to inbox</span></Link>}
      />
    </FullPage>
  )
}
