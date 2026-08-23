'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api, buildComplaintQuery } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Priority, Sort, Status } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { ComplaintTable } from '@/components/complaints/complaint-table'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { Pagination } from '@/components/shared/pagination'

const PAGE_SIZE = 20

export default function AdminComplaintsPage() {
  const { token } = useAuth()
  const [page, setPage] = useState(1)
  const [categoryId, setCategoryId] = useState('')
  const [status, setStatus] = useState<Status | ''>('')
  const [priority, setPriority] = useState<Priority | ''>('')
  const [overdue, setOverdue] = useState<'' | 'true' | 'false'>('')
  const [sort, setSort] = useState<Sort>('newest')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [rangeError, setRangeError] = useState('')

  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: () => api.categories(token!) })

  const qs = buildComplaintQuery({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    category_id: categoryId || undefined,
    status: status || undefined,
    priority: priority || undefined,
    overdue: overdue === '' ? undefined : overdue === 'true',
    sort,
    date_from: dateFrom || undefined,
    date_to: dateTo || undefined,
  })
  const q = useQuery({
    queryKey: queryKeys.complaints(`admin${qs}`),
    queryFn: () => api.complaints(token!, qs),
  })

  function applyFilters() {
    if (dateFrom && dateTo && dateFrom > dateTo) {
      setRangeError('Start date must be before or equal to the end date.')
      return
    }
    setRangeError('')
    setPage(1)
  }

  return (
    <Shell title="Complaints">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRATION</p>
          <h1>Complaint management</h1>
          <p className="subheading">Triage requests across your residency. Overdue complaints sort to the top.</p>
        </div>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{q.data?.total ?? 0} complaints</h2>
            <p>Fetched from the backend</p>
          </div>
        </div>
        <div className="filters">
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
        ) : q.data?.items.length ? (
          <>
            <ComplaintTable items={q.data.items} showResident />
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState title="No complaints match" message="Try adjusting the filters." />
        )}
      </section>
    </Shell>
  )
}