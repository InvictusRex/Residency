'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, buildComplaintQuery } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Complaint, ComplaintQuery, Priority, Sort, Status } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { ComplaintTable } from '@/components/complaints/complaint-table'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { Pagination } from '@/components/shared/pagination'
import { Icon } from '@/components/ui/icon'
import { useToast } from '@/components/ui/toast'
import BlurText from '@/components/animations/BlurText'

const PAGE_SIZE = 20

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`
}

export default function AdminComplaintsPage() {
  const { token } = useAuth()
  const toast = useToast()
  const [page, setPage] = useState(1)
  const [exporting, setExporting] = useState(false)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [overdue, setOverdue] = useState<'' | 'true' | 'false'>('')
  const [sort, setSort] = useState<Sort>('triage')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rangeError, setRangeError] = useState('')

  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: () => api.categories(token!) })
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: () => api.settings(token!) })

  function currentParams(): ComplaintQuery {
    return {
      category_id: categoryId || undefined,
      status: status || undefined,
      priority: priority || undefined,
      overdue: overdue === '' ? undefined : overdue === 'true',
      sort,
      date_from: dateFrom || undefined,
      date_to: dateTo || undefined,
    }
  }

  const qs = buildComplaintQuery({ ...currentParams(), limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const q = useQuery({
    queryKey: queryKeys.complaints(`admin${qs}`),
    queryFn: () => api.complaints(token!, qs),
  })

  const qsTrim = search.trim().toLowerCase()
  const visibleItems = qsTrim
    ? (q.data?.items ?? []).filter((c) =>
        [c.id, c.description, c.category.name, c.resident.name, c.resident.email, c.status, c.priority]
          .join(' ')
          .toLowerCase()
          .includes(qsTrim),
      )
    : (q.data?.items ?? [])

  function applyFilters() {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setRangeError('Start date must be before or equal to the end date.')
      return
    }
    setRangeError('')
    setPage(1)
  }

  async function exportCsv() {
    if (!token) return
    setExporting(true)
    try {
      const all: Complaint[] = []
      const limit = 100
      for (let offset = 0; ; offset += limit) {
        const res = await api.complaints(token, buildComplaintQuery({ ...currentParams(), limit, offset }))
        all.push(...res.items)
        if (offset + limit >= res.total || res.items.length === 0) break
      }
      if (!all.length) {
        toast.toast('info', 'No complaints to export.')
        return
      }
      const header = ['ID', 'Category', 'Resident', 'Resident Email', 'Description', 'Status', 'Priority', 'Created At', 'Resolved At']
      const rows = all.map((c) => [
        c.id,
        c.category.name,
        c.resident.name,
        c.resident.email,
        c.description,
        c.status,
        c.priority,
        c.created_at,
        c.resolved_at ?? '',
      ])
      const csv = [header, ...rows].map((r) => r.map((v) => csvEscape(String(v))).join(',')).join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `complaints-${new Date().toISOString().slice(0, 10)}.csv`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
      toast.toast('success', `Exported ${all.length} complaints.`)
    } catch {
      toast.toast('error', 'Export failed. Please try again.')
    } finally {
      setExporting(false)
    }
  }

  return (
    <Shell title="Complaints">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Admin Control Center</p>
          <BlurText text="Complaint Management" className="rb-title" />
          <p className="subheading">Monitor and resolve resident issues with high-visibility tracking.</p>
        </div>
        <button className="outline" onClick={exportCsv} disabled={exporting}>
          <Icon name="download" size={18} />
          {exporting ? 'Exporting…' : 'Export CSV'}
        </button>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>
              {qsTrim ? `${visibleItems.length} shown of ` : ''}
              {q.data?.total ?? 0} complaints
            </h2>
            <p>Fetched from the backend</p>
          </div>
        </div>
        <div className="filters">
          <div className="search" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="search" size={18} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search ID, title, resident…"
              aria-label="Search complaints"
              style={{ border: 'none', background: 'transparent', color: 'var(--text)', width: '100%', outline: 'none' }}
            />
          </div>
          <label>
            Category
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">All</option>
              {categories.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as Status | '')}>
              <option value="">All</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In progress</option>
              <option value="RESOLVED">Resolved</option>
            </select>
          </label>
          <label>
            Priority
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority | '')}>
              <option value="">All</option>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label>
            Overdue
            <select value={overdue} onChange={(e) => setOverdue(e.target.value as '' | 'true' | 'false')}>
              <option value="">All</option>
              <option value="true">Overdue only</option>
              <option value="false">Not overdue</option>
            </select>
          </label>
          <label>
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)}>
              <option value="triage">Triage (Open first)</option>
              <option value="newest">Newest</option>
              <option value="oldest">Oldest</option>
              <option value="priority">Priority</option>
            </select>
          </label>
          <label>
            From
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
          </label>
          <label>
            To
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
          </label>
          <div className="filter-actions">
            <button className="primary" onClick={applyFilters}>
              Apply
            </button>
          </div>
        </div>
        {rangeError && (
          <p className="form-error" style={{ padding: '0 18px 4px' }}>
            {rangeError}
          </p>
        )}
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : visibleItems.length ? (
          <>
            <ComplaintTable
              items={visibleItems}
              showResident
              admin
              token={token!}
              overdueThresholdDays={settings.data?.overdue_threshold_days}
            />
            {!qsTrim && <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />}
          </>
        ) : (
          <EmptyState
            title={qsTrim ? 'No complaints match your search' : 'No complaints match'}
            message={qsTrim ? 'Try a different search term or clear the filters.' : 'Try adjusting the filters.'}
          />
        )}
      </section>
    </Shell>
  )
}