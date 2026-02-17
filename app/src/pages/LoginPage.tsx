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
        <h1>CollabBoard MVP-1</h1>
        <p>Sign in to join realtime collaboration and cursor presence.</p>
        {configError && <p className="error-text">{configError}</p>}
        {emailError && <p className="error-text">{emailError}</p>}
        <button
          type="button"
          className="primary-button"
          disabled={loading || !configured}
          data-testid="google-signin-button"
          onClick={() => void signInWithGoogle()}
        >
          Sign in with Google
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
            <h2>QA Email Sign-In</h2>
            <label htmlFor="qa-email">Email</label>
            <input
              id="qa-email"
              data-testid="qa-email-input"
              type="email"
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
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
            <button
              type="submit"
              className="secondary-button"
              data-testid="qa-email-submit"
              disabled={loading || emailLoading || !configured}
            >
              {emailLoading ? 'Signing in...' : 'Sign in with Email'}
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
