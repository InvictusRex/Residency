'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { Plus } from 'lucide-react'
import { api, buildComplaintQuery } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Status } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { ComplaintCards } from '@/components/complaints/complaint-cards'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { Pagination } from '@/components/shared/pagination'

const PAGE_SIZE = 20

export default function MyComplaintsPage() {
  const { token } = useAuth()
  const router = useRouter()
  const [page, setPage] = useState(1)
  const [status, setStatus] = useState<Status | ''>('')

  const qs = buildComplaintQuery({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    status: status || undefined,
    sort: 'newest',
  })
  const q = useQuery({
    queryKey: queryKeys.complaints(`resident${qs}`),
    queryFn: () => api.complaints(token!, qs),
  })

  const applyStatus = (next: Status | '') => {
    setStatus(next)
    setPage(1)
  }

  return (
    <Shell title="My complaints">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESIDENT SERVICES</p>
          <h1>My complaints</h1>
          <p className="subheading">Requests and maintenance issues you have reported.</p>
        </div>
        <button className="primary" onClick={() => router.push('/my-complaints/new')}>
          <Plus size={17} /> New complaint
        </button>
      </div>
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{q.data?.total ?? 0} complaints</h2>
            <p>Fetched from the backend</p>
          </div>
          <div className="filters">
            <label>
              Status
              <select value={status} onChange={(e) => applyStatus(e.target.value as Status | '')}>
                <option value="">All</option>
                <option value="OPEN">Open</option>
                <option value="IN_PROGRESS">In progress</option>
                <option value="RESOLVED">Resolved</option>
              </select>
            </label>
          </div>
        </div>
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data?.items.length ? (
          <>
            <ComplaintCards items={q.data.items} />
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState
            title="No complaints yet"
            message="File a new complaint and it will appear here."
            action={
              <button className="primary" onClick={() => router.push('/my-complaints/new')}>
                <Plus size={16} /> New complaint
              </button>
            }
          />
        )}
      </section>
    </Shell>
  )
}