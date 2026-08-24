'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Category } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { useToast } from '@/components/ui/toast'
import { PageTitle } from '@/components/shared/page-title'

const CATEGORY_ICONS: Record<string, string> = {
  Plumbing: 'plumbing',
  Electrical: 'electrical_services',
  Security: 'security',
  Cleaning: 'cleaning_services',
  Other: 'category',
}

export default function AdminCategoriesPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const q = useQuery({ queryKey: queryKeys.categories, queryFn: () => api.categories(token!) })
  const [createOpen, setCreateOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [deleting, setDeleting] = useState<Category | null>(null)

  const toggleActive = useMutation({
    mutationFn: (c: Category) => api.updateCategory(token!, c.id, { is_active: !c.is_active }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.categories })
      toast.toast('success', 'Category state updated.')
    },
    onError: (err) => toast.toast('error', errorMessage(err)),
  })

  const refresh = () => qc.invalidateQueries({ queryKey: queryKeys.categories })
  const activeCount = q.data?.filter((c) => c.is_active).length ?? 0

  return (
    <Shell title="Categories">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admin Control Center</p>
          <PageTitle text="Manage Categories" />
          <p className="subheading">Organize issue types for structured reporting.</p>
        </div>
        <button className="primary" onClick={() => setCreateOpen(true)}>
          <Icon name="add" size={18} />
          Add Category
        </button>
      </div>

      <div className="stat-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <StatCard label="Total Categories" value={q.data?.length ?? 0} icon="list_alt" />
        <StatCard label="Active" value={activeCount} icon="check_circle" accent />
      </div>

      <div className="panel">
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data?.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: '28%' }}>Category Name</th>
                  <th>Description</th>
                  <th style={{ textAlign: 'center', width: '120px' }}>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {q.data.map((c) => (
                  <tr key={c.id} className="group" style={c.is_active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="cat-icon">
                          <Icon name={CATEGORY_ICONS[c.name] ?? 'category'} size={18} />
                        </span>
                        <span className="cat-name">{c.name}</span>
                        {!c.is_active && <span className="cat-badge inactive">Inactive</span>}
                      </div>
                    </td>
                    <td className="cat-desc" style={{ margin: 0 }}>{c.description || 'No description'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <label className="switch">
                        <input type="checkbox" checked={c.is_active} onChange={() => toggleActive.mutate(c)} />
                        <span className="switch-slider" />
                      </label>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <div className="row-actions-reveal">
                        <button className="icon-btn" title="Edit" onClick={() => setEditing(c)} aria-label="Edit category">
                          <Icon name="edit" size={18} />
                        </button>
                        <button className="icon-btn danger" title="Delete" onClick={() => setDeleting(c)} aria-label="Delete category">
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
          <EmptyState title="No categories yet" message="Create the first complaint category." />
        )}
      </div>

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

function StatCard({ label, value, icon, accent }: { label: string; value: number; icon: string; accent?: boolean }) {
  return (
    <div className={`stat-card${accent ? ' lime' : ''}`}>
      <span>{label}</span>
      <strong style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {value}
        <Icon name={icon} size={22} />
      </strong>
    </div>
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
  const toast = useToast()

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
      toast.toast('success', category ? 'Category updated.' : 'Category created.')
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
        <span>Name</span>
        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoFocus />
      </label>
      <label>
        <span>Description</span>
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
  const toast = useToast()
  const m = useMutation({
    mutationFn: () => api.deleteCategory(token, category!.id),
    onSuccess: () => {
      onDeleted()
      onClose()
      toast.toast('success', 'Category deactivated.')
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
          style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
          onClick={() => m.mutate()}
          disabled={m.isPending}
        >
          {m.isPending ? 'Deleting…' : 'Deactivate'}
        </button>
      </div>
    </Dialog>
  )
}