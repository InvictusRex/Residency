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
import AnimatedNumber from '@/components/animations/AnimatedNumber'
import { PageTitle } from '@/components/shared/page-title'
import { Icon } from '@/components/ui/icon'

const PAGE_SIZE = 12

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
  const [categoryId, setCategoryId] = useState('')

  const categories = useQuery({ queryKey: queryKeys.categories, queryFn: () => api.categories(token!) })

  const totalQ = useCount(token, undefined)
  const openQ = useCount(token, 'OPEN')
  const progressQ = useCount(token, 'IN_PROGRESS')
  const resolvedQ = useCount(token, 'RESOLVED')

  const qs = buildComplaintQuery({
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
    category_id: categoryId || undefined,
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
          <PageTitle text="My Complaints" />
          <p className="subheading">Track and manage your submitted facility issues.</p>
        </div>
        <button className="primary" onClick={() => router.push('/my-complaints/new')}>
          Create New Complaint
        </button>
      </div>

      <div className="stat-grid">
        <StatCard label="Total" value={totalQ.data?.total ?? 0} icon="receipt_long" />
        <StatCard label="Submitted" value={openQ.data?.total ?? 0} yellow icon="schedule" />
        <StatCard label="In Progress" value={progressQ.data?.total ?? 0} lime icon="construction" />
        <StatCard label="Resolved" value={resolvedQ.data?.total ?? 0} icon="check_circle" />
      </div>

      <div className="chip-row" role="tablist" aria-label="Filter complaints">
        <button
          className={`chip-btn${categoryId === '' ? ' active' : ''}`}
          onClick={() => {
            setCategoryId('')
            setPage(1)
          }}
          aria-pressed={categoryId === ''}
        >
          All Active
        </button>
        {categories.data?.filter((c) => c.is_active).map((c) => (
          <button
            key={c.id}
            className={`chip-btn${categoryId === c.id ? ' active' : ''}`}
            onClick={() => {
              setCategoryId(c.id)
              setPage(1)
            }}
            aria-pressed={categoryId === c.id}
          >
            {c.name.toUpperCase()}
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
          title={categoryId === '' ? 'No complaints yet' : 'No complaints match'}
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

function StatCard({
  label,
  value,
  yellow,
  lime,
  icon,
}: {
  label: string
  value: number
  yellow?: boolean
  lime?: boolean
  icon: string
}) {
  return (
    <div className={`stat-card${yellow ? ' yellow' : ''}${lime ? ' lime' : ''}`}>
      <span className="stat-icon">
        <Icon name={icon} size={24} fill={yellow || lime} />
      </span>
      <span>{label}</span>
      <strong>
        <AnimatedNumber value={value} />
      </strong>
    </div>
  )
}