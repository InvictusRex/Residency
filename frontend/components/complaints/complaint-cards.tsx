'use client'
import { useRouter } from 'next/navigation'
import type { Complaint } from '@/lib/types'
import { PriorityBadge, StatusBadge, formatDate } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'

export function ComplaintCards({ items }: { items: Complaint[] }) {
  const router = useRouter()
  return (
    <div className="complaint-cards">
      {items.map((c) => (
        <button key={c.id} className="complaint-card" onClick={() => router.push(`/complaints/${c.id}`)}>
          <span className="complaint-card-top">
            <StatusBadge value={c.status} />
            <span className="priority-tag">
              P{['', 'HIGH', 'MED', 'LOW'][['HIGH', 'MEDIUM', 'LOW'].indexOf(c.priority) + 1]} · {c.priority}
            </span>
          </span>
          <span>
            <span className="complaint-card-title">{c.description}</span>
          </span>
          <span className="complaint-card-meta">
            <span>
              <Icon name="folder" size={16} /> {c.category.name}
            </span>
            <span>{formatDate(c.created_at)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}