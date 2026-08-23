import type { Priority, Status } from '@/lib/types'

const STATUS_CLASS: Record<Status, string> = {
  OPEN: 'status-open',
  IN_PROGRESS: 'status-progress',
  RESOLVED: 'status-resolved',
}

const PRIORITY_CLASS: Record<Priority, string> = {
  LOW: 'priority-low',
  MEDIUM: 'priority-medium',
  HIGH: 'priority-high',
}

export function StatusBadge({ value }: { value: Status }) {
  return <span className={`status ${STATUS_CLASS[value]}`}>{value.replace('_', ' ')}</span>
}

export function PriorityBadge({ value }: { value: Priority }) {
  return (
    <span className={`priority ${PRIORITY_CLASS[value]}`}>
      <i />
      {value}
    </span>
  )
}

export function formatDate(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleDateString()
}

export function formatDateTime(value: string): string {
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? value : d.toLocaleString()
}