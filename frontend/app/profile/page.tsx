'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { useToast } from '@/components/ui/toast'

export default function ProfilePage() {
  const { token, user, signIn } = useAuth()
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
          <p className="eyebrow">ACCOUNT</p>
          <h1>Your profile</h1>
          <p className="subheading">Account details. Only your name can be edited.</p>
        </div>
      </div>
      <div className="panel" style={{ maxWidth: 640 }}>
        <div className="panel-header">
          <div>
            <h2>Account information</h2>
            <p>Identity details managed by the residency system.</p>
          </div>
        </div>
        <form className="panel form-panel" style={{ border: 0, boxShadow: 'none' }} onSubmit={save}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 6 }}>
            <div className="avatar" style={{ width: 44, height: 44, fontSize: 14 }}>
              {user?.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div style={{ color: '#e8e8e8', fontWeight: 600, fontSize: 13 }}>{user?.name}</div>
              <div className="meta">{user?.role}</div>
            </div>
          </div>

          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} />
          </label>

          <div className="info-grid" style={{ gridTemplateColumns: '1fr', marginTop: 4, paddingTop: 14 }}>
            <div className="info-item">
              <span className="k">Email</span>
              <span className="v">{user?.email ?? ''}</span>
            </div>
            <div className="info-item">
              <span className="k">Role</span>
              <span className="v">{user?.role ?? ''}</span>
            </div>
            <div className="info-item">
              <span className="k">Member since</span>
              <span className="v">{user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—'}</span>
            </div>
          </div>

          {error && <p className="form-error">{error}</p>}
          <button className="primary" type="submit" disabled={m.isPending} style={{ justifySelf: 'start' }}>
            {m.isPending ? 'Saving…' : 'Save changes'}
          </button>
        </form>
      </div>
    </Shell>
  )
}