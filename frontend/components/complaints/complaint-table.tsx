'use client'
import { useRouter } from 'next/navigation'
import type { Complaint } from '@/lib/types'
import { PriorityBadge, StatusBadge, formatDate } from '@/components/ui/badge'

export function ComplaintTable({
  items,
  showResident = false,
}: {
  items: Complaint[]
  showResident?: boolean
}) {
  const router = useRouter()
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
          </tr>
        </thead>
        <tbody>
          {items.map((c) => (
            <tr key={c.id} onClick={() => router.push(`/complaints/${c.id}`)} style={{ cursor: 'pointer' }}>
              <td>
                <div className="complaint-cell">
                  <span className="complaint-id">{c.id}</span>
                  <strong>{c.description.length > 72 ? `${c.description.slice(0, 72)}…` : c.description}</strong>
                  <small>{c.category.name}</small>
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
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}