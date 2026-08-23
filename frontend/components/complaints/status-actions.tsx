'use client'
import { useState } from 'react'
import type { Status } from '@/lib/types'
import { Icon } from '@/components/ui/icon'
import { useComplaintStatusMutation } from './use-complaint-mutations'
import { ResolveDialog } from './resolve-dialog'

export function StatusActions({
  complaintId,
  current,
  token,
  compact = false,
}: {
  complaintId: string
  current: Status
  token: string
  compact?: boolean
}) {
  const [resolveOpen, setResolveOpen] = useState(false)
  const startMutation = useComplaintStatusMutation(complaintId, token)

  if (current === 'RESOLVED') {
    return <span className="muted">Complaint closed</span>
  }

  const canResolve = current === 'OPEN' || current === 'IN_PROGRESS'

  return (
    <>
      <div className={compact ? 'status-actions' : 'status-actions'}>
        {current === 'OPEN' && (
          <button
            className="primary"
            onClick={() => startMutation.mutate({ status: 'IN_PROGRESS' })}
            disabled={startMutation.isPending}
          >
            <Icon name="build" size={16} />
            {startMutation.isPending ? 'Starting…' : 'Start work'}
          </button>
        )}
        {canResolve && (
          <button className="outline" onClick={() => setResolveOpen(true)} disabled={startMutation.isPending}>
            <Icon name="check_circle" size={16} />
            Resolve
          </button>
        )}
      </div>
      <ResolveDialog
        open={resolveOpen}
        complaintId={complaintId}
        current={current}
        token={token}
        onClose={() => setResolveOpen(false)}
      />
    </>
  )
}