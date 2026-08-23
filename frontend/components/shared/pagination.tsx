'use client'
import { ChevronLeft, ChevronRight } from 'lucide-react'

export function Pagination({
  page,
  pageSize,
  total,
  onChange,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1
  const to = Math.min(total, page * pageSize)
  return (
    <div className="pagination">
      <span className="pagination-info">
        {from}–{to} of {total}
      </span>
      <div className="pagination-controls">
        <button className="pager-btn" onClick={() => onChange(page - 1)} disabled={page <= 1} aria-label="Previous page">
          <ChevronLeft size={15} />
        </button>
        <span className="pagination-page">
          Page {page} of {pages}
        </span>
        <button className="pager-btn" onClick={() => onChange(page + 1)} disabled={page >= pages} aria-label="Next page">
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}