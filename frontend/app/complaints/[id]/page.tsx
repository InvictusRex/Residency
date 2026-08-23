'use client'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'next/navigation'
import { api } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Priority } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { PhotoImage } from '@/components/shared/photo-image'
import { PriorityBadge, StatusBadge, formatDate, formatDateTime } from '@/components/ui/badge'
import { LoadingState } from '@/components/shared/states'
import { StatusActions } from '@/components/complaints/status-actions'
import { useComplaintPriorityMutation } from '@/components/complaints/use-complaint-mutations'

export default function ComplaintDetailPage() {
  const { token, user } = useAuth()
  const params = useParams<{ id: string }>()
  const id = params.id

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
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMPLAINT {c.id.slice(0, 8)}</p>
          <h1>{c.category.name}</h1>
          <p className="subheading">
            Filed by {c.resident.name} · {formatDate(c.created_at)}
          </p>
        </div>
        {isAdmin && <StatusActions complaintId={c.id} current={c.status} token={token!} />}
      </div>

      <div className="detail-grid">
        <section className="panel form-panel">
          <div className="detail-meta-row">
            <StatusBadge value={c.status} />
            <PriorityBadge value={c.priority} />
          </div>
          <p style={{ color: '#cfcfcf', lineHeight: 1.6, margin: '14px 0 0' }}>{c.description}</p>

          <div className="info-grid">
            <div className="info-item">
              <span className="k">Category</span>
              <span className="v">{c.category.name}</span>
            </div>
            <div className="info-item">
              <span className="k">Resident</span>
              <span className="v">{c.resident.name}</span>
            </div>
            <div className="info-item">
              <span className="k">Resident email</span>
              <span className="v">{c.resident.email}</span>
            </div>
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

          <PhotoImage
            complaintId={c.id}
            hasPhoto={!!c.photo_url}
            token={token!}
            className="complaint-photo"
            alt={`Photo attached to complaint ${c.id}`}
          />

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
            </div>
          )}
        </section>

        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Status history</h2>
              <p>Immutable audit trail</p>
            </div>
          </div>
          {h.isPending ? (
            <LoadingState label="Loading history…" />
          ) : h.error ? (
            <p className="form-error">Unable to load history.</p>
          ) : h.data?.items.length ? (
            <ul className="timeline">
              {[...h.data.items].reverse().map((item, i) => (
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
    </Shell>
  )
}