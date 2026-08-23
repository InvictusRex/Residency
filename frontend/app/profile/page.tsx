'use client'
import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'

export default function ProfilePage() {
  const { token, user, signIn } = useAuth()
  const [name, setName] = useState(user?.name ?? '')
  const [error, setError] = useState('')

  const m = useMutation({
    mutationFn: () => api.profile(token!, name.trim()),
    onSuccess: (u) => {
      signIn(token!, u)
      setError('')
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
          <p className="subheading">Only your name can be updated through the API.</p>
        </div>
      </div>
      <form className="panel form-panel" onSubmit={save}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} minLength={2} maxLength={120} />
        </label>
        <label>
          Email
          <input value={user?.email ?? ''} disabled className="profile-email" />
        </label>
        <label>
          Role
          <input value={user?.role ?? ''} disabled className="profile-role" />
        </label>
        {error && <p className="form-error">{error}</p>}
        {m.isSuccess && !error && <p className="success-message">Profile updated.</p>}
        <button className="primary" type="submit" disabled={m.isPending}>
          {m.isPending ? 'Saving…' : 'Save changes'}
        </button>
      </form>
    </Shell>
  )
}