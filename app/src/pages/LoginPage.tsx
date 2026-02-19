import { useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '../state/AuthContext'

export const LoginPage = () => {
  const { user, signInWithGoogle, signInWithEmailPassword, loading, configError, configured } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)
  const devAuthBypassEnabled = import.meta.env.DEV

  const qaAuthEnabled = useMemo(() => {
    const qaAuthQueryEnabled = new URLSearchParams(location.search).get('qaAuth') === '1'
    return import.meta.env.DEV || qaAuthQueryEnabled
  }, [location.search])

  if (user) {
    return <Navigate to="/" replace />
  }

  return (
    <main className="login-shell">
      <section className="login-card">
        <h1>CollabBoard</h1>
        <p>Real-time collaborative whiteboard with AI-powered features</p>
        {configError && <p className="error-text">{configError}</p>}
        {emailError && <p className="error-text">{emailError}</p>}
        <button
          type="button"
          className="button button-primary"
          disabled={loading || !configured}
          data-testid="google-signin-button"
          onClick={() => void signInWithGoogle()}
        >
          <span className="google-icon">G</span>
          Continue with Google
        </button>

        {qaAuthEnabled && (
          <form
            className="qa-login-form"
            onSubmit={(event) => {
              event.preventDefault()
              setEmailError(null)
              setEmailLoading(true)
              void signInWithEmailPassword(email, password)
                .catch((error: unknown) => {
                  setEmailError(error instanceof Error ? error.message : 'Email sign-in failed')
                })
                .finally(() => {
                  setEmailLoading(false)
                })
            }}
          >
            <label htmlFor="qa-email">{devAuthBypassEnabled ? 'Email or username' : 'Email address'}</label>
            <input
              id="qa-email"
              data-testid="qa-email-input"
              type={devAuthBypassEnabled ? 'text' : 'email'}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
            <label htmlFor="qa-password">Password</label>
            <input
              id="qa-password"
              data-testid="qa-password-input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="submit"
              className="button button-secondary"
              data-testid="qa-email-submit"
              disabled={loading || emailLoading || (!configured && !devAuthBypassEnabled)}
            >
              {emailLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
