'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Complaint } from '@/lib/types'
import { Icon } from '@/components/ui/icon'
import { Dropdown, type DropdownItem } from '@/components/ui/dropdown'
import { useComplaintStatusMutation } from './use-complaint-mutations'
import { ResolveDialog } from './resolve-dialog'

export function TableStatusActions({ complaint, token }: { complaint: Complaint; token: string }) {
  const router = useRouter()
  const [resolveOpen, setResolveOpen] = useState(false)
  const startMutation = useComplaintStatusMutation(complaint.id, token)

  const items: DropdownItem[] = []
  if (complaint.status === 'OPEN') {
    items.push({
      label: 'Start work',
      icon: <Icon name="build" size={16} />,
      onSelect: () => startMutation.mutate({ status: 'IN_PROGRESS' }),
    })
    items.push({ label: '—' })
  }
  if (complaint.status === 'OPEN' || complaint.status === 'IN_PROGRESS') {
    items.push({ label: 'Resolve…', icon: <Icon name="check_circle" size={16} />, onSelect: () => setResolveOpen(true) })
    items.push({ label: '—' })
  }
  items.push({ label: 'View details', icon: <Icon name="open_in_new" size={16} />, onSelect: () => router.push(`/complaints/${complaint.id}`) })

  return (
    <>
      <Dropdown trigger={<Icon name="more_vert" size={20} />} ariaLabel="Complaint actions" items={items} />
      <ResolveDialog
        open={resolveOpen}
        complaintId={complaint.id}
        current={complaint.status}
        token={token}
        onClose={() => setResolveOpen(false)}
      />
    </>
  )
}