'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { User } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { Dialog } from '@/components/ui/dialog'
import { Icon } from '@/components/ui/icon'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { Pagination } from '@/components/shared/pagination'
import { useToast } from '@/components/ui/toast'

const PAGE_SIZE = 20

export default function AdminResidentsPage() {
  const { token } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<'' | 'active' | 'inactive'>('')
  const [deactivating, setDeactivating] = useState<User | null>(null)

  const qs = `?limit=${PAGE_SIZE}&offset=${(page - 1) * PAGE_SIZE}${status === '' ? '' : `&is_active=${status === 'active'}`}`
  const q = useQuery({
    queryKey: queryKeys.residents(`admin${qs}`),
    queryFn: () => api.adminResidents(token!, qs),
  })

  const toggleActive = useMutation({
    mutationFn: (r: User) => api.setResidentActive(token!, r.id, !r.is_active),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.residents() })
      toast.toast('success', updated.is_active ? `${updated.name} activated.` : `${updated.name} deactivated.`)
      setDeactivating(null)
    },
    onError: (err) => toast.toast('error', errorMessage(err)),
  })

  return (
    <Shell title="Residents">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admin Control Center</p>
          <h1>Residents</h1>
          <p className="subheading">Manage resident accounts. Deactivated residents cannot sign in.</p>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>{q.data?.total ?? 0} residents</h2>
            <p>Fetched from the backend</p>
          </div>
          <div className="chip-row" style={{ border: 'none', margin: 0, gap: 6 }}>
            {(
              [
                { key: '', label: 'All' },
                { key: 'active', label: 'Active' },
                { key: 'inactive', label: 'Inactive' },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                className={`chip-btn${status === f.key ? ' active' : ''}`}
                onClick={() => {
                  setStatus(f.key)
                  setPage(1)
                }}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data?.items.length ? (
          <>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Resident</th>
                    <th>Status</th>
                    <th>Joined</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {q.data.items.map((r) => (
                    <tr key={r.id} className="group" style={r.is_active ? undefined : { opacity: 0.55 }}>
                      <td>
                        <div className="resident-cell">
                          <span>{r.name}</span>
                          <small>{r.email}</small>
                        </div>
                      </td>
                      <td>
                        <span className={`cat-badge ${r.is_active ? 'active' : 'inactive'}`}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="date">{new Date(r.created_at).toLocaleDateString()}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row-actions-reveal">
                          {r.is_active ? (
                            <button className="icon-btn danger" title="Deactivate" onClick={() => setDeactivating(r)} aria-label="Deactivate resident">
                              <Icon name="block" size={18} />
                            </button>
                          ) : (
                            <button className="icon-btn" title="Activate" onClick={() => toggleActive.mutate(r)} aria-label="Activate resident">
                              <Icon name="check_circle" size={18} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState title="No residents found" message="Registered residents will appear here." />
        )}
      </div>

      <Dialog
        open={deactivating !== null}
        onClose={() => setDeactivating(null)}
        title="Deactivate resident"
        description={`Deactivate ${deactivating?.name ?? ''}? They will no longer be able to sign in.`}
      >
        <div className="dialog-actions">
          <button className="outline" onClick={() => setDeactivating(null)} disabled={toggleActive.isPending}>
            Cancel
          </button>
          <button
            className="primary"
            style={{ background: 'var(--red)', color: '#fff', borderColor: 'var(--red)' }}
            onClick={() => deactivating && toggleActive.mutate(deactivating)}
            disabled={toggleActive.isPending}
          >
            {toggleActive.isPending ? 'Deactivating…' : 'Deactivate'}
          </button>
        </div>
      </Dialog>
    </Shell>
  )
}