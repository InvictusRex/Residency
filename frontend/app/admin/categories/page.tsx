'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Category } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { Dialog } from '@/components/ui/dialog'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'

export default function AdminCategoriesPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const q = useQuery({ queryKey: queryKeys.categories, queryFn: () => api.categories(token!) })
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const toggleActive = useMutation({
    mutationFn: (c: Category) => api.updateCategory(token!, c.id, { is_active: !c.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.categories }),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.categories })

  return (
    <Shell title="Categories">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Categories</h1>
          <p className="subheading">Manage complaint classifications. Inactive categories cannot be selected by residents.</p>
        </div>
        <button className="primary" onClick={() => setCreateOpen(true)}>
          <Plus size={16} /> New category
        </button>
      </div>
      <section className="panel">
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data?.length ? (
          <div className="notice-list">
            {q.data.map((c) => (
              <div className="category-row" key={c.id}>
                <div>
                  <strong style={{ color: '#ddd', fontSize: 12 }}>
                    {c.name}
                    <span className={`cat-badge ${c.is_active ? 'active' : 'inactive'}`}>
                      {c.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </strong>
                  <p style={{ color: '#777', fontSize: 10, margin: '5px 0 0' }}>
                    {c.description || 'No description'}
                  </p>
                </div>
                <div className="cat-actions">
                  <button onClick={() => setEditing(c)}>Edit</button>
                  {c.is_active ? (
                    <button onClick={() => toggleActive.mutate(c)}>Deactivate</button>
                  ) : (
                    <button onClick={() => toggleActive.mutate(c)}>Activate</button>
                  )}
                  <button className="danger" onClick={() => setDeleting(c)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <EmptyState title="No categories yet" message="Create the first complaint category." />
        )}
      </section>

      <CategoryFormDialog
        key={editing?.id ?? (createOpen ? 'new' : 'closed')}
        open={createOpen || editing !== null}
        category={editing}
        token={token!}
        onClose={() => {
          setCreateOpen(false)
          setEditing(null)
        }}
        onSaved={refresh}
      />
      <ConfirmDeleteCategory
        category={deleting}
        token={token!}
        onClose={() => setDeleting(null)}
        onDeleted={refresh}
      />
    </Shell>
  )
}

function CategoryFormDialog({
  open,
  category,
  token,
  onClose,
  onSaved,
}: {
  open: boolean
  category: Category | null
  token: string
  onClose: () => void
  onSaved: () => void
}) {
  const [name, setName] = useState(category?.name ?? '')
  const [description, setDescription] = useState(category?.description ?? '')
  const [isActive, setIsActive] = useState(category?.is_active ?? true)
  const [error, setError] = useState('')

  const m = useMutation({
    mutationFn: () =>
      category
        ? api.updateCategory(token, category.id, {
            name,
            description: description || null,
            is_active: isActive,
          })
        : api.createCategory(token, { name, description: description || null }),
    onSuccess: () => {
      onSaved()
      onClose()
      setError('')
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (!open) return null

  function submit() {
    setError('')
    if (name.trim().length < 2) {
      setError('Category name must be at least 2 characters.')
      return
    }
    m.mutate()
  }

  return (
    <Dialog open={open} onClose={onClose} title={category ? 'Edit category' : 'Create category'}>
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
      </label>
      <label>
        Description
        <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} rows={4} />
      </label>
      <label className="check-row">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
        Active (residents can select this category)
      </label>
      {error && <p className="form-error">{error}</p>}
      <div className="dialog-actions">
        <button className="outline" onClick={onClose} disabled={m.isPending}>
          Cancel
        </button>
        <button className="primary" onClick={submit} disabled={m.isPending}>
          {m.isPending ? 'Saving…' : category ? 'Save changes' : 'Create category'}
        </button>
      </div>
    </Dialog>
  )
}

function ConfirmDeleteCategory({
  category,
  token,
  onClose,
  onDeleted,
}: {
  category: Category | null
  token: string
  onClose: () => void
  onDeleted: () => void
}) {
  const [error, setError] = useState('')
  const m = useMutation({
    mutationFn: () => api.deleteCategory(token, category!.id),
    onSuccess: () => {
      onDeleted()
      onClose()
    },
    onError: (err) => setError(errorMessage(err)),
  })

  if (!category) return null

  return (
    <Dialog
      open={true}
      onClose={onClose}
      title="Delete category"
      description={`Deactivate "${category.name}"? Existing complaints keep their category.`}
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
          {m.isPending ? 'Deleting…' : 'Deactivate'}
        </button>
      </div>
    </Dialog>
  )
}