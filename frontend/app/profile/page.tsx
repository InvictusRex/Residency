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

  const m = useMutation({
    mutationFn: () => api.profile(token!, name.trim()),
    onSuccess: (u) => {
      signIn(token!, u)
      setError('')
      toast.toast('success', 'Profile updated.')
    },
    onError: (err) => setError(errorMessage(err)),
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

  return (
    <Shell title="Profile">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Account</p>
          <h1>Your Profile</h1>
          <p className="subheading">Manage your account details and preferences.</p>
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
            <label>
              <span className="field-label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                Email Address <Icon name="lock" size={14} />
              </span>
              <input value={user?.email ?? ''} disabled style={{ opacity: 0.6 }} />
            </label>
            {error && <p className="form-error">{error}</p>}
            <button className="primary" type="submit" disabled={m.isPending} style={{ justifySelf: 'flex-start' }}>
              {m.isPending ? 'Saving…' : 'Save Changes'}
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