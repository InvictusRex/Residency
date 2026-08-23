'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { EmptyState, ErrorState, LoadingState } from '@/components/shared/states'

export default function DashboardPage() {
  const { token } = useAuth()
  const q = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => api.dashboard(token!) })

  return (
    <Shell title="Dashboard">
      <div className="page-heading">
        <div>
          <p className="eyebrow">COMMUNITY OVERVIEW</p>
          <h1>Dashboard</h1>
          <p className="subheading">Operational metrics from the Residency backend.</p>
        </div>
      </div>
      {q.isPending ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="metric-grid">
            <Metric label="Total complaints" value={q.data.total_complaints} icon={<ClipboardList size={17} />} />
            <Metric label="Open" value={q.data.by_status.OPEN} accent icon={<Clock3 size={17} />} />
            <Metric label="In progress" value={q.data.by_status.IN_PROGRESS} icon={<ClipboardList size={17} />} />
            <Metric label="Resolved" value={q.data.by_status.RESOLVED} icon={<CheckCircle2 size={17} />} />
            <Metric label="Overdue" value={q.data.overdue_count} icon={<AlertTriangle size={17} />} />
          </div>
          <section className="panel breakdown">
            <div className="panel-header">
              <div>
                <h2>By category</h2>
                <p>Distribution returned by the API</p>
              </div>
            </div>
            {q.data.by_category.length ? (
              <div className="bars">
                {q.data.by_category.map((c) => (
                  <div className="bar-row" key={c.category_id}>
                    <div>
                      <span>{c.category_name}</span>
                      <b>{c.count}</b>
                    </div>
                    <div className="bar">
                      <i
                        style={{ width: `${q.data.total_complaints ? (c.count / q.data.total_complaints) * 100 : 0}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState title="No data yet" message="Complaint distribution will appear once complaints exist." />
            )}
          </section>
        </>
      )}
    </Shell>
  )
}

function Metric({
  label,
  value,
  accent,
  icon,
}: {
  label: string
  value: number
  accent?: boolean
  icon: React.ReactNode
}) {
  return (
    <div className="metric">
      <div className={accent ? 'metric-icon accent' : 'metric-icon'}>{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>Backend response</small>
      </div>
    </div>
  )
}