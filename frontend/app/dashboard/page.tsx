'use client'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, ClipboardList, Clock3 } from 'lucide-react'
import { api } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { DashboardSummary } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { ErrorState, LoadingState } from '@/components/shared/states'

const STATUS_META = [
  { key: 'OPEN', label: 'Open', color: '#e0b000' },
  { key: 'IN_PROGRESS', label: 'In progress', color: '#d4d800' },
  { key: 'RESOLVED', label: 'Resolved', color: '#8ea000' },
] as const

export default function DashboardPage() {
  const { token } = useAuth()
  const q = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => api.dashboard(token!) })
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: () => api.settings(token!) })

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
            <Metric label="Open" value={q.data.by_status.OPEN} icon={<Clock3 size={17} />} />
            <Metric label="In progress" value={q.data.by_status.IN_PROGRESS} icon={<ClipboardList size={17} />} />
            <Metric label="Resolved" value={q.data.by_status.RESOLVED} icon={<CheckCircle2 size={17} />} />
            <Metric label="Overdue" value={q.data.overdue_count} accent icon={<AlertTriangle size={17} />} />
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Status distribution</h2>
                  <p>Breakdown of all complaints</p>
                </div>
              </div>
              <StatusBreakdown data={q.data} thresholdDays={settings.data?.overdue_threshold_days} />
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>By category</h2>
                  <p>Distribution returned by the API</p>
                </div>
              </div>
              <CategoryBreakdown data={q.data} />
            </section>
          </div>
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

function StatusBreakdown({ data, thresholdDays }: { data: DashboardSummary; thresholdDays?: number }) {
  const total = Math.max(1, data.total_complaints)
  const sum = data.by_status.OPEN + data.by_status.IN_PROGRESS + data.by_status.RESOLVED
  return (
    <div className="status-breakdown">
      <div className="stacked-bar">
        {STATUS_META.map((s) => (
          <span
            key={s.key}
            style={{ width: `${(data.by_status[s.key] / sum) * 100}%`, background: s.color }}
          />
        ))}
      </div>
      <div className="legend">
        {STATUS_META.map((s) => (
          <div className="legend-row" key={s.key}>
            <i style={{ background: s.color }} />
            <span>{s.label}</span>
            <b>{data.by_status[s.key]}</b>
          </div>
        ))}
      </div>
      <div className="breakdown-total">
        <span>Total</span>
        <b>{data.total_complaints}</b>
      </div>
      {thresholdDays && (
        <p className="muted" style={{ fontSize: 10, margin: '10px 22px 16px' }}>
          Overdue = unresolved beyond {thresholdDays} day{thresholdDays === 1 ? '' : 's'}.
        </p>
      )}
    </div>
  )
}

function CategoryBreakdown({ data }: { data: DashboardSummary }) {
  if (!data.by_category.length) {
    return <p className="loading-state">No complaint data yet.</p>
  }
  return (
    <div className="bars">
      {data.by_category.map((c) => (
        <div className="bar-row" key={c.category_id}>
          <div>
            <span>{c.category_name}</span>
            <b>{c.count}</b>
          </div>
          <div className="bar">
            <i
              style={{ width: `${data.total_complaints ? (c.count / data.total_complaints) * 100 : 0}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}