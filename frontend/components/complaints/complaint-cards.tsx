'use client'
import { useRouter } from 'next/navigation'
import { Folder } from 'lucide-react'
import type { Complaint } from '@/lib/types'
import { PriorityBadge, StatusBadge, formatDate } from '@/components/ui/badge'

export function ComplaintCards({ items }: { items: Complaint[] }) {
  const router = useRouter()
  return (
    <div className="complaint-cards">
      {items.map((c) => (
        <button key={c.id} className="complaint-card" onClick={() => router.push(`/complaints/${c.id}`)}>
          <span className="complaint-card-top">
            <StatusBadge value={c.status} />
            <PriorityBadge value={c.priority} />
          </span>
          <span className="complaint-card-title">{c.description}</span>
          <span className="complaint-card-meta">
            <span>
              <Folder size={12} /> {c.category.name}
            </span>
            <span>{formatDate(c.created_at)}</span>
            <span className="mono">{c.id.slice(0, 8)}</span>
          </span>
        </button>
      ))}
    </div>
  )
}