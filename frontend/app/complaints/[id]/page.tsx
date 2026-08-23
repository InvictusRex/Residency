'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Priority, Status } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { PhotoImage } from '@/components/shared/photo-image'
import { Dialog } from '@/components/ui/dialog'
import { PriorityBadge, StatusBadge, formatDateTime } from '@/components/ui/badge'
import { LoadingState } from '@/components/shared/states'

const ALLOWED: Record<Status, Status[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['RESOLVED'],
  RESOLVED: [],
}

export default function ComplaintDetailPage() {
  const { token, user } = useAuth()
  const params = useParams<{ id: string }>()
  const id = params.id
  const qc = useQueryClient()
  const [statusOpen, setStatusOpen] = useState(false)
  const [dialogError, setDialogError] = useState('')

  const q = useQuery({
    queryKey: queryKeys.complaint(id),
    queryFn: () => api.complaint(token!, id),
    enabled: !!token,
  })
  const h = useQuery({
    queryKey: queryKeys.history(id),
    queryFn: () => api.history(token!, id),
    enabled: !!token,
  })

  const statusMutation = useMutation({
    mutationFn: (body: { status: Status; note?: string }) => api.updateStatus(token!, id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.complaint(id) })
      qc.invalidateQueries({ queryKey: queryKeys.history(id) })
      qc.invalidateQueries({ queryKey: queryKeys.complaints() })
      qc.invalidateQueries({ queryKey: queryKeys.dashboard })
      setStatusOpen(false)
      setDialogError('')
    },
    onError: (err) => setDialogError(errorMessage(err)),
  })

  const priorityMutation = useMutation({
    mutationFn: (priority: Priority) => api.updatePriority(token!, id, priority),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.complaint(id) })
      qc.invalidateQueries({ queryKey: queryKeys.complaints() })
    },
  })

  if (q.isPending) return <Shell title="Complaint"><LoadingState label="Loading complaint…" /></Shell>
  if (q.error)
    return (
      <Shell title="Complaint">
        <div className="panel empty-state">
          <h2>Complaint not found</h2>
          <p>We could not find this complaint.</p>
        </div>
      </Shell>
    )

  const c = q.data
  const isAdmin = user?.role === 'ADMIN'

  return (
    <Shell title="Complaint detail">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPLAINT {c.id}</p>
          <h1>{c.category.name}</h1>
          <p className="subheading">Created {formatDateTime(c.created_at)}</p>
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel form-panel">
          <div className="detail-meta">
            <StatusBadge value={c.status} />
            <PriorityBadge value={c.priority} />
          </div>
          <p>{c.description}</p>
          <small>Updated {formatDateTime(c.updated_at)}</small>
          {c.resolved_at && <small> · Resolved {formatDateTime(c.resolved_at)}</small>}
          <PhotoImage complaintId={c.id} hasPhoto={!!c.photo_url} token={token!} className="complaint-photo" alt={`Photo attached to complaint ${c.id}`} />
          {isAdmin && (
            <div className="admin-actions">
              <label>
                Priority
                <select
                  value={c.priority}
                  onChange={(e) => priorityMutation.mutate(e.target.value as Priority)}
                  disabled={priorityMutation.isPending}
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
              {ALLOWED[c.status].length > 0 && (
                <button className="primary" onClick={() => { setDialogError(''); setStatusOpen(true) }}>
                  Change status
                </button>
              )}
              {priorityMutation.error && <p className="form-error">{errorMessage(priorityMutation.error)}</p>}
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>History</h2>
              <p>Immutable status timeline</p>
            </div>
          </div>
          {h.isPending ? (
            <LoadingState label="Loading history…" />
          ) : h.error ? (
            <p className="form-error">Unable to load history.</p>
          ) : h.data?.items.length ? (
            <ul className="timeline">
              {h.data.items.map((item) => (
                <li key={item.id} className="timeline-item">
                  <span className="timeline-dot" />
                  <div>
                    <StatusBadge value={item.status} />
                    <p>{item.note || 'Status updated'}</p>
                    <small>
                      {item.actor.name} · {formatDateTime(item.created_at)}
                    </small>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="loading-state">No history recorded.</p>
          )}
        </section>
      </div>

      <StatusDialog
        open={statusOpen}
        current={c.status}
        pending={statusMutation.isPending}
        error={dialogError}
        onClose={() => setStatusOpen(false)}
        onSubmit={(next, note) => statusMutation.mutate({ status: next, note: note || undefined })}
      />
    </Shell>
  )
}

function StatusDialog({
  open,
  current,
  pending,
  error,
  onClose,
  onSubmit,
}: {
  open: boolean
  current: Status
  pending: boolean
  error: string
  onClose: () => void
  onSubmit: (next: Status, note: string) => void
}) {
  const [next, setNext] = useState<Status>(ALLOWED[current][0] ?? 'IN_PROGRESS')
  const [note, setNote] = useState('')
  const [localError, setLocalError] = useState('')

  if (!open) return null
  const directResolve = next === 'RESOLVED' && current === 'OPEN'

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Change status"
      description={`Current status: ${current.replace('_', ' ')}`}
    >
      <label>
        New status
        <select value={next} onChange={(e) => setNext(e.target.value as Status)}>
          {ALLOWED[current].map((s) => (
            <option key={s} value={s}>
              {s.replace('_', ' ')}
            </option>
          ))}
        </select>
      </label>
      <label>
        {directResolve ? 'Resolution note (required)' : 'Note (optional)'}
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={directResolve ? 'e.g. Leakage repaired' : 'e.g. Plumber assigned'}
        />
      </label>
      {localError && <p className="form-error">{localError}</p>}
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions">
        <button className="outline" onClick={onClose} disabled={pending}>
          Cancel
        </button>
        <button
          className="primary"
          disabled={pending || (directResolve && note.trim().length === 0)}
          onClick={() => {
            setLocalError('')
            if (directResolve && note.trim().length === 0) {
              setLocalError('A resolution note is required.')
              return
            }
            onSubmit(next, note.trim())
          }}
        >
          {pending ? 'Saving…' : 'Update status'}
        </button>
      </div>
    </Dialog>
  )
}