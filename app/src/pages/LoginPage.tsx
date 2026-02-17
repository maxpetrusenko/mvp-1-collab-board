import { useMemo, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { defaultBoardId } from '../config/env'
import { useAuth } from '../state/AuthContext'

export const LoginPage = () => {
  const { user, signInWithGoogle, signInWithEmailPassword, loading, configError, configured } = useAuth()
  const location = useLocation()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [emailError, setEmailError] = useState<string | null>(null)
  const [emailLoading, setEmailLoading] = useState(false)

  const qaAuthEnabled = useMemo(() => new URLSearchParams(location.search).get('qaAuth') === '1', [location.search])

  if (user) {
    return <Navigate to={`/b/${defaultBoardId}`} replace />
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
            <div className="qa-form-header">
              <h2>QA Sign-In</h2>
              <span className="qa-badge">Testing Only</span>
            </div>
            <label htmlFor="qa-email">Email address</label>
            <input
              id="qa-email"
              data-testid="qa-email-input"
              type="email"
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
              disabled={loading || emailLoading || !configured}
            >
              {emailLoading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
