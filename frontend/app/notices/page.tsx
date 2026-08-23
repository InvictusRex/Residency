'use client'
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { api, buildNoticeQuery } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'
import { Pagination } from '@/components/shared/pagination'
import { formatDate } from '@/components/ui/badge'

const PAGE_SIZE = 20

export default function NoticesPage() {
  const { token } = useAuth()
  const [page, setPage] = useState(1)
  const qs = buildNoticeQuery({ limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })
  const q = useQuery({
    queryKey: queryKeys.notices(qs),
    queryFn: () => api.notices(token!, qs),
  })

  return (
    <Shell title="Notices">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMMUNITY UPDATES</p>
          <h1>Notices</h1>
          <p className="subheading">Official announcements from your community.</p>
        </div>
      </div>
      <section className="panel">
        {q.isPending ? (
          <LoadingState />
        ) : q.error ? (
          <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
        ) : q.data?.items.length ? (
          <>
            <div className="notice-list">
              {q.data.items.map((n) => (
                <article className={n.is_important ? 'notice important' : 'notice'} key={n.id}>
                  <div className="notice-icon">
                    <Bell size={16} />
                  </div>
                  <div>
                    <div className="notice-title">
                      <strong>{n.title}</strong>
                      {n.is_important && <span>IMPORTANT</span>}
                    </div>
                    <p>{n.content}</p>
                    <small>
                      {formatDate(n.created_at)} · {n.created_by.name}
                    </small>
                  </div>
                </article>
              ))}
            </div>
            <Pagination page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />
          </>
        ) : (
          <EmptyState title="No notices yet" message="Check back for community announcements." />
        )}
      </section>
    </Shell>
  )
}