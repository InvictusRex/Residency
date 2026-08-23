'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Pin, PinOff, Trash2 } from 'lucide-react'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Notice } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { useToast } from '@/components/ui/toast'

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
    <Shell title="Notice management">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Notice management</h1>
          <p className="subheading">
            Publish official updates to residents. Important notices are pinned and emailed.
          </p>
        </div>
        <button className="primary" onClick={() => setCreateOpen(true)}>
          New notice
        </button>
      </div>
      <section className="panel">
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data?.items.length ? (
          <div className="notice-list">
            {q.data.items.map((n) => (
              <article className={n.is_important ? 'notice important' : 'notice'} key={n.id}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="notice-title">
                    <strong>{n.title}</strong>
                    {n.is_important && <span>IMPORTANT</span>}
                  </div>
                  <p>{n.content}</p>
                  <small>
                    {n.created_by.name} · {new Date(n.created_at).toLocaleDateString()}
                  </small>
                </div>
                <div className="notice-actions">
                  <button
                    title={n.is_important ? 'Unpin' : 'Pin as important'}
                    onClick={() => pinMutation.mutate(n)}
                    aria-label={n.is_important ? 'Unpin notice' : 'Pin notice'}
                  >
                    {n.is_important ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                  <button title="Edit" onClick={() => setEditing(n)} aria-label="Edit notice">
                    <Pencil size={14} />
                  </button>
                  <button title="Delete" onClick={() => setDeleting(n)} aria-label="Delete notice">
                    <Trash2 size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState title="No notices yet" message="Create the first community notice." />
        )}
      </section>

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
        Title
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} autoFocus />
      </label>
      <label>
        Content
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
          style={{ background: '#e53935', color: '#fff' }}
          onClick={() => m.mutate()}
          disabled={m.isPending}
        >
          {m.isPending ? 'Deleting…' : 'Delete'}
        </button>
      </div>
    </Dialog>
  )
}