'use client'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api/client'

export function PhotoImage({
  complaintId,
  hasPhoto,
  token,
  alt = 'Complaint photo',
  className,
}: {
  complaintId: string
  hasPhoto: boolean
  token: string
  alt?: string
  className?: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let objectUrl = ''
    setFailed(false)
    setSrc(null)
    if (!hasPhoto || !token) return
    api
      .photo(token, complaintId)
      .then((blob) => {
        objectUrl = URL.createObjectURL(blob)
        setSrc(objectUrl)
      })
      .catch(() => {
        setFailed(true)
      })
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [complaintId, hasPhoto, token])

  if (!hasPhoto) return null
  if (failed) return <p className="muted">Photo unavailable</p>
  if (!src) return <p className="muted">Loading photo…</p>
  return <img className={className} src={src} alt={alt} />
}