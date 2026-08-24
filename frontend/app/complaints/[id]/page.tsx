'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams, useRouter } from 'next/navigation'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Priority } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { PhotoImage } from '@/components/shared/photo-image'
import { PriorityBadge, StatusBadge, formatDateTime } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'
import { LoadingState } from '@/components/shared/states'
import { useToast } from '@/components/ui/toast'
import { StatusActions } from '@/components/complaints/status-actions'
import { useComplaintPriorityMutation } from '@/components/complaints/use-complaint-mutations'
import AnimatedContent from '@/components/animations/AnimatedContent'

export default function ComplaintDetailPage() {
  const { token, user } = useAuth()
  const params = useParams<{ id: string }>()
  const id = params.id
  const router = useRouter()

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

  const priorityMutation = useComplaintPriorityMutation(id, token!)
  const isAdmin = user?.role === 'ADMIN'
  const toast = useToast()
  const qc = useQueryClient()
  const [updateNote, setUpdateNote] = useState('')

  const noteMutation = useMutation({
    mutationFn: (note: string) => api.addNote(token!, id, note),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.history(id) })
      qc.invalidateQueries({ queryKey: queryKeys.complaint(id) })
      toast.toast('success', 'Progress update posted.')
      setUpdateNote('')
    },
    onError: (err) => toast.toast('error', errorMessage(err)),
  })

  if (q.isPending)
    return (
      <Shell title="Complaint">
        <LoadingState label="Loading complaint…" />
      </Shell>
    )
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

  return (
    <Shell title="Complaint detail">
      <button className="back-link" onClick={() => router.push(isAdmin ? '/complaints' : '/my-complaints')}>
        <Icon name="arrow_back" size={18} />
        Back to {isAdmin ? 'Complaints' : 'My Complaints'}
      </button>

      <AnimatedContent distance={24} duration={0.6} threshold={0.05}>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Ticket #{c.id.slice(0, 8).toUpperCase()}</p>
          <div className="detail-page-title">
            {c.category.name}
            <StatusBadge value={c.status} />
            <PriorityBadge value={c.priority} />
          </div>
          <p className="ticket-line">
            Filed by {c.resident.name} · Created {formatDateTime(c.created_at)}
          </p>
        </div>
        {isAdmin && <StatusActions complaintId={c.id} current={c.status} token={token!} />}
      </div>
      </AnimatedContent>

      <div className="detail-grid">
        <div style={{ display: 'grid', gap: 16 }}>
          <section className="panel" style={{ padding: 20 }}>
            <div className="section-label" style={{ marginBottom: 10 }}>
              Complaint Description
            </div>
            <p style={{ color: 'var(--text-slate)', fontSize: 14, lineHeight: 1.7, margin: 0 }}>{c.description}</p>
          </section>

          {c.photo_url && (
            <section className="panel" style={{ padding: 20 }}>
              <div className="section-label" style={{ marginBottom: 10 }}>Attachment</div>
              <PhotoImage
                complaintId={c.id}
                hasPhoto={!!c.photo_url}
                token={token!}
                className="complaint-photo"
                alt={`Photo attached to complaint ${c.id}`}
              />
            </section>
          )}

          {isAdmin && (
            <section className="panel" style={{ padding: 20 }}>
              <div className="section-label" style={{ marginBottom: 10 }}>Priority Control</div>
              <div className="admin-actions" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                <label>
                  Set priority
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
                {priorityMutation.error && (
                  <p className="form-error">{priorityMutation.error instanceof Error ? priorityMutation.error.message : 'Unable to update priority.'}</p>
                )}
              </div>
            </section>
          )}
        </div>

        <div style={{ display: 'grid', gap: 16, alignSelf: 'start' }}>
          <section className="panel" style={{ padding: 20 }}>
            <div className="section-label" style={{ marginBottom: 14, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              Reporter Details
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div
                className="side-avatar"
                style={{ width: 46, height: 46, background: 'var(--chip-bg)', color: 'var(--yellow)', fontSize: 13 }}
              >
                {c.resident.name.slice(0, 2).toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-space)', fontWeight: 700, color: 'var(--text-hi)', textTransform: 'uppercase', letterSpacing: '-.3px' }}>
                  {c.resident.name}
                </div>
                <div className="meta mono" style={{ marginTop: 2 }}>{c.resident.email}</div>
              </div>
            </div>
            <div className="info-grid" style={{ gridTemplateColumns: '1fr', marginTop: 14, paddingTop: 14, gap: 12 }}>
              <div className="info-item">
                <span className="k">Created</span>
                <span className="v">{formatDateTime(c.created_at)}</span>
              </div>
              <div className="info-item">
                <span className="k">Last updated</span>
                <span className="v">{formatDateTime(c.updated_at)}</span>
              </div>
              <div className="info-item">
                <span className="k">Resolved</span>
                <span className="v">{c.resolved_at ? formatDateTime(c.resolved_at) : '—'}</span>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2>Status History</h2>
                <p>Immutable audit trail</p>
              </div>
            </div>
            {h.isPending ? (
              <LoadingState label="Loading history…" />
            ) : h.error ? (
              <p className="form-error" style={{ padding: 16 }}>Unable to load history.</p>
            ) : h.data?.items.length ? (
              <ul className="timeline">
                {[...h.data.items].reverse().map((item, i) => (
                  <li key={item.id} className={`timeline-item${i === 0 ? ' latest' : ''}`}>
                    <span className="timeline-dot" />
                    <div>
                      <StatusBadge value={item.status} />
                      <p>{item.note || 'Status updated'}</p>
                      <small>
                        {item.actor.name} · {formatDateTime(item.created_at)}
                      </small>
{isAdmin && c.status !== 'RESOLVED' && (
            <section className="panel" style={{ padding: 20 }}>
              <div className="section-label" style={{ marginBottom: 10 }}>Progress Update</div>
              <p className="meta" style={{ margin: '0 0 12px' }}>
                Post an update while work is in progress. It appears in the status timeline below.
              </p>
              <textarea
                rows={3}
                value={updateNote}
                onChange={(e) => setUpdateNote(e.target.value)}
                placeholder="e.g. Plumber on site, valve replaced…"
                maxLength={2000}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 10 }}>
                <button
                  className="primary"
                  disabled={noteMutation.isPending || updateNote.trim().length === 0}
                  onClick={() => noteMutation.mutate(updateNote.trim())}
                >
                  <Icon name="send" size={16} />
                  {noteMutation.isPending ? 'Posting…' : 'Post update'}
                </button>
              </div>
            </section>
          )}
        </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="loading-state">No history recorded.</p>
            )}
          </section>
        </div>
      </div>
    </Shell>
  )
}