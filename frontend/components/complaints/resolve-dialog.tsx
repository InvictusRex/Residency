'use client'
import { useState } from 'react'
import type { Status } from '@/lib/types'
import { errorMessage } from '@/lib/api/client'
import { Dialog } from '@/components/ui/dialog'
import { useComplaintStatusMutation } from './use-complaint-mutations'

export function ResolveDialog({
  open,
  complaintId,
  current,
  token,
  onClose,
}: {
  open: boolean
  complaintId: string
  current: Status
  token: string
  onClose: () => void
}) {
  const [note, setNote] = useState('')
  const [localError, setLocalError] = useState('')
  const mutation = useComplaintStatusMutation(complaintId, token)

  const noteRequired = current === 'OPEN'

  function submit() {
    setLocalError('')
    if (noteRequired && note.trim().length === 0) {
      setLocalError('A resolution note is required when resolving directly from OPEN.')
      return
    }
    mutation.mutate(
      { status: 'RESOLVED', note: note.trim() || undefined },
      {
        onSuccess: () => {
          setNote('')
          onClose()
        },
      },
    )
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Resolve complaint"
      description="Moving this complaint to RESOLVED closes it. It cannot be reopened."
    >
      <label>
        {noteRequired ? 'Resolution note (required)' : 'Resolution note'}
        <textarea
          rows={4}
          autoFocus
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={noteRequired ? 'e.g. Leakage repaired, new washer fitted' : 'e.g. Work completed and verified'}
        />
      </label>
      {(localError || mutation.error) && (
        <p className="form-error">{localError || errorMessage(mutation.error)}</p>
      )}
      <div className="dialog-actions">
        <button className="outline" onClick={onClose} disabled={mutation.isPending}>
          Cancel
        </button>
        <button className="primary" onClick={submit} disabled={mutation.isPending || (noteRequired && note.trim().length === 0)}>
          {mutation.isPending ? 'Resolving…' : 'Resolve complaint'}
        </button>
      </div>
    </Dialog>
  )
}