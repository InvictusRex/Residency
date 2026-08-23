'use client'
import { useRouter } from 'next/navigation'
import type { Complaint } from '@/lib/types'
import { PriorityBadge, StatusBadge, formatDate } from '@/components/ui/badge'
import { TableStatusActions } from './table-status-actions'

function isOverdue(complaint: Complaint, thresholdDays: number | undefined, now: number): boolean {
  if (complaint.status === 'RESOLVED' || !thresholdDays || thresholdDays <= 0) return false
  const created = new Date(complaint.created_at).getTime()
  return now - created > thresholdDays * 24 * 60 * 60 * 1000
}

export function ComplaintTable({
  items,
  showResident = false,
  admin = false,
  token,
  overdueThresholdDays,
}: {
  items: Complaint[]
  showResident?: boolean
  admin?: boolean
  token: string
  overdueThresholdDays?: number
}) {
  const router = useRouter()
  const now = Date.now()
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Complaint</th>
            {showResident && <th>Resident</th>}
            <th>Status</th>
            <th>Priority</th>
            <th>Created</th>
            {admin && <th aria-label="Actions" />}
          </tr>
        </thead>
        <tbody>
          {items.map((c) => {
            const overdue = isOverdue(c, overdueThresholdDays, now)
            return (
              <tr
                key={c.id}
                className={overdue ? 'row-overdue' : ''}
                onClick={() => router.push(`/complaints/${c.id}`)}
                style={{ cursor: 'pointer' }}
              >
                <td>
                  <div className="complaint-cell">
                    <span className="complaint-id">{c.id}</span>
                    <strong>{c.description.length > 72 ? `${c.description.slice(0, 72)}…` : c.description}</strong>
                    <small>
                      {c.category.name}
                      {overdue && <span className="overdue">Overdue</span>}
                    </small>
                  </div>
                </td>
                {showResident && <td className="resident">{c.resident.name}</td>}
                <td>
                  <StatusBadge value={c.status} />
                </td>
                <td>
                  <PriorityBadge value={c.priority} />
                </td>
                <td className="date">{formatDate(c.created_at)}</td>
                {admin && (
                  <td onClick={(e) => e.stopPropagation()} style={{ textAlign: 'right' }}>
                    <TableStatusActions complaint={c} token={token} />
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}