'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Notice } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { useToast } from '@/components/ui/toast'
import { PageTitle } from '@/components/shared/page-title'

export default function AdminNoticesPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: queryKeys.notices(), queryFn: () => api.notices(token!) })
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Notice | null>(null)
  const [deleting, setDeleting] = useState<Notice | null>(null)

  const pinMutation = useMutation({
    mutationFn: (n: Notice) => api.updateNotice(token!, n.id, { is_important: !n.is_important }),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.notices() })
      toast.toast('success', updated.is_important ? 'Notice pinned as important.' : 'Notice unpinned.')
    },
    onError: (err) => toast.toast('error', errorMessage(err)),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.notices() })

  return (
    <Shell title="Notice Management">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admin Control Center</p>
          <PageTitle text="Community Notices" />
          <p className="subheading">Manage announcements, alerts, and community updates. Important notices are pinned and emailed.</p>
        </div>
        <button className="primary" onClick={() => setCreateOpen(true)}>
          <Icon name="add" size={18} />
          Create Notice
        </button>
      </div>

      <div className="panel">
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data?.items.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '55%' }}>Title</th>
                  <th>Author</th>
                  <th>Date</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {q.data.items.map((n) => (
                  <tr key={n.id} className="group">
                    <td style={{ borderLeft: n.is_important ? '2px solid var(--yellow)' : '2px solid transparent' }}>
                      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <div className="notice-pin-cell">
                          {n.is_important && <Icon name="push_pin" size={17} />}
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div className="notice-title">
                            <strong style={{ fontSize: 14 }}>{n.title}</strong>
                            {n.is_important && <span>IMPORTANT</span>}
                          </div>
                          <p className="meta" style={{ margin: '5px 0 0' }}>
                            {n.content.length > 90 ? `${n.content.slice(0, 90)}…` : n.content}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div className="author-chip">
                        <span className="author-initials">{n.created_by.name.slice(0, 2).toUpperCase()}</span>
                        <span>{n.created_by.name}</span>
                      </div>
                    </td>
                    <td className="date">{new Date(n.created_at).toLocaleDateString()}</td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions-reveal">
                        <button className="icon-btn" title={n.is_important ? 'Unpin' : 'Pin as important'} onClick={() => pinMutation.mutate(n)} aria-label="Toggle important">
                          <Icon name="push_pin" size={18} />
                        </button>
                        <button className="icon-btn" title="Edit" onClick={() => setEditing(n)} aria-label="Edit notice">
                          <Icon name="edit" size={18} />
                        </button>
                        <button className="icon-btn danger" title="Delete" onClick={() => setDeleting(n)} aria-label="Delete notice">
                          <Icon name="delete" size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No notices yet" message="Create the first community notice." />
        )}
      </div>

      <NoticeFormDialog
        key={editing?.id ?? (createOpen ? 'new' : 'closed')}
        open={createOpen || editing !== null}
        notice={editing}
        token={token!}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        onSaved={refresh}
      />
      <ConfirmDeleteDialog
        notice={deleting}
        token={token!}
        onClose={() => setDeleting(null)}
        onDeleted={refresh}
      />
    </Shell>
  )
}

function NoticeFormDialog({
  open,
  notice,
  token,
  onClose,
  onSaved,
}: {
  open: boolean
  notice: Notice | null
  token: string
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState(notice?.title ?? '')
  const [content, setContent] = useState(notice?.content ?? '')
  const [important, setImportant] = useState(notice?.is_important ?? false)
  const [error, setError] = useState('')
  const toast = useToast()

  const m = useMutation({
    mutationFn: () =>
      notice
        ? api.updateNotice(token, notice.id, { title, content, is_important: important })
        : api.createNotice(token, { title, content, is_important: important }),
    onSuccess: () => {
      onSaved()
      onClose()
      toast.toast('success', notice ? 'Notice updated.' : 'Notice published.')
      setError('')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (!open) return null

  function submit() {
    setError('')
    if (title.trim().length < 3 || content.trim().length < 3) {
      setError('Title and content must each be at least 3 characters.')
      return
    }
    m.mutate()
  }

  return (
    <Dialog open={open} onClose={onClose} title={notice ? 'Edit notice' : 'Create notice'}>
      <label>
        <span>Title</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
      </label>
      <label>
        <span>Content</span>
        <textarea value={content} onChange={(e) => setContent(e.target.value)} maxLength={20000} rows={7} />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={important} onChange={(e) => setImportant(e.target.checked)} />
        Important (pinned to top; residents are notified by email)
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions">
        <button className="outline" onClick={onClose} disabled={m.isPending}>
          Cancel
        </button>
        <button className="primary" onClick={submit} disabled={m.isPending}>
          {m.isPending ? 'Saving…' : notice ? 'Save changes' : 'Publish notice'}
        </button>
      </div>
    </Dialog>
  )
}

function ConfirmDeleteDialog({
  notice,
  token,
  onClose,
  onDeleted,
}: {
  notice: Notice | null
  token: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [error, setError] = useState('')
  const toast = useToast()
  const m = useMutation({
    mutationFn: () => api.deleteNotice(token, notice!.id),
    onSuccess: () => {
      onDeleted()
      onClose()
      toast.toast('success', 'Notice deleted.')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (!notice) return null

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title="Delete notice"
      description={`Delete "${notice.title}"? This cannot be undone.`}
    >
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions">
        <button className="outline" onClick={onClose} disabled={m.isPending}>
          Cancel
        </button>
        <button
          className="primary"
          style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
          onClick={() => m.mutate()}
          disabled={m.isPending}
        >
          {m.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Dialog>
  )
}