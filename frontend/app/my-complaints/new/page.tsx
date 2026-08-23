'use client'
import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { ImagePlus, X } from 'lucide-react'
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
  const [preview, setPreview] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [dragging, setDragging] = useState(false)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

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

  function pickFile(f: File | null) {
    setFile(null)
    if (!f) return
    if (!ALLOWED_TYPES.includes(f.type)) return setError('Photo must be JPEG, PNG, or WEBP.')
    if (f.size > MAX_UPLOAD || f.size === 0) return setError('Photo must be no larger than 5 MB.')
    setError('')
    setFile(f)
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    const clean = description.trim()
    if (!category) return setError('Select a category.')
    if (clean.length < 5 || clean.length > 5000)
      return setError('Description must be between 5 and 5,000 characters.')
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
            rows={7}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the issue — what's wrong, where, and since when?"
          />
          <span className="field-hint">{description.length}/5000 characters</span>
        </label>

        <div>
          <span style={{ display: 'block', marginBottom: 7, color: '#9a9a9a', fontSize: 11 }}>Photo (optional)</span>
          <input
            id="complaint-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
          />
          <label
            htmlFor="complaint-photo"
            className={`upload-zone${dragging ? ' drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault()
              setDragging(false)
              pickFile(e.dataTransfer.files?.[0] ?? null)
            }}
          >
            <ImagePlus size={20} />
            <strong>Drop an image here or click to browse</strong>
            <span className="meta">JPEG, PNG or WEBP · up to 5 MB</span>
          </label>
          {preview && file && (
            <div className="upload-preview">
              <img src={preview} alt="Selected photo preview" />
              <div>
                <strong style={{ color: '#e8e8e8', fontSize: 11 }}>{file.name}</strong>
                <p className="meta" style={{ margin: '3px 0 6px' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB
                </p>
                <button className="text-btn" type="button" onClick={() => setFile(null)}>
                  <X size={13} /> Remove photo
                </button>
              </div>
            </div>
          )}
        </div>

        {(error || m.error) && <p className="form-error">{error || errorMessage(m.error)}</p>}
        <button className="primary" type="submit" disabled={m.isPending}>
          {m.isPending ? 'Submitting…' : 'Submit complaint'}
        </button>
      </form>
    </Shell>
  )
}