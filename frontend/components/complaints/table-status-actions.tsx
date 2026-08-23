'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, ExternalLink, Wrench } from 'lucide-react'
import type { Complaint } from '@/lib/types'
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
      icon: <Wrench size={13} />,
      onSelect: () => startMutation.mutate({ status: 'IN_PROGRESS' }),
    })
    items.push({ label: '—' })
  }
  if (complaint.status === 'OPEN' || complaint.status === 'IN_PROGRESS') {
    items.push({ label: 'Resolve…', icon: <CheckCircle2 size={13} />, onSelect: () => setResolveOpen(true) })
    items.push({ label: '—' })
  }
  items.push({ label: 'View details', icon: <ExternalLink size={13} />, onSelect: () => router.push(`/complaints/${complaint.id}`) })

  return (
    <>
      <Dropdown trigger={<span style={{ fontSize: 16, lineHeight: 1 }}>⋯</span>} ariaLabel="Complaint actions" items={items} />
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