'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'

export default function ProfilePage() {
  const { token, user, signOut, signIn } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(user?.name ?? '')
  const [error, setError] = useState('')

  const [email, setEmail] = useState(user?.email ?? '')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState('')

  const [curPassword, setCurPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordError, setPasswordError] = useState('')

  const m = useMutation({
    mutationFn: () => api.profile(token!, name.trim()),
    onSuccess: (u) => {
      signIn(token!, u)
      setError('')
      toast.toast('success', 'Profile updated.')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  const emailMutation = useMutation({
    mutationFn: () => api.updateEmail(token!, { email: email.trim(), current_password: emailPassword }),
    onSuccess: (u) => {
      signIn(token!, u)
      setEmailPassword('')
      setEmailError('')
      toast.toast('success', 'Email updated.')
    },
    onError: (err) => setEmailError(errorMessage(err)),
  })

  const passwordMutation = useMutation({
    mutationFn: () =>
      api.changePassword(token!, { current_password: curPassword, new_password: newPassword }),
    onSuccess: () => {
      setCurPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setPasswordError('')
      toast.toast('success', 'Password changed. Use the new password next time you sign in.')
    },
    onError: (err) => setPasswordError(errorMessage(err)),
  })

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (name.trim().length < 2 || name.trim().length > 120) {
      setError('Name must be between 2 and 120 characters.')
      return
    }
    m.mutate()
  }

  function saveEmail(e: React.FormEvent) {
    e.preventDefault()
    setEmailError('')
    if (email.trim() === (user?.email ?? '')) {
      setEmailError('Enter a different email address.')
      return
    }
    if (!emailPassword) {
      setEmailError('Enter your current password to confirm the change.')
      return
    }
    emailMutation.mutate()
  }

  function savePassword(e: React.FormEvent) {
    e.preventDefault()
    setPasswordError('')
    if (!curPassword || !newPassword) {
      setPasswordError('Enter your current and new password.')
      return
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match.')
      return
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setPasswordError('New password must be at least 8 characters with an uppercase letter, a lowercase letter, and a digit.')
      return
    }
    passwordMutation.mutate()
  }

  return (
    <Shell title="Profile">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Your Profile</h1>
          <p className="subheading">Manage your account details and security.</p>
        </div>
      </div>

      <div style={{ maxWidth: 720, display: 'grid', gap: 18 }}>
        <section className="panel" style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingBottom: 18, borderBottom: '1px solid var(--border)' }}>
            <div className="side-avatar" style={{ width: 64, height: 64, fontSize: 18, background: '#4d4632', color: 'var(--yellow)' }}>
              {user?.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'var(--font-space)', fontSize: 22, fontWeight: 700, color: 'var(--text-hi)', letterSpacing: '-.5px' }}>
                  {user?.name}
                </span>
                <span className="cat-badge active">{user?.role}</span>
              </div>
              <p className="meta" style={{ marginTop: 4 }}>
                {user?.created_at ? `Member since ${new Date(user.created_at).toLocaleDateString()}` : ''}
              </p>
            </div>
          </div>

          <form className="form-panel" style={{ padding: '18px 0 0', gap: 16 }} onSubmit={save}>
            <label>
              <span className="field-label">Full Name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" type="submit" disabled={m.isPending} style={{ justifySelf: 'flex-start' }}>
              {m.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </section>

        <section className="panel" style={{ padding: 24 }}>
          <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div className="section-label">Email Address</div>
          </div>
          <form className="form-panel" style={{ padding: '18px 0 0', gap: 16 }} onSubmit={saveEmail}>
            <label>
              <span className="field-label">Email</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              <span className="field-label">Current Password</span>
              <input
                type="password"
                value={emailPassword}
                onChange={(e) => setEmailPassword(e.target.value)}
                autoComplete="current-password"
                placeholder="Required to confirm the change"
              />
            </label>
            {emailError && <p className="form-error">{emailError}</p>}
            <button className="primary" type="submit" disabled={emailMutation.isPending} style={{ justifySelf: 'flex-start' }}>
              {emailMutation.isPending ? 'Updating…' : 'Update Email'}
            </button>
          </form>
        </section>

        <section className="panel" style={{ padding: 24 }}>
          <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div className="section-label">Change Password</div>
          </div>
          <form className="form-panel" style={{ padding: '18px 0 0', gap: 16 }} onSubmit={savePassword}>
            <label>
              <span className="field-label">Current Password</span>
              <input type="password" value={curPassword} onChange={(e) => setCurPassword(e.target.value)} autoComplete="current-password" />
            </label>
            <label>
              <span className="field-label">New Password</span>
              <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <label>
              <span className="field-label">Confirm New Password</span>
              <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} autoComplete="new-password" />
            </label>
            <span className="field-hint" style={{ color: 'var(--text-muted)', fontSize: 12 }}>
              At least 8 characters with an uppercase letter, a lowercase letter, and a digit.
            </span>
            {passwordError && <p className="form-error">{passwordError}</p>}
            <button className="primary" type="submit" disabled={passwordMutation.isPending} style={{ justifySelf: 'flex-start' }}>
              {passwordMutation.isPending ? 'Updating…' : 'Change Password'}
            </button>
          </form>
        </section>

        <section className="panel" style={{ padding: 24 }}>
          <div style={{ paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
            <div className="section-label">Session</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, paddingTop: 16, flexWrap: 'wrap' }}>
            <div>
              <p style={{ color: 'var(--text)', fontWeight: 600, margin: 0 }}>Sign out of this device</p>
              <p className="meta" style={{ margin: '4px 0 0' }}>Ends your current session.</p>
            </div>
            <button
              className="outline"
              style={{ borderColor: 'var(--red)', color: 'var(--red-soft)' }}
              onClick={() => {
                signOut()
                window.location.assign('/login')
              }}
            >
              <Icon name="logout" size={16} />
              Logout
            </button>
          </div>
        </section>
      </div>
    </Shell>
  )
}