'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2 } from 'lucide-react'
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
      <div className="auth-card">
        <div className="brand auth-brand">
          <div className="brand-mark">
            <Building2 size={17} />
          </div>
          <span>residency</span>
        </div>
        <p className="eyebrow">RIVERSIDE RESIDENCY</p>
        <h1>{register ? 'Create resident account' : 'Welcome back'}</h1>
        <p className="subheading">
          {register ? 'Join your community management portal.' : 'Sign in to manage your residency requests.'}
        </p>
        <form onSubmit={submit}>
          {register && (
            <label>
              Full name
              <input required minLength={2} maxLength={120} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
            </label>
          )}
          <label>
            Email
            <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </label>
          <label>
            Password
            <input
              required
              minLength={8}
              maxLength={128}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={register ? 'new-password' : 'current-password'}
            />
          </label>
          {register && (
            <p className="muted">
              Password must be at least 8 characters and include an uppercase letter, a lowercase letter, and a digit.
            </p>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary full" type="submit" disabled={busy || locked}>
            {locked
              ? `Try again in ${lockedSeconds}s`
              : busy
                ? 'Connecting…'
                : register
                  ? 'Create account'
                  : 'Sign in'}
          </button>
        </form>
        <p className="auth-switch">
          {register ? 'Already have an account?' : 'New to Residency?'}{' '}
          <button onClick={() => router.push(register ? '/login' : '/register')}>
            {register ? 'Sign in' : 'Create account'}
          </button>
        </p>
      </div>
    </main>
  )
}