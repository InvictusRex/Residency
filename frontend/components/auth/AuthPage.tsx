'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, errorMessage, isApiError } from '@/lib/api/client'
import { useAuth } from '@/components/auth-provider'

const RATE_LIMIT_SECONDS = 60

export function AuthPage({ register = false }: { register?: boolean }) {
  const { signIn } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [lockedSeconds, setLockedSeconds] = useState(0)

  useEffect(() => {
    if (lockedSeconds <= 0) return
    const t = setInterval(() => setLockedSeconds((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(t)
  }, [lockedSeconds > 0])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (register) {
        await api.register({ name, email, password })
      }
      const session = await api.login({ email, password })
      signIn(session.access_token, session.user)
      router.replace(session.user.role === 'ADMIN' ? '/dashboard' : '/my-complaints')
    } catch (err) {
      if (isApiError(err) && err.status === 429) {
        setLockedSeconds(RATE_LIMIT_SECONDS)
        setError('Too many attempts. Please wait a moment before trying again.')
      } else {
        setError(errorMessage(err))
      }
    } finally {
      setBusy(false)
    }
  }

  const locked = lockedSeconds > 0

  return (
    <main className="auth-page">
      <div className="auth-form-side">
        <div className="auth-brand">RESIDENCY_</div>
        <p className="auth-sub">
          {register
            ? 'Register a resident identity to access the community portal.'
            : 'System authentication required. Proceed to access control panel.'}
        </p>
        <form className="auth-card" onSubmit={submit}>
          {register && (
            <label>
              <span>Operator [Full Name]</span>
              <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Jane Doe" />
            </label>
          )}
          <label>
            <span>Identifier [Email]</span>
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="operator@residency.sys" />
          </label>
          <label>
            <span>Access Key [Password]</span>
            <input
              required
              minLength={8}
              maxLength={128}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? 'new-password' : 'current-password'}
              placeholder="••••••••"
            />
          </label>
          {register && (
            <p className="muted" style={{ margin: 0 }}>
              Minimum 8 characters with an uppercase letter, a lowercase letter, and a digit.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="primary full" type="submit" disabled={busy || locked}>
            {locked ? `Try again in ${lockedSeconds}s` : busy ? 'Connecting…' : register ? 'Create Account' : 'Authenticate'}
            {!locked && !busy && <span style={{ marginLeft: 4 }}>→</span>}
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Already have an account?' : 'New to Residency?'}{' '}
          <button onClick={() => router.push(register ? '/login' : '/register')}>
            {register ? 'Sign in' : 'Create account'}
          </button>
        </p>
        <div className="auth-secure">
          Secure Connection <span className="dot">● Active</span>
        </div>
      </div>
      <div className="auth-art">
        <div className="art-tag">SECTOR 7G / HIGH DENSITY</div>
        <div className="art-line">Residency control array initialized. Manage maintenance, notices, and community operations from one console.</div>
      </div>
    </main>
  )
}