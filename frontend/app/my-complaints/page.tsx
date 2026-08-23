'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api, buildComplaintQuery } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Status } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { ComplaintCards } from '@/components/complaints/complaint-cards'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { Pagination } from '@/components/shared/pagination'

const PAGE_SIZE = 12

const FILTERS: { key: '' | Status; label: string }[] = [
  { key: '', label: 'All Active' },
  { key: 'OPEN', label: 'Submitted' },
  { key: 'IN_PROGRESS', label: 'In Progress' },
  { key: 'RESOLVED', label: 'Resolved' },
]

function useCount(token: string | null, status: Status | undefined) {
  return useQuery({
    queryKey: queryKeys.complaints(`count${status ?? 'all'}`),
    queryFn: () => api.complaints(token!, buildComplaintQuery({ limit: 1, status: status ?? undefined })),
    enabled: !!token,
  })
}

export default function MyComplaintsPage() {
  const { token } = useAuth()
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [filter, setFilter] = useState<'' | Status>('')

  const totalQ = useCount(token, undefined)
  const openQ = useCount(token, 'OPEN')
  const progressQ = useCount(token, 'IN_PROGRESS')
  const resolvedQ = useCount(token, 'RESOLVED')

  const qs = buildComplaintQuery({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    status: filter || undefined,
    sort: 'newest',
  })
  const q = useQuery({
    queryKey: queryKeys.complaints(`resident${qs}`),
    queryFn: () => api.complaints(token!, qs),
  })

  return (
    <Shell title="My Complaints">
      <div className="page-heading">
        <div>
          <p className="eyebrow">Resident Services</p>
          <h1>My Complaints</h1>
          <p className="subheading">Track and manage your submitted facility issues.</p>
        </div>
        <button className="primary" onClick={() => router.push('/my-complaints/new')}>
          Create New Complaint
        </button>
      </div>

      <div className="stat-grid">
        <StatCard label="Total" value={totalQ.data?.total ?? 0} />
        <StatCard label="Submitted" value={openQ.data?.total ?? 0} yellow />
        <StatCard label="In Progress" value={progressQ.data?.total ?? 0} lime />
        <StatCard label="Resolved" value={resolvedQ.data?.total ?? 0} />
      </div>

      <div className="chip-row" role="tablist" aria-label="Filter complaints">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            className={`chip-btn${filter === f.key ? ' active' : ''}`}
            onClick={() => {
              setFilter(f.key)
              setPage(1)
            }}
            aria-pressed={filter === f.key}
          >
            {f.label}
          </button>
        ))}
      </div>

      {q.isPending ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : q.data?.items.length ? (
        <>
          <ComplaintCards items={q.data.items} />
          <div style={{ marginTop: 16 }}>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />
          </div>
        </>
      ) : (
        <EmptyState
          title={filter === '' ? 'No complaints yet' : 'No complaints match'}
          message="File a new complaint and it will appear here."
          action={
            <button className="primary" onClick={() => router.push('/my-complaints/new')}>
              Create New Complaint
            </button>
          }
        />
      )}
    </Shell>
  )
}

function StatCard({ label, value, yellow, lime }: { label: string; value: number; yellow?: boolean; lime?: boolean }) {
  return (
    <div className={`stat-card${yellow ? ' yellow' : ''}${lime ? ' lime' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}