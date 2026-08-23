'use client'
import { useQuery } from '@tanstack/react-query'
import { api, buildComplaintQuery } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { DashboardSummary } from '@/lib/types'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'
import { ErrorState, LoadingState } from '@/components/shared/states'
import { Icon } from '@/components/ui/icon'
import { formatDate } from '@/components/ui/badge'
import AnimatedContent from '@/components/animations/AnimatedContent'
import AnimatedNumber from '@/components/animations/AnimatedNumber'
import BlurText from '@/components/animations/BlurText'

const STATUS_META = [
  { key: 'OPEN', label: 'Open', color: '#84cc16' },
  { key: 'IN_PROGRESS', label: 'In progress', color: '#facc15' },
  { key: 'RESOLVED', label: 'Resolved', color: '#475569' },
] as const

export default function DashboardPage() {
  const { token } = useAuth()
  const q = useQuery({ queryKey: queryKeys.dashboard, queryFn: () => api.dashboard(token!) })
  const settings = useQuery({ queryKey: queryKeys.settings, queryFn: () => api.settings(token!) })
  const feedQ = useQuery({
    queryKey: queryKeys.complaints('feed'),
    queryFn: () => api.complaints(token!, buildComplaintQuery({ limit: 6, sort: 'newest' })),
  })

  return (
    <Shell title="Dashboard">
      <AnimatedContent distance={24} duration={0.6} threshold={0.05}>
        <div className="page-heading">
          <div>
            <p className="eyebrow">Live Data Feed // Residency Status</p>
            <BlurText text="OPERATIONS HUB" className="rb-title" />
            <p className="subheading">Operational metrics from the Residency backend.</p>
          </div>
        </div>
      </AnimatedContent>
      {q.isPending ? (
        <LoadingState />
      ) : q.error ? (
        <ErrorState message={(q.error as Error).message} onRetry={() => q.refetch()} />
      ) : (
        <>
          <div className="metric-grid">
            <Metric label="Total Complaints" value={q.data.total_complaints} icon="receipt_long" />
            <Metric label="Open" value={q.data.by_status.OPEN} accent icon="schedule" />
            <Metric label="In Progress" value={q.data.by_status.IN_PROGRESS} icon="construction" />
            <Metric label="Resolved" value={q.data.by_status.RESOLVED} icon="check_circle" />
            <Metric label="Overdue" value={q.data.overdue_count} warn icon="warning" />
          </div>

          <div className="dashboard-grid">
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Status Distribution</h2>
                  <p>Breakdown of all complaints</p>
                </div>
              </div>
              <StatusBreakdown data={q.data} thresholdDays={settings.data?.overdue_threshold_days} />
            </section>

            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>System Feed</h2>
                  <p>Latest complaints</p>
                </div>
                <span className="chip-btn active" style={{ border: 'none', padding: 0 }}>
                  Live
                </span>
              </div>
              {feedQ.isPending ? (
                <LoadingState label="Loading feed…" />
              ) : feedQ.data?.items.length ? (
                <div className="feed">
                  {feedQ.data.items.map((c) => (
                    <div key={c.id} className={`feed-item${c.status === 'RESOLVED' ? ' resolved' : ''}`}>
                      <span className="feed-dot" />
                      <div className="feed-meta">
                        <span className="feed-time">{formatDate(c.created_at)}</span>
                        <span className="feed-id">#{c.id.slice(0, 6).toUpperCase()}</span>
                      </div>
                      <div className="feed-title">{c.description}</div>
                      <span className="feed-tag">{c.category.name}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="loading-state">No complaints yet.</p>
              )}
            </section>
          </div>

          <section className="panel" style={{ marginTop: 16 }}>
            <div className="panel-header">
              <div>
                <h2>By Category</h2>
                <p>Distribution returned by the API</p>
              </div>
            </div>
            <CategoryBreakdown data={q.data} />
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
  warn,
  icon,
}: {
  label: string
  value: number
  accent?: boolean
  warn?: boolean
  icon: string
}) {
  return (
    <div className={`metric has-icon${accent ? ' accent' : ''}`}>
      <div className="metric-icon">
        <Icon name={icon} size={26} fill={accent || warn} />
      </div>
      <span>{label}</span>
      <strong style={warn ? { color: 'var(--lime-2)' } : undefined}>
        <AnimatedNumber value={value} />
      </strong>
      <small>Backend response</small>
    </div>
  )
}

function Donut({ segments }: { segments: { value: number; color: string }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0)
  const r = 40
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <svg width="112" height="112" viewBox="0 0 112 112" aria-hidden="true">
      <circle cx="56" cy="56" r={r} fill="none" stroke="#262626" strokeWidth="12" />
      {total > 0 &&
        segments
          .filter((s) => s.value > 0)
          .map((s, i) => {
            const len = (s.value / total) * c
            const el = (
              <circle
                key={i}
                cx="56"
                cy="56"
                r={r}
                fill="none"
                stroke={s.color}
                strokeWidth="12"
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={-offset}
                transform="rotate(-90 56 56)"
              />
            )
            offset += len
            return el
          })}
    </svg>
  )
}

function StatusBreakdown({ data, thresholdDays }: { data: DashboardSummary; thresholdDays?: number }) {
  const sum = data.by_status.OPEN + data.by_status.IN_PROGRESS + data.by_status.RESOLVED
  return (
    <div className="status-block">
      <div className="donut-wrap">
        <Donut segments={STATUS_META.map((s) => ({ value: data.by_status[s.key], color: s.color }))} />
        <div className="donut-center">
          <strong>{sum}</strong>
          <span>complaints</span>
        </div>
      </div>
      <div className="status-legend">
        {STATUS_META.map((s) => {
          const count = data.by_status[s.key]
          const pct = sum ? Math.round((count / sum) * 100) : 0
          return (
            <div className="legend-row" key={s.key}>
              <i style={{ background: s.color }} />
              <span>{s.label}</span>
              <b>{count}</b>
              <span className="pct">{pct}%</span>
            </div>
          )
        })}
        {thresholdDays && (
          <p className="meta" style={{ marginTop: 8 }}>
            Overdue = unresolved beyond {thresholdDays} day{thresholdDays === 1 ? '' : 's'}
          </p>
        )}
      </div>
    </div>
  )
}

function CategoryBreakdown({ data }: { data: DashboardSummary }) {
  if (!data.by_category.length) {
    return <p className="loading-state">No complaint data yet.</p>
  }
  const max = Math.max(...data.by_category.map((c) => c.count), 1)
  return (
    <div className="bar-chart">
      <div className="bar-grid" aria-hidden="true">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="bar-grid-line" />
        ))}
      </div>
      <div className="bar-columns">
        {data.by_category.map((c) => {
          const height = Math.max(4, Math.round((c.count / max) * 100))
          return (
            <div className="bar-col" key={c.category_id}>
              <span className="bar-count">{c.count}</span>
              <div className="bar-col-track">
                <i style={{ height: `${height}%` }} />
              </div>
              <span className="bar-label" title={c.category_name}>
                {c.category_name}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}