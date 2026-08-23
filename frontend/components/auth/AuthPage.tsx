'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { api, errorMessage, isApiError } from '@/lib/api/client'
import { useAuth } from '@/components/auth-provider'
import { useTheme } from '@/components/theme-provider'
import { Icon } from '@/components/ui/icon'

const RATE_LIMIT_SECONDS = 60

function AuthThemeSwitch() {
  const { theme, toggle } = useTheme()
  return (
    <div className="theme-switch" role="group" aria-label="Theme">
      <button className={`theme-segment${theme === 'dark' ? ' active' : ''}`} onClick={() => theme !== 'dark' && toggle()} aria-pressed={theme === 'dark'}>
        <Icon name="dark_mode" size={16} />
        Dark
      </button>
      <button className={`theme-segment${theme === 'light' ? ' active' : ''}`} onClick={() => theme !== 'light' && toggle()} aria-pressed={theme === 'light'}>
        <Icon name="light_mode" size={16} />
        Light
      </button>
    </div>
  )
}

export function AuthPage({ register = false }: { register?: boolean }) {
  const { signIn } = useAuth()
  const router = useRouter()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
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
      <div className="auth-theme">
        <AuthThemeSwitch />
      </div>
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
            <div className="auth-input-wrap">
              <span className="input-icon">
                <Icon name="mail" size={20} />
              </span>
              <input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="operator@residency.sys" />
            </div>
          </label>
          <label>
            <span>Access Key [Password]</span>
            <div className="auth-input-wrap">
              <span className="input-icon">
                <Icon name="lock" size={20} />
              </span>
              <input
                required
                minLength={8}
                maxLength={128}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={register ? 'new-password' : 'current-password'}
                placeholder="••••••••"
              />
              <button type="button" className="input-action" onClick={() => setShowPassword((v) => !v)} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                <Icon name={showPassword ? 'visibility_off' : 'visibility'} size={20} />
              </button>
            </div>
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
            {!locked && !busy && <Icon name="arrow_forward" size={18} />}
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
        <div className="auth-corner" aria-hidden="true" />
        <div className="auth-art-inner">
          <div className="art-tag">Sector 7G / High Density</div>
          <div className="art-line">Residency Control Array initialized. Manage maintenance, notices, and community operations from one console.</div>
        </div>
      </div>
    </main>
  )
}