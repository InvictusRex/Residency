'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { LoadingState } from '@/components/shared/states'
import { useToast } from '@/components/ui/toast'
import { Icon } from '@/components/ui/icon'
import { PageTitle } from '@/components/shared/page-title'

export default function AdminSettingsPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
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
      toast.toast('success', 'Overdue threshold saved.')
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
          <p className="eyebrow">Admin Control Center</p>
          <PageTitle text="Operational Configuration" />
          <p className="subheading">Adjust global platform parameters and thresholds.</p>
        </div>
      </div>
      <div className="panel settings-section" style={{ maxWidth: 640, position: 'relative', overflow: 'hidden' }}>
        <div className="settings-accent" aria-hidden="true" />
        <div className="panel-header">
          <div>
            <h2>Overdue detection</h2>
            <p>Configure when a complaint is considered overdue.</p>
          </div>
        </div>
        <form className="panel form-panel" style={{ border: 0, boxShadow: 'none' }} onSubmit={save}>
          <label>
            <span className="field-label">Overdue Threshold (Days)</span>
            <div className="settings-input-wrap">
              <input
                type="number"
                min={1}
                max={365}
                step={1}
                value={value}
                onChange={(e) => setDays(e.target.value === '' ? undefined : Number(e.target.value))}
              />
              <span className="input-icon">
                <Icon name="calendar_month" size={20} />
              </span>
            </div>
            <span className="field-hint">
              A complaint is flagged as overdue in the dashboard when it remains unresolved beyond this many days.
              Choose 1 to 365. Default is 3 days.
            </span>
          </label>
          {q.error && <p className="form-error">{errorMessage(q.error)}</p>}
          {error && <p className="form-error">{error}</p>}
          <button className="primary" type="submit" disabled={m.isPending}>
            {m.isPending ? 'Saving…' : 'Update Settings'}
          </button>
        </form>
      </div>
    </Shell>
  )
}