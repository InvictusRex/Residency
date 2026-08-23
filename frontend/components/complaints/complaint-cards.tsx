'use client'
import { useRouter } from 'next/navigation'
import type { Complaint } from '@/lib/types'
import { StatusBadge } from '@/components/ui/badge'
import { Icon } from '@/components/ui/icon'

const PRIORITY_RANK: Record<string, number> = { HIGH: 1, MEDIUM: 2, LOW: 3 }

export function ComplaintCards({ items }: { items: Complaint[] }) {
  const router = useRouter()
  return (
    <div className="complaint-cards">
      {items.map((c) => {
        const p = PRIORITY_RANK[c.priority] ?? 3
        return (
          <button key={c.id} className="complaint-card" onClick={() => router.push(`/complaints/${c.id}`)}>
            <span className="complaint-card-top">
              <StatusBadge value={c.status} />
              <span className="priority-tag">
                P{p} · {c.priority}
              </span>
            </span>
            <span className="complaint-card-title">{c.description}</span>
            <span className="complaint-card-meta">
              <span>
                <Icon name="folder" size={16} /> {c.category.name}
              </span>
              <span>{new Date(c.created_at).toLocaleDateString()}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}