'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { LoadingState } from '@/components/shared/states'

export default function AdminSettingsPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: queryKeys.settings, queryFn: () => api.settings(token!) })
  const [days, setDays] = useState<number | undefined>(undefined)
  const [error, setError] = useState('')

  const m = useMutation({
    mutationFn: (value: number) => api.updateSettings(token!, value),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.settings })
      qc.invalidateQueries({ queryKey: queryKeys.complaints() })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      setError('')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (q.isPending) return <Shell title="Settings"><LoadingState label="Loading settings…" /></Shell>

  const value = days ?? q.data?.overdue_threshold_days ?? 3

  function save(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (!Number.isInteger(value) || value < 1 || value > 365) {
      setError('Overdue threshold must be a whole number between 1 and 365 days.')
      return
    }
    m.mutate(value)
  }

  return (
    <Shell title="Settings">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Settings</h1>
          <p className="subheading">Configure operational thresholds.</p>
        </div>
      </div>
      <form className="panel form-panel" onSubmit={save}>
        <label>
          Overdue threshold (days)
          <input
            type="number"
            min={1}
            max={365}
            step={1}
            value={value}
            onChange={(e) => setDays(e.target.value === '' ? undefined : Number(e.target.value))}
          />
          <small>A complaint is overdue when it remains unresolved beyond this many days. Choose 1 to 365.</small>
        </label>
        {q.error && <p className="form-error">{errorMessage(q.error)}</p>}
        {error && <p className="form-error">{error}</p>}
        {m.isSuccess && !error && <p className="success-message">Settings saved. Overdue calculations update immediately.</p>}
        <button className="primary" type="submit" disabled={m.isPending}>
          {m.isPending ? 'Saving…' : 'Save settings'}
        </button>
      </form>
    </Shell>
  )
}