'use client'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import type { Priority, Status } from '@/lib/types'
import { useToast } from '@/components/ui/toast'

function invalidateComplaintData(qc: ReturnType<typeof useQueryClient>, id: string) {
  qc.invalidateQueries({ queryKey: queryKeys.complaint(id) })
  qc.invalidateQueries({ queryKey: queryKeys.history(id) })
  qc.invalidateQueries({ queryKey: queryKeys.complaints() })
  qc.invalidateQueries({ queryKey: queryKeys.dashboard })
}

export function useComplaintStatusMutation(complaintId: string, token: string) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (body: { status: Status; note?: string }) => api.updateStatus(token, complaintId, body),
    onSuccess: (updated) => {
      invalidateComplaintData(qc, complaintId)
      toast.toast('success', `Status updated to ${updated.status.replace('_', ' ')}.`)
    },
    onError: (err) => {
      toast.toast('error', errorMessage(err))
    },
  })
}

export function useComplaintPriorityMutation(complaintId: string, token: string) {
  const qc = useQueryClient()
  const toast = useToast()
  return useMutation({
    mutationFn: (priority: Priority) => api.updatePriority(token, complaintId, priority),
    onSuccess: (updated) => {
      invalidateComplaintData(qc, complaintId)
      toast.toast('success', `Priority set to ${updated.priority}.`)
    },
    onError: (err) => {
      toast.toast('error', errorMessage(err))
    },
  })
}