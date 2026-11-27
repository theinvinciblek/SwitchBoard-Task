import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { ArrowRight, KeyRound, LockKeyhole, Radio, ShieldCheck, UsersRound, Waypoints } from 'lucide-react'
import { useAuth } from '../context/AuthContext.jsx'
import { Button } from '../components/ui/Button.jsx'

const FEATURES = [
  { icon: Radio, title: 'Real time', text: 'New messages, delivery status and assignments appear the moment they happen.' },
  { icon: UsersRound, title: 'Built for teams', text: 'One owner per conversation, so customers never get two answers.' },
  { icon: ShieldCheck, title: 'Isolated workspaces', text: 'Each business sees only its own customers and conversations.' },
]

export function LoginPage() {
  const { status, signIn } = useAuth()
  const [redirecting, setRedirecting] = useState(false)

  if (status === 'authenticated') return <Navigate to="/" replace />

  return (
    <div className="login">
      <div className="login__panel">
        <div className="login__card">
          <span className="brand__mark brand__mark--lg" aria-hidden="true">
            <Waypoints size={22} strokeWidth={2.25} />
          </span>
          <h1 className="login__title">Sign in to Switchboard</h1>
          <p className="login__subtitle">The shared inbox for your support team.</p>

          <Button
            variant="primary"
            size="lg"
            icon={KeyRound}
            iconRight={ArrowRight}
            loading={redirecting}
            className="login__button"
            onClick={() => {
              setRedirecting(true)
              signIn()
            }}
          >
            Continue with single sign-on
          </Button>

          <p className="login__note">
            <LockKeyhole size={13} strokeWidth={2} aria-hidden="true" />
            You will be redirected to your organization's identity provider.
          </p>
        </div>
      </div>

      <div className="login__aside" aria-hidden="true">
        <div className="login__aside-inner">
          <p className="login__eyebrow">Switchboard</p>
          <p className="login__headline">Every customer conversation, one calm inbox.</p>
          <ul className="login__features">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <li key={title}>
                <span className="login__feature-icon">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <div>
                  <p className="login__feature-title">{title}</p>
                  <p className="login__feature-text">{text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
