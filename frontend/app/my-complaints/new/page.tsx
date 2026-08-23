'use client'
import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { api, errorMessage } from '@/lib/api/client'
import { queryKeys } from '@/lib/query-keys'
import { useAuth } from '@/components/auth-provider'
import { Shell } from '@/components/shell'

const MAX_UPLOAD = 5 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp']

export default function NewComplaintPage() {
  const { token } = useAuth()
  const router = useRouter()
  const qc = useQueryClient()
  const cats = useQuery({ queryKey: queryKeys.categories, queryFn: () => api.categories(token!) })
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState('')

  const m = useMutation({
    mutationFn: () => {
      const form = new FormData()
      form.append('category_id', category)
      form.append('description', description.trim())
      if (file) form.append('photo', file)
      return api.createComplaint(token!, form)
    },
    onSuccess: (c) => {
      qc.invalidateQueries({ queryKey: queryKeys.complaints() })
      router.push(`/complaints/${c.id}`)
    },
  })

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const clean = description.trim()
    if (!category) return setError('Select a category.')
    if (clean.length < 5 || clean.length > 5000) return setError('Description must be between 5 and 5,000 characters.')
    if (file && (!ALLOWED_TYPES.includes(file.type) || file.size > MAX_UPLOAD || file.size === 0))
      return setError('Photo must be JPEG, PNG, or WEBP and no larger than 5 MB.')
    m.mutate()
  }

  return (
    <Shell title="New complaint">
      <div className="page-heading">
        <div>
          <p className="eyebrow">RESIDENT SERVICES</p>
          <h1>New complaint</h1>
          <p className="subheading">Send a maintenance request to your residency team.</p>
        </div>
      </div>
      <form className="panel form-panel" onSubmit={submit}>
        <label>
          Category
          <select value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Select category</option>
            {cats.data?.filter((c) => c.is_active).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Description
          <textarea
            rows={8}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue…"
          />
          <small>{description.length}/5000</small>
        </label>
        <label>
          Photo (optional)
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {file && (
            <small>
              {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB
              <button type="button" className="text-btn" onClick={() => setFile(null)}>
                Remove
              </button>
            </small>
          )}
        </label>
        {(error || m.error) && <p className="form-error">{error || errorMessage(m.error)}</p>}
        <button className="primary" type="submit" disabled={m.isPending}>
          {m.isPending ? 'Submitting…' : 'Submit complaint'}
        </button>
      </form>
    </Shell>
  )
}